"""Sends transactional email through Brevo's API (weekly reports)."""
import re

import httpx

from app.core.config import settings

SEND_URL = "https://api.brevo.com/v3/smtp/email"
ACCOUNT_URL = "https://api.brevo.com/v3/account"
DOMAINS_URL = "https://api.brevo.com/v3/senders/domains"
AUTHORISED_IPS_URL = "https://app.brevo.com/security/authorised_ips"
# Mailbox providers Brevo can't send "as": their DMARC makes Gmail/Yahoo/Outlook drop or spam the email.
FREE_MAIL = {"gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com",
             "rediffmail.com", "icloud.com", "aol.com", "proton.me", "protonmail.com"}
STATS_URL = "https://api.brevo.com/v3/smtp/statistics/aggregatedReport"
_TIMEOUT = httpx.Timeout(30.0)


class BrevoError(Exception):
    """Brevo could not be reached or refused the email."""


def missing_config() -> list[str]:
    return [name for name in ("BREVO_API_KEY", "BREVO_SENDER_EMAIL") if not getattr(settings, name)]


def sender_domain() -> str:
    return (settings.BREVO_SENDER_EMAIL or "").rpartition("@")[2].strip().lower()


def sender_problem() -> str | None:
    """Why the sender address itself would get the reports dropped or spammed, if it would."""
    domain = sender_domain()
    if domain in FREE_MAIL:
        return (f"The sender {settings.BREVO_SENDER_EMAIL} is a {domain} address. Brevo can't send as {domain}, so Gmail and "
                "others reject or spam the reports. Use an address on your own domain (e.g. reports@yourcompany.in), "
                "authenticate that domain in Brevo → Senders, Domains & Dedicated IPs, and keep BREVO_REPLY_TO as the Gmail.")
    return None


def explain(status: int, detail: str, what: str) -> str:
    """Brevo's refusal in words that say what to do about it."""
    if status == 401 and "unrecognised ip" in (detail or "").lower():
        found = re.search(r"unrecognised IP address\s+([0-9A-Fa-f:.]*[0-9A-Fa-f])", detail)
        ip = found.group(1) if found else "of this server"
        return (f"Brevo blocked this server's IP address {ip}: the Brevo account only accepts its API key from "
                f"listed IP addresses. Add {ip} at {AUTHORISED_IPS_URL} (Brevo → Security → Authorised IPs), "
                "or turn IP blocking off there.")
    if status == 401:
        return "Brevo refused the API key (HTTP 401). Create a new key in Brevo → SMTP & API → API Keys and put it in BREVO_API_KEY."
    return f"Brevo refused {what} (HTTP {status}): {(detail or '')[:300]}"


def _detail(res: httpx.Response) -> str:
    try:
        return res.json().get("message") or res.text
    except ValueError:
        return res.text


async def _get(url: str, params: dict | None = None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            res = await http.get(url, params=params, headers={"api-key": settings.BREVO_API_KEY or "", "accept": "application/json"})
    except httpx.HTTPError as e:
        raise BrevoError(f"Brevo could not be reached: {e}")
    if res.status_code != 200:
        raise BrevoError(explain(res.status_code, _detail(res), "the check"))
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
        raise BrevoError(explain(res.status_code, _detail(res), "the email"))
    return res.json().get("messageId") or ""


async def domain_authenticated() -> bool | None:
    """Whether the sender's domain is authenticated (DKIM/DMARC) in Brevo; None when it isn't listed there."""
    domain = sender_domain()
    for d in (await _get(DOMAINS_URL)).get("domains") or []:
        if (d.get("domain_name") or "").lower() == domain:
            return bool(d.get("authenticated"))
    return None


async def readiness(enabled: bool) -> list[dict]:
    """Everything that has to be true for the weekly reports to reach people, in order, each with what to do.
    Stops asking Brevo after the first failure that makes further answers meaningless."""
    checks = []

    def add(key: str, ok: bool | None, text: str, fix: str | None = None) -> bool:
        checks.append({"key": key, "ok": ok, "text": text, "fix": None if ok else fix})
        return bool(ok)

    add("enabled", enabled, "REPORT_ENABLED is true on this server" if enabled else "REPORT_ENABLED is false, so the weekly job never runs",
        "Set REPORT_ENABLED=true in the production .env (the one docker compose reads) and restart the backend.")
    missing = missing_config()
    configured = add("configured", not missing, "Brevo API key and sender are set" if not missing else f"Missing: {', '.join(missing)}",
                     "Fill in BREVO_API_KEY and BREVO_SENDER_EMAIL in the production .env and restart the backend.")
    problem = sender_problem() if not missing else None
    add("sender", None if missing else not problem,
        "Sender address: checked once BREVO_SENDER_EMAIL is set" if missing
        else f"Sender {settings.BREVO_SENDER_EMAIL} is on your own domain" if not problem
        else f"Sender {settings.BREVO_SENDER_EMAIL} is a free-mail address", problem)
    if not configured:
        return checks
    try:
        account = await _get(ACCOUNT_URL)
    except BrevoError as e:
        add("reachable", False, "Brevo accepts this server's API calls", str(e))
        return checks
    add("reachable", True, "Brevo accepts this server's API calls")
    relay = (account.get("relay") or {}).get("enabled") is True
    add("relay", relay, "Transactional sending is active on the Brevo account" if relay else "Brevo has transactional sending turned off",
        "Authenticate your domain in Brevo, then ask Brevo support to activate transactional email. Until then Brevo accepts "
        "emails and silently drops them.")
    if not problem:
        try:
            auth = await domain_authenticated()
        except BrevoError:
            auth = None
        add("domain", bool(auth), f"{sender_domain()} is authenticated in Brevo" if auth else f"{sender_domain()} is not authenticated in Brevo",
            f"Brevo → Senders, Domains & Dedicated IPs → add {sender_domain()} and put the DKIM and DMARC records it shows in your DNS.")
    return checks
