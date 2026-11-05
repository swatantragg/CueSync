from datetime import timedelta

import pytest

from app.core.config import settings
from app.services import gmail


@pytest.mark.parametrize("a,b,same", [
    ("j.doe@gmail.com", "jdoe@gmail.com", True),
    ("JDoe+tag@gmail.com", "jdoe@googlemail.com", True),
    ("j.doe@company.com", "jdoe@company.com", False),
    ("a@gmail.com", "b@gmail.com", False),
    (None, "a@gmail.com", False),
])
def test_same_address(a, b, same):
    assert gmail.same_address(a, b) is same


def test_origin_allow_list(monkeypatch):
    monkeypatch.setattr(settings, "CORS_ORIGINS", "https://app.example.test")
    assert gmail.allowed_origin("https://app.example.test/") == "https://app.example.test"
    assert gmail.allowed_origin("https://evil.example") is None
    assert gmail.allowed_origin(None) is None
    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert gmail.allowed_origin("http://localhost:5173") is None
    monkeypatch.setattr(settings, "APP_ENV", "development")
    assert gmail.allowed_origin("http://localhost:5173") == "http://localhost:5173"
    assert gmail.allowed_origin("http://localhost.evil.example") is None


def test_signed_state_round_trip_and_kind_check():
    token = gmail.sign_state(gmail.LOGIN_STATE, timedelta(minutes=1), org="https://x", nonce="n")
    assert gmail.read_signed(token, gmail.LOGIN_STATE)["nonce"] == "n"
    with pytest.raises(ValueError):
        gmail.read_signed(token, gmail.LOGIN_TICKET)


def test_expired_and_tampered_state_rejected():
    with pytest.raises(ValueError):
        gmail.read_signed(gmail.sign_state(gmail.LOGIN_STATE, timedelta(seconds=-5)))
    with pytest.raises(ValueError):
        gmail.read_signed(gmail.sign_state(gmail.LOGIN_STATE, timedelta(minutes=1)) + "x")


def test_login_asks_for_identity_only_and_mail_connect_for_send_only():
    login = gmail.login_url("s")
    assert "gmail" not in login and "access_type" not in login
    mail = gmail.user_mail_url("s", "a@b.c")
    assert "gmail.send" in mail and "gmail.readonly" not in mail and "access_type=offline" in mail


def test_token_encryption_round_trip():
    enc = gmail.encrypt_token("refresh-secret")
    assert "refresh-secret" not in enc and gmail.decrypt_token(enc) == "refresh-secret"


def test_token_from_other_key_is_a_mail_error_not_a_revoke():
    with pytest.raises(gmail.MailError) as e:
        gmail.decrypt_token("not-a-token")
    assert not isinstance(e.value, gmail.MailboxRevoked)


def test_missing_config_names_what_is_missing(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", None)
    assert "GOOGLE_CLIENT_ID" in gmail.missing_config()
    assert not gmail.login_ready()
