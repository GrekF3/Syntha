# -*- coding: utf-8 -*-
"""
image_gen_pro.py — финальная, подчистенная версия модуля генерации
с точной фиксацией лица (FaceID) и аккуратными настройками под 8 ГБ VRAM.

Ключи:
- Надёжная фиксация лица через IP-Adapter Face (SD1.5). Опционально InstantID/FaceSwap.
- Внешний VAE для моделей *noVAE* (например, Realistic Vision v6 B1 noVAE).
- Корректные ресайзы (fit+pad) на кратность 8, минимизация артефактов.
- Рекомендуемые сэмплеры: EulerDiscrete (по умолчанию) и DPM++ 2M Karras (переключаемый).
- Контролируемая сила в img2img (низкая при портретах для идентичности).
- ControlNet OpenPose (аккуратно отключается на full body).
- Режим экономии VRAM: CPU offload, attention slicing, генерация детерминируемая seed-ом.
- Чистая архитектура: единые билдеры промтов, пайпов и апскейла.

Требования:
  torch>=2.2, diffusers>=0.35.1, transformers>=4.44, accelerate>=0.33,
  safetensors, pillow, controlnet-aux (опц), insightface (опц), realesrgan (опц)

"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from datetime import datetime
from typing import Callable, Dict, Optional, Tuple, Any, List

import os
import random
import numpy as np
import torch
import warnings
from PIL import Image, ImageOps
from enum import Enum

from diffusers import (
    # старые импорты можно оставить для обратной совместимости
    StableDiffusionPipeline,
    StableDiffusionImg2ImgPipeline,
    EulerDiscreteScheduler,
    DPMSolverMultistepScheduler,
    # новые универсальные пайпы (SDXL/SD1.5 выбирается автоматически по репо)
    AutoPipelineForText2Image,
    AutoPipelineForImage2Image,
    )
try:
    from diffusers import StableDiffusionXLControlNetImg2ImgPipeline
except Exception:
    StableDiffusionXLControlNetImg2ImgPipeline = None

warnings.filterwarnings("ignore")

# ---------- Опциональные импорты ----------
try:
    from diffusers.models import AutoencoderKL
except Exception:
    AutoencoderKL = None  # VAE не обязателен

try:
    from realesrgan import RealESRGANer
    _HAS_REALESRGAN = True
except Exception:
    _HAS_REALESRGAN = False

try:
    import insightface
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align
    _HAS_INSIGHTFACE = True
except Exception:
    _HAS_INSIGHTFACE = False

try:
    from diffusers import (
        ControlNetModel,
        StableDiffusionControlNetImg2ImgPipeline,
    )
    _HAS_CONTROLNET = True
except Exception:
    _HAS_CONTROLNET = False

try:
    from controlnet_aux import OpenposeDetector
    _HAS_OPENPOSE = True
except Exception:
    _HAS_OPENPOSE = False

# =========================
# Типы/конфиг
# =========================
class Mode(str, Enum):
    anime = "anime"
    realistic = "realistic"

class Category(str, Enum):
    avatar = "avatar"   # SFW
    nsfw = "nsfw"       # NSFW

class GenType(str, Enum):
    portrait = "portrait"        # готовый портрет (упрощённая обёртка над t2i)
    text2img = "text2img"        # общий t2i
    img2img = "img2img"          # img2img

class Sampler(str, Enum):
    euler = "euler"              # EulerDiscreteScheduler — стабильно держит FaceID
    dpmpp2m = "dpmpp2m"          # DPM++ 2M Karras — чуть резче, лучше детали

class FaceIDMode(str, Enum):
    ip_adapter = "ip_adapter"     # мягкая фиксация (рекомендовано, универсально)
    none = "none"                  # без фиксации

class GeneratorProfile(str, Enum):
    realistic_male = "realistic_male"
    realistic_female = "realistic_female"
    anime_female = "anime_female"
    anime_male = "anime_male"

@dataclass
class SizePreset:
    base_width: int = 576         # базовое латентное разрешение (делится на 8)
    base_height: int = 1024
    final_width: int = 1080       # финальный канвас
    final_height: int = 1920

@dataclass
class UpscaleConfig:
    enabled: bool = True
    esrgan_weights: Dict[str, str] = field(default_factory=lambda: {
        "realistic": "weights/RealESRGAN_x4.pth",
        "anime": "weights/realesr-animevideov3.pth",
    })

@dataclass
class PipelineConfig:
    # --- Профильные SDXL чекпойнты (можно менять под вкус/лицензии) ---
    realistic_repo_male: str = "RunDiffusion/Juggernaut-XL-v9"
    realistic_repo_female: str = "SG161222/RealVisXL_V5.0"
    anime_repo_female: str = "bluepen5805/blue_pencil-XL"
    anime_repo_male: str = "LyliaEngine/Pony_Diffusion_V6_XL"

    # Классические SD1.5 чекпойнты (для простых режимов)
    anime_repo: str = "runwayml/stable-diffusion-v1-5"
    realistic_repo: str = "runwayml/stable-diffusion-v1-5"


    # Внешний VAE для SDXL (рекомендуется fp16 fix)
    vae_repo_sdxl: Optional[str] = "madebyollin/sdxl-vae-fp16-fix"


    # IP-Adapter SDXL Face
    ip_adapter_repo: str = "h94/IP-Adapter"
    ip_adapter_subfolder: str = "models"
    ip_adapter_weight_face_sdxl: str = "ip-adapter-face_sdxl.safetensors"
    ip_adapter_scale: float = 0.6


    # ControlNet OpenPose (SDXL)
    controlnet_openpose_sdxl: Optional[str] = "thibaud/controlnet-openpose-sdxl-1.0"

    # ControlNet OpenPose (SD 1.5)
    controlnet_openpose: Optional[str] = "lllyasviel/sd-controlnet-openpose"


    # Устройство/числа
    device: str = "cuda"
    torch_dtype: str = "float16" # "float16" | "float32"
    disable_safety_checker: bool = True
    enable_model_cpu_offload: bool = True
    use_attention_slicing: bool = True


    # Cэмплинг
    steps: int = 38
    guidance: float = 4.8
    sampler: Sampler = Sampler.dpmpp2m
    seed: Optional[int] = None
    callback_steps: int = 5


    # Пути
    output_dir: str = "./images"
    filename_prefix: str = "gen_img"

@dataclass
class PromptConfig:
    quality_booster_sfw: str = (
        "masterpiece, best quality, ultra-detailed, highres, HDR, realistic lighting"
    )
    quality_booster_nsfw: str = (
        "masterpiece, best quality, ultra-detailed, highres, photorealistic lighting, skin texture"
    )
    negative_common: str = (
        "bad anatomy, worst quality, low quality, lowres, blurry, jpeg artifacts, "
        "watermark, text, logo, extra limbs, deformed, missing fingers, fused fingers, "
        "bad proportions, oversaturated"
    )
    negative_no_minors: str = (
        "child, kid, toddler, teen, juvenile, loli, shota, young-looking, school uniform"
    )


@dataclass
class LoraSpec:
    repo_or_path: str          # путь к .safetensors или repo HF
    weight_name: Optional[str] = None  # если внутри несколько файлов
    adapter_name: str = "lora" # уникальное имя адаптера
    scale: float = 0.5         # вес адаптера в set_adapters

# Тип колбэка прогресса
ProgressCB = Callable[[Dict[str, Any]], None]

# =========================
# Утилиты
# =========================

def _ts() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def _divisible8(w: int, h: int) -> Tuple[int, int]:
    return max(8, (w // 8) * 8), max(8, (h // 8) * 8)


def _set_seed(seed: Optional[int]):
    if seed is None:
        return
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    random.seed(seed)
    np.random.seed(seed)


def _dtype(cfg: PipelineConfig) -> torch.dtype:
    return torch.float16 if cfg.torch_dtype == "float16" else torch.float32


def _device(cfg: PipelineConfig) -> torch.device:
    return torch.device(cfg.device)


def _disable_safety(pipe):
    if not hasattr(pipe, "safety_checker"):
        return
    def _dummy(images, **kwargs):
        return images, [False] * len(images)
    pipe.safety_checker = _dummy


def _fit_with_pad(img: Image.Image, target: Tuple[int, int], fill=(128, 128, 128)) -> Image.Image:
    """Масштабирование с сохранением пропорций + паддинг под нужный размер."""
    tw, th = target
    img = ImageOps.exif_transpose(img.convert("RGB"))
    ratio = min(tw / img.width, th / img.height)
    new_w, new_h = int(img.width * ratio), int(img.height * ratio)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGB", (tw, th), fill)
    canvas.paste(resized, ((tw - new_w) // 2, (th - new_h) // 2))
    return canvas


def _center_face_crop(img: Image.Image, size: int = 224) -> Image.Image:
    """Простой квадратный центр-кроп для лица — фолбэк при отсутствии InsightFace."""
    s = min(img.width, img.height)
    left = (img.width - s) // 2
    top = (img.height - s) // 2
    crop = img.crop((left, top, left + s, top + s))
    return crop.resize((size, size), Image.LANCZOS)

def _apply_loras(pipe, loras: List[LoraSpec]):
    if not loras:
        return
    existing = set(pipe.get_active_adapters() or [])
    names, weights = [], []
    for i, spec in enumerate(loras):
        name = spec.adapter_name
        if name in existing:
            # уже загружена — просто активируем с весом
            names.append(name)
            weights.append(spec.scale)
        else:
            pipe.load_lora_weights(
                spec.repo_or_path,
                weight_name=spec.weight_name,
                adapter_name=name,
            )
            names.append(name)
            weights.append(spec.scale)
    pipe.set_adapters(names, adapter_weights=weights)

def _is_sdxl_repo(repo_id: str) -> bool:
    return "xl" in repo_id.lower() # грубая эвристика — достаточно для роутинга

def _maybe_load_vae_any(vae_repo: Optional[str], cfg_dtype: torch.dtype):
    if AutoencoderKL is None or not vae_repo:
        return None
    try:
        return AutoencoderKL.from_pretrained(vae_repo, torch_dtype=cfg_dtype)
    except Exception:
        return None

def _maybe_load_vae(cfg: PipelineConfig, repo: str):
    """Возвращает VAE только когда это уместно (SDXL + указан внешний VAE).
    Если не удалось загрузить — вернёт None, и пайп загрузит встроенный VAE.
    """
    use_sdxl = _is_sdxl_repo(repo)
    return _maybe_load_vae_any(cfg.vae_repo_sdxl if use_sdxl else None, _dtype(cfg))

def _repo_for(profile: GeneratorProfile, cfg: PipelineConfig) -> str:
    if profile == GeneratorProfile.realistic_male:
        return cfg.realistic_repo_male
    if profile == GeneratorProfile.realistic_female:
        return cfg.realistic_repo_female
    if profile == GeneratorProfile.anime_female:
        return cfg.anime_repo_female
    if profile == GeneratorProfile.anime_male:
        return cfg.anime_repo_male
    raise ValueError(f"Unknown profile: {profile}")

class _PipelineCacheXL:
    def __init__(self):
        self.t2i: Dict[str, Any] = {}
        self.i2i: Dict[str, Any] = {}
        self.control_i2i: Dict[str, Any] = {}

CACHE_XL = _PipelineCacheXL()

def _load_t2i_profile(profile: GeneratorProfile, cfg: PipelineConfig):
    repo = _repo_for(profile, cfg)
    if repo in CACHE_XL.t2i:
        return CACHE_XL.t2i[repo]


    vae = _maybe_load_vae(cfg, repo)
    kwargs = {"torch_dtype": _dtype(cfg)}
    if vae is not None:
        kwargs["vae"] = vae
    pipe = AutoPipelineForText2Image.from_pretrained(repo, **kwargs)


    pipe = _prepare_common(pipe, cfg)
    CACHE_XL.t2i[repo] = pipe
    return pipe




def _load_i2i_profile(profile: GeneratorProfile, cfg: PipelineConfig):
    repo = _repo_for(profile, cfg)
    if repo in CACHE_XL.i2i:
        return CACHE_XL.i2i[repo]

    vae = _maybe_load_vae(cfg, repo)
    kwargs = {"torch_dtype": _dtype(cfg)}
    if vae is not None:
        kwargs["vae"] = vae
    pipe = AutoPipelineForImage2Image.from_pretrained(repo, **kwargs)

    pipe = _prepare_common(pipe, cfg)
    CACHE_XL.i2i[repo] = pipe
    return pipe




def _load_controlnet_i2i_profile(profile: GeneratorProfile, cfg: PipelineConfig):
    repo = _repo_for(profile, cfg)
    use_sdxl = _is_sdxl_repo(repo)
    if not _HAS_CONTROLNET:
        return None
    if not use_sdxl or cfg.controlnet_openpose_sdxl is None or StableDiffusionXLControlNetImg2ImgPipeline is None:
        return None


    if repo in CACHE_XL.control_i2i:
        return CACHE_XL.control_i2i[repo]


    control = ControlNetModel.from_pretrained(cfg.controlnet_openpose_sdxl, torch_dtype=_dtype(cfg))
    vae = _maybe_load_vae(cfg, repo)
    kwargs = {"controlnet": control, "torch_dtype": _dtype(cfg)}
    if vae is not None:
        kwargs["vae"] = vae
    pipe = StableDiffusionXLControlNetImg2ImgPipeline.from_pretrained(repo, **kwargs)


    pipe = _prepare_common(pipe, cfg)
    CACHE_XL.control_i2i[repo] = pipe
    return pipe     
# =========================
# Промты
# =========================

def build_prompts(
    mode: Mode,
    category: Category,
    user_prompt: Optional[str],
    appearance: Optional[str],
    base_prompt: Optional[str],
    negative_prompt: Optional[str],
    pcfg: PromptConfig,
    apply_category_suffix: bool = True,
) -> Tuple[str, str]:
    booster = pcfg.quality_booster_sfw if category == Category.avatar else pcfg.quality_booster_nsfw
    parts: List[str] = [booster]
    parts.append("anime style, clean lines, detailed shading" if mode == Mode.anime else "photorealistic, cinematic light")
    if appearance:
        parts.append(appearance.strip())
    if user_prompt:
        parts.append(user_prompt.strip())
    if base_prompt:
        parts.append(base_prompt.strip())
    if apply_category_suffix:
        parts.append("SFW, neutral background" if category == Category.avatar else "NSFW, adult, 21yo, explicit content allowed")
    prompt = ", ".join([p for p in parts if p])

    negs = [pcfg.negative_common, pcfg.negative_no_minors]
    if negative_prompt:
        negs.append(negative_prompt.strip())
    negative = ", ".join(negs)
    return prompt, negative

# =========================
# Кэш пайпов/детекторов
# =========================
class _PipelineCache:
    def __init__(self):
        self._t2i: Dict[Mode, StableDiffusionPipeline] = {}
        self._i2i: Dict[Mode, StableDiffusionImg2ImgPipeline] = {}
        self._control_i2i: Dict[Mode, StableDiffusionControlNetImg2ImgPipeline] = {}
        self._openpose: Optional[Any] = None
        self._insight_app: Optional[FaceAnalysis] = None

CACHE = _PipelineCache()

# =========================
# Лоадеры
# =========================

def _pick_scheduler(pipe, sampler: Sampler):
    if sampler == Sampler.euler:
        try:
            pipe.scheduler = EulerDiscreteScheduler.from_config(pipe.scheduler.config)
        except Exception:
            pass
    elif sampler == Sampler.dpmpp2m:
        try:
            pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
        except Exception:
            pass


def _prepare_common(pipe, cfg: PipelineConfig):
    _pick_scheduler(pipe, cfg.sampler)
    if cfg.disable_safety_checker:
        _disable_safety(pipe)
    if cfg.enable_model_cpu_offload:
        try:
            pipe.enable_model_cpu_offload()
        except Exception:
            try:
                pipe.enable_sequential_cpu_offload()
            except Exception:
                pass
    if cfg.use_attention_slicing:
        try:
            pipe.enable_attention_slicing()
        except Exception:
            pass
    return pipe



def _load_t2i(mode: Mode, cfg: PipelineConfig) -> StableDiffusionPipeline:
    if mode in CACHE._t2i:
        return CACHE._t2i[mode]
    repo = cfg.anime_repo if mode == Mode.anime else cfg.realistic_repo
    vae = _maybe_load_vae(cfg, repo)
    kwargs = {"torch_dtype": _dtype(cfg)}
    if vae is not None:
        kwargs["vae"] = vae
    pipe = StableDiffusionPipeline.from_pretrained(repo, **kwargs).to(_device(cfg))
    pipe = _prepare_common(pipe, cfg)
    CACHE._t2i[mode] = pipe
    return pipe


def _load_i2i(mode: Mode, cfg: PipelineConfig) -> StableDiffusionImg2ImgPipeline:
    if mode in CACHE._i2i:
        return CACHE._i2i[mode]
    repo = cfg.anime_repo if mode == Mode.anime else cfg.realistic_repo
    vae = _maybe_load_vae(cfg, repo)
    kwargs = {"torch_dtype": _dtype(cfg)}
    if vae is not None:
        kwargs["vae"] = vae
    pipe = StableDiffusionImg2ImgPipeline.from_pretrained(repo, **kwargs).to(_device(cfg))
    pipe = _prepare_common(pipe, cfg)
    CACHE._i2i[mode] = pipe
    return pipe


def _load_controlnet_i2i(mode: Mode, cfg: PipelineConfig) -> Optional[StableDiffusionControlNetImg2ImgPipeline]:
    if not _HAS_CONTROLNET or cfg.controlnet_openpose is None:
        return None
    if mode in CACHE._control_i2i:
        return CACHE._control_i2i[mode]
    control = ControlNetModel.from_pretrained(cfg.controlnet_openpose, torch_dtype=_dtype(cfg))
    repo = cfg.anime_repo if mode == Mode.anime else cfg.realistic_repo
    vae = _maybe_load_vae(cfg, repo)
    kwargs = {"controlnet": control, "torch_dtype": _dtype(cfg)}
    if vae is not None:
        kwargs["vae"] = vae
    pipe = StableDiffusionControlNetImg2ImgPipeline.from_pretrained(repo, **kwargs).to(_device(cfg))
    pipe = _prepare_common(pipe, cfg)
    CACHE._control_i2i[mode] = pipe
    return pipe


def _make_openpose(image: Image.Image, target_size: Tuple[int, int], progress: Optional[ProgressCB]) -> Optional[Image.Image]:
    if not _HAS_OPENPOSE:
        return None
    try:
        if progress: progress({"stage": "controlnet", "message": "openpose detect", "pct": 6})
        if CACHE._openpose is None:
            CACHE._openpose = OpenposeDetector.from_pretrained("lllyasviel/ControlNet")
        detector = CACHE._openpose
        pose = detector(image)
        if pose.size != target_size:
            pose = pose.resize(target_size, Image.BILINEAR)
        return pose
    except Exception as e:
        if progress: progress({"stage": "controlnet", "message": f"openpose unavailable: {e}", "pct": 6})
        return None

# =========================
# IP-Adapter Face
# =========================

def _ensure_ip_adapter(pipe, cfg: PipelineConfig) -> bool:
    try:
        pipe.load_ip_adapter(
        cfg.ip_adapter_repo,
        subfolder=cfg.ip_adapter_subfolder,
        weight_name=cfg.ip_adapter_weight_face_sdxl,
        )
        pipe.set_ip_adapter_scale(cfg.ip_adapter_scale)
        return True
    except Exception:
        return False



def _extract_face_crop(img: Image.Image) -> Image.Image:
    if _HAS_INSIGHTFACE:
        try:
            if CACHE._insight_app is None:
                CACHE._insight_app = FaceAnalysis(name="buffalo_l")
                ctx = 0 if torch.cuda.is_available() else -1
                CACHE._insight_app.prepare(ctx_id=ctx, det_size=(640, 640))
            app = CACHE._insight_app
            import cv2
            arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            faces = app.get(arr)
            if faces:
                face = faces[0]
                crop = face_align.norm_crop(arr, landmark=face.kps, image_size=224)
                crop = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                return crop
        except Exception:
            pass
    return _center_face_crop(img, 224)

# =========================
# Апскейл
# =========================

def _maybe_upscale(
    img: Image.Image,
    mode: Mode,
    upcfg: UpscaleConfig,
    target_size: Tuple[int, int],
    progress: Optional[ProgressCB] = None,
) -> Image.Image:
    if not upcfg.enabled:
        return img.resize(target_size, Image.LANCZOS)

    weights = upcfg.esrgan_weights.get(mode.value)
    if _HAS_REALESRGAN and weights and Path(weights).exists():
        try:
            if progress: progress({"stage": "upscale", "message": "Real-ESRGAN x2", "pct": 85})
            device = "cuda" if torch.cuda.is_available() else "cpu"
            upsampler = RealESRGANer(scale=2, model_path=weights, device=device)
            upscaled, _ = upsampler.enhance(np.array(img))
            up_img = Image.fromarray(upscaled)
            if up_img.size != target_size:
                up_img = up_img.resize(target_size, Image.LANCZOS)
            if progress: progress({"stage": "upscale", "message": "done", "pct": 95})
            return up_img
        except Exception as e:
            if progress: progress({"stage": "upscale", "message": f"fallback LANCZOS ({e})", "pct": 85})

    if progress: progress({"stage": "upscale", "message": "PIL LANCZOS", "pct": 85})
    return img.resize(target_size, Image.LANCZOS)

# =========================
# Сервис
# =========================
class GeneratorService:
    def __init__(
        self,
        pipe_cfg: PipelineConfig = PipelineConfig(),
        prompts_cfg: PromptConfig = PromptConfig(),
        size: SizePreset = SizePreset(),
        upscale: UpscaleConfig = UpscaleConfig(),
    ):
        self.cfg = pipe_cfg
        self.prompts_cfg = prompts_cfg
        self.size = size
        self.upscale = upscale

        self.out_dir = Path(self.cfg.output_dir)
        _ensure_dir(self.out_dir)

    # ---------- Публичные API ----------
    def generate_portrait(
        self,
        mode: Mode,
        appearance: str,
        base_prompt: Optional[str] = None,
        negative_prompt: Optional[str] = None,
        progress: Optional[ProgressCB] = None,
        loras: Optional[List[LoraSpec]] = None
    ) -> Dict[str, Any]:
        raise NotImplementedError("generate_img2img_profile is deprecated and unused; use generate_img2img or profile t2i as needed")
        return self._run_text2img(
            mode=mode,
            category=Category.avatar,
            user_prompt=None,
            appearance=appearance,
            base_prompt=base_prompt,
            negative_prompt=negative_prompt,
            progress=progress,
            loras=loras,
        )

    def generate_text2img(
        self,
        mode: Mode,
        category: Category,
        user_prompt: str,
        negative_prompt: Optional[str] = None,
        base_prompt: Optional[str] = None,
        progress: Optional[ProgressCB] = None,
    ) -> Dict[str, Any]:
        return self._run_text2img(
            mode=mode,
            category=category,
            user_prompt=user_prompt,
            appearance=None,
            base_prompt=base_prompt,
            negative_prompt=negative_prompt,
            progress=progress,
        )

    def generate_img2img(
        self,
        mode: Mode,
        init_image_path: str,
        user_prompt: str,
        keep_face: bool = True,
        faceid_mode: FaceIDMode = FaceIDMode.ip_adapter,
        use_controlnet: bool = True,
        strength: float = 0.4,                # по умолчанию ниже — лучше держит идентичность
        steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
        negative_prompt: Optional[str] = None,
        base_prompt: Optional[str] = None,
        progress: Optional[ProgressCB] = None,
    ) -> Dict[str, Any]:
        if progress: progress({"stage": "init", "message": "loading init img", "pct": 0})
        raw_img = Image.open(init_image_path).convert("RGB")
        bw, bh = _divisible8(self.size.base_width, self.size.base_height)
        fw, fh = self.size.final_width, self.size.final_height
        init_img = _fit_with_pad(raw_img, (bw, bh))

        uprompt_lower = (user_prompt or "").lower()
        wants_full_body = any(k in uprompt_lower for k in ["full body", "full-body", "from head to toe", "head to toe"]) or ("full body" in uprompt_lower)

        if wants_full_body and progress:
            progress({"stage": "prep", "message": "layout tuned for full body", "pct": 3})

        prompt, negative = build_prompts(
            mode=mode,
            category=Category.nsfw if "nsfw" in uprompt_lower else Category.avatar,
            user_prompt=user_prompt,
            appearance=None,
            base_prompt=base_prompt,
            negative_prompt=negative_prompt,
            pcfg=self.prompts_cfg,
            apply_category_suffix=False,
        )

        if wants_full_body:
            prompt += ", full body, from head to toe, standing, long shot"
            negative += ", close-up, portrait, upper body, cropped, head only, selfie"

        _set_seed(self.cfg.seed)
        generator = torch.Generator(device=_device(self.cfg)).manual_seed(self.cfg.seed) if self.cfg.seed is not None else None

        # ControlNet: отключаем на full body, включаем на поясе/портрете
        control_pipe = None
        control_image = None
        if use_controlnet and not wants_full_body and _HAS_CONTROLNET:
            control_pipe = _load_controlnet_i2i(mode, self.cfg)
            control_image = _make_openpose(init_img, init_img.size, progress)
            if control_pipe is None or control_image is None:
                if progress: progress({"stage": "controlnet", "message": "disabled (no pipe/map)", "pct": 5})
                control_pipe = None

        if progress: progress({"stage": "generate", "message": "img2img", "pct": 5})

        def _cb(step, timestep, latents):
            if progress and self.cfg.callback_steps > 0:
                pct = 5 + int(75 * (step / max(1, (steps or self.cfg.steps))))
                progress({"stage": "denoise", "step": step, "pct": min(pct, 80)})

        # Подбор силы и шагов
        strength_eff = max(strength, 0.75) if wants_full_body else min(max(strength, 0.25), 0.55)
        eff_steps = steps if steps is not None else self.cfg.steps
        eff_guidance = guidance_scale if guidance_scale is not None else self.cfg.guidance

        # Выбор пайпа
        pipe = control_pipe if control_pipe is not None else _load_i2i(mode, self.cfg)

        # FaceID через IP-Adapter
        used_ip_adapter = False
        face_cond_image = None
        if keep_face and faceid_mode == FaceIDMode.ip_adapter:
            try:
                used_ip_adapter = _ensure_ip_adapter(pipe, self.cfg)
                if used_ip_adapter:
                    face_cond_image = _extract_face_crop(raw_img)
            except Exception:
                used_ip_adapter = False

        call_kwargs = dict(
            prompt=prompt,
            negative_prompt=negative,
            image=init_img,
            num_inference_steps=eff_steps,
            guidance_scale=eff_guidance,
            strength=strength_eff,
            callback=_cb,
            callback_steps=self.cfg.callback_steps,
            generator=generator,
        )

        if used_ip_adapter and face_cond_image is not None and hasattr(pipe, "load_ip_adapter"):
            call_kwargs["ip_adapter_image"] = face_cond_image

        if control_pipe is not None and control_image is not None:
            call_kwargs["control_image"] = control_image

        res = pipe(**call_kwargs)
        img = res.images[0]

        # Сохранение
        small_path = self._save_intermediate(img, bw, bh, tag="i2i")
        if progress: progress({"stage": "save", "message": "initial saved", "pct": 83})

        # Апскейл -> финал
        final_img = _maybe_upscale(img, mode, self.upscale, (fw, fh), progress)
        final_path = self._save_final(final_img, fw, fh, tag="i2i")
        if progress: progress({"stage": "done", "message": "completed", "pct": 100})

        return {
            "small_path": str(small_path),
            "final_path": str(final_path),
            "width": fw,
            "height": fh,
            "mode": mode.value,
            "type": GenType.img2img.value,
            "prompt": prompt,
            "negative": negative,
            "ip_adapter": bool(used_ip_adapter),
            "strength": strength_eff,
            "steps": eff_steps,
        }
    

    def generate_text2img_profile(
        self,
        profile: GeneratorProfile,
        category: Category,
        user_prompt: str,
        negative_prompt: Optional[str] = None,
        base_prompt: Optional[str] = None,
        progress: Optional[ProgressCB] = None,
        loras: Optional[List[LoraSpec]] = None,
    ) -> Dict[str, Any]:
    # Подменяем лоадер
        if progress: progress({"stage": "init", "message": f"load {profile}", "pct": 0})
        bw, bh = _divisible8(self.size.base_width, self.size.base_height)
        fw, fh = self.size.final_width, self.size.final_height


        pipe = _load_t2i_profile(profile, self.cfg)
        _apply_loras(pipe, loras or [])


        seed = self.cfg.seed if self.cfg.seed is not None else random.randint(0, 2**32 - 1)
        _set_seed(seed)
        generator = torch.Generator(device=_device(self.cfg)).manual_seed(seed)


        prompt, negative = build_prompts(
            mode=Mode.anime if "anime" in profile.value else Mode.realistic,
            category=category,
            user_prompt=user_prompt,
            appearance=None,
            base_prompt=base_prompt,
            negative_prompt=negative_prompt,
            pcfg=self.prompts_cfg,
        )


        if progress: progress({"stage": "generate", "message": "text2img", "pct": 5})
        def _cb(step, timestep, latents):
            if progress and self.cfg.callback_steps > 0:
                pct = 5 + int(75 * (step / max(1, self.cfg.steps)))
                progress({"stage": "denoise", "step": step, "pct": min(pct, 80)})


        res = pipe(
            prompt=prompt,
            negative_prompt=negative,
            num_inference_steps=self.cfg.steps,
            guidance_scale=self.cfg.guidance,
            width=bw,
            height=bh,
            callback=_cb,
            callback_steps=self.cfg.callback_steps,
            generator=generator,
        )
        img = res.images[0]


        small_path = self._save_intermediate(img, bw, bh, tag=f"t2i_{profile.value}")
        final_img = _maybe_upscale(img, Mode.anime if "anime" in profile.value else Mode.realistic, self.upscale, (fw, fh), progress)
        final_path = self._save_final(final_img, fw, fh, tag=f"t2i_{profile.value}")


        if progress: progress({"stage": "done", "message": "completed", "pct": 100})
        return {
            "small_path": str(small_path),
            "final_path": str(final_path),
            "width": fw,
            "height": fh,
            "profile": profile.value,
            "type": GenType.text2img.value,
            "prompt": prompt,
            "negative": negative,
        }
    
    def generate_img2img_profile(
        self,
        profile: GeneratorProfile,
        init_image_path: str,
        user_prompt: str,
        keep_face: bool = True,
        use_controlnet: bool = True,
        strength: float = 0.45,
        steps: Optional[int] = None,
        guidance_scale: Optional[float] = None,
        negative_prompt: Optional[str] = None,
        base_prompt: Optional[str] = None,
        progress: Optional[ProgressCB] = None,
    ) -> Dict[str, Any]:
        if progress: progress({"stage": "init", "message": "loading init img", "pct": 0})
        raw_img = Image.open(init_image_path).convert("RGB")
        bw, bh = _divisible8(self.size.base_width, self.size.base_height)
        fw, fh = self.size.final_width, self.size.final_height
        init_img = _fit_with_pad(raw_img, (bw, bh))

        wants_full_body = any(k in (user_prompt or "").lower() for k in ["full body", "full-body", "head to toe"]) \
        or ("full body" in (user_prompt or "").lower())


        prompt, negative = build_prompts(
            mode=Mode.anime if "anime" in profile.value else Mode.realistic,
            category=Category.nsfw if "nsfw" in (user_prompt or "").lower() else Category.avatar,
            user_prompt=user_prompt,
            appearance=None,
            base_prompt=base_prompt,
            negative_prompt=negative_prompt,
            pcfg=self.prompts_cfg,
            apply_category_suffix=False,
        )

        if wants_full_body:
            prompt += ", full body, from head to toe, standing, long shot"
            negative += ", close-up, portrait, upper body, cropped, head only, selfie"


        _set_seed(self.cfg.seed)
        generator = torch.Generator(device=_device(self.cfg)).manual_seed(self.cfg.seed) if self.cfg.seed is not None else None


        control_pipe = None
        control_image = None
        if use_controlnet and not wants_full_body:
            control_pipe = _load_controlnet_i2i_profile(profile, self.cfg)
            if control_pipe is not None:
                control_image = _make_openpose(init_img, init_img.size, progress)


        if progress: progress({"stage": "generate", "message": "img2img", "pct": 5})

        def _cb(step, timestep, latents):
            if progress and self.cfg.callback_steps > 0:
                pct = 5 + int(75 * (step / max(1, (steps or self.cfg.steps))))
                progress({"stage": "denoise", "step": step, "pct": min(pct, 80)})


        strength_eff = max(strength, 0.75) if wants_full_body else min(max(strength, 0.25), 0.55)
        eff_steps = steps if steps is not None else self.cfg.steps
        eff_guidance = guidance_scale if guidance_scale is not None else self.cfg.guidance


        pipe = control_pipe if control_pipe is not None else _load_i2i_profile(profile, self.cfg)


        used_ip_adapter = False
        face_cond_image = None
        if keep_face:
            try:
                used_ip_adapter = _ensure_ip_adapter(pipe, self.cfg)
                if used_ip_adapter:
                    face_cond_image = _extract_face_crop(raw_img)
            except Exception:
                used_ip_adapter = False


        call_kwargs = dict(
            prompt=prompt,
            negative_prompt=negative,
            image=init_img,
            num_inference_steps=eff_steps,
            guidance_scale=eff_guidance,
            strength=strength_eff,
            callback=_cb,
            callback_steps=self.cfg.callback_steps,
            generator=generator,
        )
        if used_ip_adapter and face_cond_image is not None and hasattr(pipe, "load_ip_adapter"):
            call_kwargs["ip_adapter_image"] = face_cond_image
        if control_pipe is not None and control_image is not None:
            call_kwargs["control_image"] = control_image


        res = pipe(**call_kwargs)
        img = res.images[0]


        small_path = self._save_intermediate(img, bw, bh, tag=f"i2i_{profile.value}")
        final_img = _maybe_upscale(img, Mode.anime if "anime" in profile.value else Mode.realistic, self.upscale, (fw, fh), progress)
        final_path = self._save_final(final_img, fw, fh, tag=f"i2i_{profile.value}")
        if progress: progress({"stage": "done", "message": "completed", "pct": 100})


        return {
            "small_path": str(small_path),
            "final_path": str(final_path),
            "width": fw,
            "height": fh,
            "profile": profile.value,
            "type": GenType.img2img.value,
            "prompt": prompt,
            "negative": negative,
            "ip_adapter": bool(used_ip_adapter),
            "strength": strength_eff,
            "steps": eff_steps,
        }

    # ---------- Внутреннее: text2img ----------
    def _run_text2img(
        self,
        mode: Mode,
        category: Category,
        user_prompt: Optional[str],
        appearance: Optional[str],
        base_prompt: Optional[str],
        negative_prompt: Optional[str],
        progress: Optional[ProgressCB],
        loras: Optional[List[LoraSpec]] = None
    ) -> Dict[str, Any]:
        if progress: progress({"stage": "init", "message": "load pipeline", "pct": 0})
        bw, bh = _divisible8(self.size.base_width, self.size.base_height)
        fw, fh = self.size.final_width, self.size.final_height

        pipe = _load_t2i(mode, self.cfg)
        _apply_loras(pipe, loras or [])
        
        if self.cfg.seed is None:
            seed = random.randint(0, 2**32 - 1)
        else:
            seed = self.cfg.seed
        
        _set_seed(self.cfg.seed)
        generator = torch.Generator(device=_device(self.cfg)).manual_seed(seed)

        # ================== DEBUG START ==================
        print("\n" + "="*80)
        print("🔍 DEBUG _run_text2img — входные параметры")
        print(f" Mode:           {mode}")
        print(f" Category:       {category}")
        print(f" User Prompt:    {user_prompt}")
        print(f" Appearance:     {appearance}")
        print(f" Base Prompt:    {base_prompt}")
        print(f" Negative Extra: {negative_prompt}")
        print(f" Loras:          {[l.repo_or_path for l in (loras or [])]}")
        print("-"*80)
        print(" Config:")
        print(f"  Seed:              {self.cfg.seed}")
        print(f"  Steps:             {self.cfg.steps}")
        print(f"  Guidance (CFG):    {self.cfg.guidance}")
        print(f"  Callback steps:    {self.cfg.callback_steps}")
        print(f"  Device:            {self.cfg.device}")
        print(f"  Torch dtype:       {self.cfg.torch_dtype}")
        print(f"  Base size:         {bw}x{bh}")
        print(f"  Final size:        {fw}x{fh}")
        print("="*80 + "\n")
        # ================== DEBUG END ==================

        prompt, negative = build_prompts(
            mode=mode,
            category=category,
            user_prompt=user_prompt,
            appearance=appearance,
            base_prompt=base_prompt,
            negative_prompt=negative_prompt,
            pcfg=self.prompts_cfg,
        )

        if appearance and category == Category.avatar:
            prompt = f"{prompt}, portrait, upper body, neutral background"

        # ================== DEBUG PROMPTS ==================
        print("\n" + "="*80)
        print("📝 Итоговые промты перед генерацией")
        print("-"*80)
        print(f" Prompt:\n{prompt}")
        print("-"*80)
        print(f" Negative:\n{negative}")
        print("="*80 + "\n")
        # ================== DEBUG PROMPTS END ==================

        if progress: progress({"stage": "generate", "message": "text2img", "pct": 5})

        def _cb(step, timestep, latents):
            if progress and self.cfg.callback_steps > 0:
                pct = 5 + int(75 * (step / max(1, self.cfg.steps)))
                progress({"stage": "denoise", "step": step, "pct": min(pct, 80)})

        res = pipe(
            prompt=prompt,
            negative_prompt=negative,
            num_inference_steps=self.cfg.steps,
            guidance_scale=self.cfg.guidance,
            width=bw,
            height=bh,
            callback=_cb,
            callback_steps=self.cfg.callback_steps,
            generator=generator,
        )
        img = res.images[0]

        small_path = self._save_intermediate(img, bw, bh, tag="t2i")
        if progress: progress({"stage": "save", "message": "initial saved", "pct": 83})

        final_img = _maybe_upscale(img, mode, self.upscale, (fw, fh), progress)
        final_path = self._save_final(final_img, fw, fh, tag="t2i")
        if progress: progress({"stage": "done", "message": "completed", "pct": 100})

        # ================== DEBUG RESULT ==================
        print("\n" + "="*80)
        print("✅ Результат генерации")
        print(f" Small image: {small_path}")
        print(f" Final image: {final_path}")
        print(f" Size:        {fw}x{fh}")
        print(f" Mode:        {mode.value}")
        print(f" Category:    {category.value}")
        print("="*80 + "\n")
        # ================== DEBUG RESULT END ==================

        return {
            "small_path": str(small_path),
            "final_path": str(final_path),
            "width": fw,
            "height": fh,
            "mode": mode.value,
            "type": GenType.portrait.value if appearance else GenType.text2img.value,
            "prompt": prompt,
            "negative": negative,
            "category": category.value,
            "seed": seed,
        }

    # ---------- Сохранение ----------
    def _save_intermediate(self, img: Image.Image, w: int, h: int, tag: str) -> Path:
        p = self.out_dir / f"{self.cfg.filename_prefix}_{tag}_{_ts()}_{w}x{h}.png"
        img.save(p)
        return p

    def _save_final(self, img: Image.Image, w: int, h: int, tag: str) -> Path:
        p = self.out_dir / f"{self.cfg.filename_prefix}_{tag}_{_ts()}_{w}x{h}.png"
        img.save(p)
        return p


# =========================
# tests_image_gen_pro.py — минимальные тесты и примеры запуска
# =========================

"""
Запуск:
  python -m tests_image_gen_pro
