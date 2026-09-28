import os
import time
import base64
from typing import Optional
from celery import shared_task
from django.db import transaction
from imaging.models import ImageJob, GeneratedImage
import requests
import logging

logger = logging.getLogger(__name__)


def _choose_engine_from_prompt(prompt: str) -> str:
    p = (prompt or '').lower()
    if 'anime' in p or 'ghibli' in p or 'manga' in p:
        return 'anime'
    return 'real'


def _call_stability(prompt: str, engine_hint: str, negative_prompt: Optional[str] = None) -> Optional[str]:
    api_key = os.environ.get('STABILITY_API_KEY')
    if not api_key:
        return None
    try:
        # Minimal Stability API v2beta call; returns image as base64 or binary.
        # We request a hosted URL to avoid storing files; if not supported, this
        # function can be extended to upload to object storage and return URL.
        # Try binary image response first (current Stability endpoint)
        url = 'https://api.stability.ai/v2beta/stable-image/generate/core'
        headers_img = {
            'Authorization': f'Bearer {api_key}',
            'Accept': 'image/*',
        }
        files = { 'none': (None, '') }
        # Allow model and aspect ratio via env (defaults tuned for portrait)
        model = os.environ.get('STABILITY_ENGINE', 'core')
        # Stability supports only these aspect ratios
        allowed_ars = { '21:9','16:9','3:2','5:4','1:1','4:5','2:3','9:16','9:21' }
        aspect = os.environ.get('STABILITY_AR', '4:5')
        # Normalize some common inputs
        if aspect == '3:4':
            aspect = '4:5'
        if aspect not in allowed_ars:
            aspect = '4:5'
        # Style preset: make anime outputs more consistent
        style_preset_env = os.environ.get('STABILITY_STYLE', '').strip().lower()
        if style_preset_env:
            style_preset = style_preset_env
        else:
            style_preset = 'anime' if engine_hint == 'anime' else 'photographic'

        data = {
            'prompt': prompt,
            'output_format': 'png',
            'model': model,
            'aspect_ratio': aspect,
            'style_preset': style_preset,
        }
        if negative_prompt:
            data['negative_prompt'] = negative_prompt
        resp = requests.post(url, headers=headers_img, files=files, data=data, timeout=60)
        if resp.status_code == 200:
            ctype = resp.headers.get('Content-Type', 'image/png')
            b64 = base64.b64encode(resp.content).decode('ascii')
            return f'data:{ctype};base64,{b64}'
        else:
            logger.warning("Stability binary response %s: %s", resp.status_code, resp.text[:300])

        # Fallback: JSON response with base64 artifacts
        headers_json = {
            'Authorization': f'Bearer {api_key}',
            'Accept': 'application/json',
        }
        resp = requests.post(url, headers=headers_json, files=files, data=data, timeout=60)
        if resp.status_code == 200 and resp.headers.get('Content-Type','').startswith('application/json'):
            js = resp.json()
            arts = js.get('artifacts') or []
            for a in arts:
                b64 = a.get('base64') or a.get('image')
                if isinstance(b64, str) and len(b64) > 20:
                    return f'data:image/png;base64,{b64}'
        else:
            logger.warning("Stability JSON response %s: %s", resp.status_code, resp.text[:300])
        return None
    except Exception:
        return None


