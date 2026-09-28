from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.serializers import ModelSerializer
from rest_framework.permissions import IsAuthenticated, AllowAny
from imaging.models import GeneratedImage, ImageJob
from imaging.tasks import generate_image_job
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q


class GeneratedImageSerializer(ModelSerializer):
    class Meta:
        model = GeneratedImage
        fields = "__all__"


class ImagePagination(PageNumberPagination):
    page_size = 8
    page_size_query_param = 'page_size'
    max_page_size = 50


class ImageViewSet(viewsets.ModelViewSet):
    serializer_class = GeneratedImageSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ImagePagination

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            qs = GeneratedImage.objects.all().order_by("-created_at")
        else:
            qs = GeneratedImage.objects.filter(user=user).order_by("-created_at")
        qp = self.request.query_params
        model_id = qp.get("model")
        if model_id:
            qs = qs.filter(model_id=model_id)
        nsfw = qp.get('nsfw')
        if nsfw in ('true','1','yes','on'):
            qs = qs.filter(nsfw=True)
        elif nsfw in ('false','0','no','off'):
            qs = qs.filter(nsfw=False)
        q = qp.get('q') or qp.get('search')
        if q:
            qs = qs.filter(Q(prompt__icontains=q) | Q(user__email__icontains=q) | Q(model__name__icontains=q))
        return qs

    @action(detail=True, methods=["post"])
    def mark_nsfw(self, request, pk=None):
        img = self.get_object()
        img.nsfw = True
        img.save(update_fields=["nsfw"])
        return Response({"nsfw": True})


@api_view(["POST"])  # enqueue generation endpoint
@permission_classes([IsAuthenticated])
def generate(request):
    """Create an ImageJob and enqueue async text2img generation.
    Returns the job payload for client-side polling.
    """
    user = request.user
    model_id = request.data.get("model")
    prompt = request.data.get("prompt", "")
    # nsfw flag is stored on the resulting image when created by task
    job = ImageJob.objects.create(user=user, model_id=model_id or None, prompt=prompt, status="queued", progress=0)
    # enqueue celery
    generate_image_job.delay(job.id)
    return Response({
        "id": job.id,
        "status": job.status,
        "progress": job.progress,
        "result_url": job.result_url,
        "created_at": job.created_at.isoformat(),
    })


class ImageJobSerializer(ModelSerializer):
    class Meta:
        model = ImageJob
        fields = "__all__"
        extra_kwargs = {
            'user': { 'read_only': True },
            'status': { 'read_only': True },
            'progress': { 'read_only': True },
            'result_url': { 'read_only': True },
            'error': { 'read_only': True },
            'created_at': { 'read_only': True },
            'updated_at': { 'read_only': True },
        }


class ImageJobViewSet(viewsets.ModelViewSet):
    serializer_class = ImageJobSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return ImageJob.objects.filter(user=user).order_by('-created_at')

    def perform_create(self, serializer):
        job: ImageJob = serializer.save(user=self.request.user, status="queued", progress=0)
        # Collect optional generation options (do not persist schema changes yet)
        allowed_keys = { 'negative_prompt', 'style', 'nsfw', 'init_image', 'strength' }
        opts = { k: v for k, v in (self.request.data or {}).items() if k in allowed_keys }
        # Enqueue Celery task with options
        # Pass options as kwargs to avoid positional signature mismatches
        generate_image_job.delay(job.id, opts=opts)
