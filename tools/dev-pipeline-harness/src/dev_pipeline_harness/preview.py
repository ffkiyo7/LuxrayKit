"""Read-only preview health checks."""

from __future__ import annotations

import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class PreviewFacts:
    url: str
    healthy: bool
    status_code: int | None
    detail: str


class PreviewHealthChecker:
    def __init__(self, *, timeout: float = 10, opener=urllib.request.urlopen):
        self.timeout = timeout
        self.opener = opener

    def check(self, url: str) -> PreviewFacts:
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.netloc:
            return PreviewFacts(url, False, None, "preview URL must be HTTPS")
        request = urllib.request.Request(url, headers={"User-Agent": "dev-pipeline-harness/0.1"})
        try:
            with self.opener(request, timeout=self.timeout) as response:
                status = int(response.status)
                return PreviewFacts(url, status == 200, status, "ok" if status == 200 else "non-200 preview response")
        except urllib.error.HTTPError as exc:
            return PreviewFacts(url, False, int(exc.code), "preview returned an HTTP error")
        except (urllib.error.URLError, TimeoutError, OSError):
            return PreviewFacts(url, False, None, "preview health request failed")