def _call_webui(prompt: str, negative_prompt: Optional[str] = None) -> Optional[str]:
    base = os.environ.get('SD_WEBUI_URL', '').rstrip('/')
    if not base:
        return None
    try:
        # Map aspect_ratio ~4:5 to reasonable size within common VRAM
        width, height = 512, 640
        payload = {
            'prompt': prompt,
            'negative_prompt': negative_prompt or '',
            'width': width,
            'height': height,
            'steps': int(os.environ.get('SD_STEPS', '25')),
            'cfg_scale': float(os.environ.get('SD_CFG', '6.5')),
            'sampler_name': os.environ.get('SD_SAMPLER', 'DPM++ 2M Karras'),
        }
        # Optional model override by style via env handled at caller
        resp = requests.post(f"{base}/sdapi/v1/txt2img", json=payload, timeout=120)
        if resp.status_code != 200:
            logger.warning("WebUI txt2img %s: %s", resp.status_code, resp.text[:200])
            return None
        js = resp.json()
        imgs = js.get('images') or []
        if not imgs:
            return None
        b64 = imgs[0]
        if isinstance(b64, str) and len(b64) > 20:
            return f"data:image/png;base64,{b64}"
        return None
    except Exception as e:
        logger.exception("WebUI call failed: %s", e)
        return None

@shared_task(bind=True)
def generate_image_job(self, job_id: int, opts: Optional[dict] = None, **kwargs):
    # Backward/forward compatible: Celery may pass opts as kw only
    if opts is None and isinstance(kwargs, dict):
        opts = kwargs.get('opts')
    try:
        with transaction.atomic():
            job = ImageJob.objects.select_for_update().get(id=job_id)
            job.status = "running"
            job.progress = 1
            job.save(update_fields=["status", "progress"])

        # Resolve provider from env; if API key present, default to stability
        provider = (os.environ.get('TXT2IMG_PROVIDER', '') or '').strip().lower()
        if not provider or provider == 'auto':
            provider = 'stability' if os.environ.get('STABILITY_API_KEY') else 'stub'
        engine = _choose_engine_from_prompt(job.prompt or '')
        negative_prompt = None
        style_override = None
        if opts:
            negative_prompt = opts.get('negative_prompt') or None
            sty = opts.get('style')
            if isinstance(sty, str):
                style_override = 'anime' if sty.lower() == 'anime' else 'real'

        # Progress start
        for p in (10, 25, 45):
            time.sleep(0.2)
            ImageJob.objects.filter(id=job_id).update(progress=p)

        result_url: Optional[str] = None

        if provider == 'stability':
            logger.info("[image-job:%s] Using Stability provider engine=%s", job_id, style_override or engine)
            result_url = _call_stability(job.prompt or '', style_override or engine, negative_prompt)
        elif provider == 'webui':
            logger.info("[image-job:%s] Using SD WebUI provider", job_id)
            # Optionally switch models via hacky /sdapi/v1/options if env provided
            try:
                base = (os.environ.get('SD_WEBUI_URL') or '').rstrip('/')
                if base:
                    model_name = None
                    if (style_override or engine) == 'anime':
                        model_name = os.environ.get('SD_MODEL_ANIME')
                    else:
                        model_name = os.environ.get('SD_MODEL_REAL')
                    if model_name:
                        requests.post(f"{base}/sdapi/v1/options", json={'sd_model_checkpoint': model_name}, timeout=30)
            except Exception:
                pass
            result_url = _call_webui(job.prompt or '', negative_prompt)

        # Add other providers here as needed (replicate, local-webui, etc.)

        if not result_url:
            if provider in ('stability', 'webui'):
                # Explicit provider requested but failed → mark as failed
                raise RuntimeError('stability_call_failed')
            # Dev fallback when provider is stub/auto and nothing worked
            for p in (65, 85, 100):
                time.sleep(0.25)
                ImageJob.objects.filter(id=job_id).update(progress=p)
            result_url = "/girl.jpg"

        ImageJob.objects.filter(id=job_id).update(status="done", result_url=result_url, progress=100)

        # Optionally record historical image for gallery
        try:
            job = ImageJob.objects.get(id=job_id)
            GeneratedImage.objects.create(user=job.user, model=job.model, url=result_url, prompt=job.prompt)
        except Exception:
            pass

        return {"status": "done", "result_url": result_url}
    except Exception as e:
        ImageJob.objects.filter(id=job_id).update(status="failed", error=str(e))
        raise
