"""Short, human-readable description of who is calling (IP + browser/OS) for login activity."""
from fastapi import Request

_BROWSERS = (("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari"))
_SYSTEMS = (("Windows", "Windows"), ("Android", "Android"), ("iPhone", "iOS"), ("iPad", "iPadOS"),
            ("Mac OS X", "macOS"), ("CrOS", "ChromeOS"), ("Linux", "Linux"))


def client_ip(request: Request) -> str | None:
    # Nginx sets X-Real-IP / X-Forwarded-For; fall back to the socket peer.
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip() or None
    return request.headers.get("x-real-ip") or (request.client.host if request.client else None)


def describe_client(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    browser = next((name for key, name in _BROWSERS if key in ua), None)
    system = next((name for key, name in _SYSTEMS if key in ua), None)
    parts = []
    if browser or system:
        parts.append(" on ".join(p for p in (browser, system) if p))
    ip = client_ip(request)
    if ip:
        parts.append(f"IP {ip}")
    return " · ".join(parts) or "Unknown device"
