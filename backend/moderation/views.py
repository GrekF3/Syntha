from rest_framework import viewsets
from rest_framework.serializers import ModelSerializer
from moderation.models import Report


class ReportSerializer(ModelSerializer):
    class Meta:
        model = Report
        fields = "__all__"


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.all().order_by("-created_at")
    serializer_class = ReportSerializer