или
  python tests_image_gen_pro.py

Каждый тест снабжён комментариями к параметрам.
"""

if __name__ == "__main__":
    from pprint import pprint


    def log(cbmsg):
    # cbmsg: {stage, message?, pct?, step?}
        print(cbmsg)


    # ------------------------------
    # Общие настройки для SDXL
    # ------------------------------
    pipe_cfg = PipelineConfig(
        realistic_repo_male="SG161222/RealVisXL_V5.0", # ✔ Реализм, резкость/контраст — мужские портреты/телосложение
        realistic_repo_female="SG161222/RealVisXL_V5.0", # ✔ Фотореализм, мягкая кожа — женские портреты/бьюти
        anime_repo_female="UnfilteredAI/NSFW-GEN-ANIME-v2", # ✔ Аниме SDXL, чистые линии — женские персонажи
        anime_repo_male="UnfilteredAI/NSFW-GEN-ANIME-v2", # ✔ Универсальный SDXL-аниме (в т.ч. мужские персонажи)
        
        vae_repo_sdxl="madebyollin/sdxl-vae-fp16-fix", # ✔ Рекомендуемый VAE для SDXL (устраняет fp16 артефакты)
        ip_adapter_scale=0.6, # ✔ Сила фиксации лица IP-Adapter (0.5–0.75)
        steps=30, # ✔ Кол-во шагов диффузии (SDXL сладкая точка 28–44)
        guidance=7, # ✔ CFG (реализм 4–6; аниме 5–7)
        sampler=Sampler.dpmpp2m, # ✔ DPM++ 2M Karras — детали и стабильность
        seed=None, # ✔ None — рандом; для повторяемости задайте число
        output_dir="./images", # ✔ Папка вывода
        filename_prefix="sdxl_test",
    )


    prompts_cfg = PromptConfig() # ✔ Бустеры качества и базовые негативы
    size = SizePreset(
        base_width=576, base_height=1024, # ✔ Базовое латентное разрешение (кратно 8) — экономит VRAM
        final_width=1080, final_height=1920 # ✔ Финальный канвас под апскейл/постер
    )
    upscale = UpscaleConfig(enabled=False) # ✔ Включить x2 апскейл (RealESRGAN, если веса есть)


    service = GeneratorService(pipe_cfg, prompts_cfg, size, upscale)
    # ------------------------------
    # LoRA-пак для очистки артефактов (подключается ко ВСЕМ тестам)
    # ------------------------------
    loras_cleanup = [
        # Детализация кожи/текста
        LoraSpec("imagepipeline/Detail-Tweaker-XL", None, "detail_xl", 0.35), # Усиливает микродетали без перешарпа
        # Лица
        LoraSpec("ostris/face-helper-sdxl-lora", None, "face_helper", 0.25), # Чище лица, особенно крупные планы
        # Кисти/пальцы
        LoraSpec("Gurusha/sd-hand-model-lora-sdxl", None, "hands_fix", 0.35), # Уменьшает руко-артефакты
        # Anti-artifacts LoRA (используйте токен "wrong" в negative_prompt)
        LoraSpec("minimaxir/sdxl-wrong-lora", None, "wrong", 1.0), # Работает вместе с negative: "wrong"
    ]
    # res1 = service.generate_text2img_profile(
    #     profile=GeneratorProfile.realistic_male, # ✔ Роутинг на Juggernaut XL
    #     category=Category.avatar, # ✔ SFW; для NSFW смените на Category.nsfw
    #     user_prompt=(
    #     # ✔ Описание сцены/персонажа. Для NSFW добавьте префикс "nsfw," и чётко задайте возраст 21yo.
    #         "handsome athletic man, fashion editorial, studio lighting, 85mm lens,"
    #         "sharp jawline, confident gaze, cinematic rim light"
    #     ),
    #     negative_prompt=(
    #     # ✔ Усиленные негативы. Токен "wrong" активирует LoRA minimaxir/sdxl-wrong-lora в минусе.
    #         "wrong, bad anatomy, bad hands, extra digits, watermark, text, logo"
    #     ),
    #     base_prompt=(
    #     # ✔ Контекст стиля/света, повторяемый в серии
    #         "full body, photorealistic, detailed skin texture, soft shadows, color graded"
    #     ),
    #     progress=log,
    #     loras=loras_cleanup, # ✔ Пак LoRA для очистки артефактов
    # )
    
    # pprint(res1)
    # res2 = service.generate_text2img_profile(
    #     profile=GeneratorProfile.realistic_female, # ✔ Роутинг на RealVisXL_V5.0
    #     category=Category.nsfw, # ✔ Разрешить откровенный контент (adult only)
    #     user_prompt=(
    #     "nsfw, 21yo woman, beauty portrait, softbox light, glossy lips,"
    #     " shallow depth of field, skin pores, natural makeup"
    #     ),
    #     negative_prompt=(
    #     "wrong, bad anatomy, (bad hands), deformed, watermark, text, logo"
    #     ),
    #     base_prompt=(
    #     "ultra-detailed, photorealistic lighting, 4k, film grain subtle"
    #     ),
    #     progress=log,
    #     loras=loras_cleanup,
    # )
    # pprint(res2)
    res3 = service.generate_text2img_profile(
        profile=GeneratorProfile.anime_female, # ✔ Роутинг на blue_pencil-XL
        category=Category.nsfw, # ✔ SFW; можно Category.nsfw
        user_prompt=(
        "nsfw, 1girl, anime pink hair, school rooftop at sunset,"
        ),
        negative_prompt=(
        "wrong, extra limbs, deformed hands, text, watermark, lowres"
        ),
        base_prompt=(
        "masterpiece, best quality, vibrant colors, volumetric lighting"
        ),
        progress=log,
        loras=loras_cleanup,
    )
    pprint(res3)


    # ----------------------------------------------------------------------
    # ТЕСТ 4 — Аниме (мужской), NSFW по запросу
    # ----------------------------------------------------------------------
    # res4 = service.generate_text2img_profile(
    #     profile=GeneratorProfile.anime_male, # ✔ Роутинг на Pony Diffusion V6 XL
    #     category=Category.nsfw, # ✔ Включение NSFW по запросу
    #     user_prompt=(
    #     "nsfw, 21yo male, anime, heroic stance, city lights at night,"
    #     " dramatic backlight, cloak fluttering"
    #     ),
    #     negative_prompt=(
    #     "wrong, bad anatomy, extra limbs, text, logo, watermark"
    #     ),
    #     base_prompt=(
    #     "masterpiece, best quality, clean lines, detailed shading"
    #     ),
    #     progress=log,
    #     loras=loras_cleanup,
    # )
    # pprint(res4)
