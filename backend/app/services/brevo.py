"""Sends transactional email through Brevo's API (weekly reports)."""
import httpx

from app.core.config import settings

SEND_URL = "https://api.brevo.com/v3/smtp/email"
ACCOUNT_URL = "https://api.brevo.com/v3/account"
STATS_URL = "https://api.brevo.com/v3/smtp/statistics/aggregatedReport"
_TIMEOUT = httpx.Timeout(30.0)


class BrevoError(Exception):
    """Brevo could not be reached or refused the email."""


def missing_config() -> list[str]:
    return [name for name in ("BREVO_API_KEY", "BREVO_SENDER_EMAIL") if not getattr(settings, name)]


async def _get(url: str, params: dict | None = None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            res = await http.get(url, params=params, headers={"api-key": settings.BREVO_API_KEY or "", "accept": "application/json"})
    except httpx.HTTPError as e:
        raise BrevoError(f"Brevo could not be reached: {e}")
    if res.status_code != 200:
        try:
            detail = res.json().get("message") or res.text
        except ValueError:
            detail = res.text
        raise BrevoError(f"Brevo refused the check (HTTP {res.status_code}): {detail[:300]}")
    return res.json()


async def sending_enabled() -> bool:
    """False while Brevo hasn't activated (or has suspended) sending on this account. It still accepts emails
    then, and drops them with "Your sending platform is currently disabled", so check before relying on it."""
    return (await _get(ACCOUNT_URL)).get("relay", {}).get("enabled") is True


async def delivery_stats(days: int = 7) -> dict:
    """What Brevo really did with the emails, as opposed to what CueSync handed it."""
    data = await _get(STATS_URL, {"days": days})
    bounced = data.get("hardBounces", 0) + data.get("softBounces", 0)
    return {"days": days, "requests": data.get("requests", 0), "delivered": data.get("delivered", 0), "bounced": bounced,
            "errors": data.get("error", 0) + data.get("blocked", 0) + data.get("invalid", 0)}


async def send(to_email: str, to_name: str, subject: str, html: str, text: str, tag: str) -> str:
    """Returns Brevo's message id."""
    body = {
        "sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL},
        "to": [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
        "tags": [tag],
    }
    if settings.BREVO_REPLY_TO:
        body["replyTo"] = {"email": settings.BREVO_REPLY_TO}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            res = await http.post(SEND_URL, json=body, headers={"api-key": settings.BREVO_API_KEY or "", "accept": "application/json"})
    except httpx.HTTPError as e:
        raise BrevoError(f"Brevo could not be reached: {e}")
    if res.status_code >= 300:
        try:
            detail = res.json().get("message") or res.text
        except ValueError:
            detail = res.text
        raise BrevoError(f"Brevo refused the email (HTTP {res.status_code}): {detail[:300]}")
    return res.json().get("messageId") or ""
