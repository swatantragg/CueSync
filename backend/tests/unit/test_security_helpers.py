from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.schemas.auth import ChangePasswordIn, UserCreate, check_password_strength


def test_password_hash_verifies_and_is_salted():
    h1, h2 = hash_password("Secret@1"), hash_password("Secret@1")
    assert h1 != h2 and h1.startswith("$2")
    assert verify_password("Secret@1", h1)
    assert not verify_password("secret@1", h1)


def test_corrupt_hash_never_verifies():
    assert not verify_password("anything", "not-a-bcrypt-hash")


def test_tokens_carry_type_and_unique_ids():
    a, b = create_access_token("7", "editor"), create_access_token("7", "editor")
    pa, pb = decode_token(a), decode_token(b)
    assert pa["type"] == "access" and pa["sub"] == "7" and pa["role"] == "editor"
    assert pa["jti"] != pb["jti"]
    assert decode_token(create_refresh_token("7"))["type"] == "refresh"


@pytest.mark.parametrize("mutate", [
    lambda t: t[:-3] + "abc",
    lambda t: jwt.encode({"sub": "1", "type": "access"}, "wrong-secret", algorithm="HS256"),
    lambda t: jwt.encode({"sub": "1", "type": "access", "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
                         settings.JWT_SECRET, algorithm="HS256"),
])
def test_bad_tokens_are_rejected(mutate):
    with pytest.raises(ValueError):
        decode_token(mutate(create_access_token("1", "admin")))


def test_alg_none_token_is_rejected():
    import base64, json
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    forged = f'{enc({"alg": "none", "typ": "JWT"})}.{enc({"sub": "1", "type": "access", "role": "admin"})}.'
    with pytest.raises(ValueError):
        decode_token(forged)


@pytest.mark.parametrize("pw,ok", [("Abc@12", True), ("short", False), ("alllower1!", False), ("NoDigits!!", False), ("NoSpecial1", False)])
def test_password_rules(pw, ok):
    if ok:
        assert check_password_strength(pw) == pw
    else:
        with pytest.raises(ValueError):
            check_password_strength(pw)


def test_change_password_must_match_confirmation():
    with pytest.raises(ValueError):
        ChangePasswordIn(current_password="x", new_password="Abc@12", confirm_password="Abc@13")


def test_user_create_rejects_weak_password():
    with pytest.raises(ValueError):
        UserCreate(email="a@b.c", full_name="A", password="weak")
