import time
from django.utils.deprecation import MiddlewareMixin


class RequestLoggingMiddleware(MiddlewareMixin):
    """Logs API request metrics for monitoring."""

    def process_request(self, request):
        request._start_time = time.time()

    def process_response(self, request, response):
        if not hasattr(request, '_start_time'):
            return response

        duration_ms = int((time.time() - request._start_time) * 1000)

        # Only log API requests
        if request.path.startswith('/api/'):
            from .models import APIRequestLog
            try:
                APIRequestLog.objects.create(
                    user=request.user if request.user.is_authenticated else None,
                    tenant=getattr(request, 'tenant', None),
                    endpoint=request.path,
                    method=request.method,
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                    response_size_bytes=len(response.content) if hasattr(response, 'content') else 0,
                )
            except Exception:
                pass  # Never break the request due to logging failure

        return response
