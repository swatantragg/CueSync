import string

from pydantic import BaseModel, field_validator

from app.models.user import UserRole

PASSWORD_MIN_LENGTH = 6


def check_password_strength(v: str) -> str:
    problems = []
    if len(v) < PASSWORD_MIN_LENGTH:
        problems.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if not any(c.isupper() for c in v):
        problems.append("one uppercase letter")
    if not any(c.isdigit() for c in v):
        problems.append("one number")
    if not any(c in string.punctuation or (not c.isalnum() and not c.isspace()) for c in v):
        problems.append("one special character")
    if problems:
        raise ValueError("Password must contain " + ", ".join(problems))
    return v


class LoginIn(BaseModel):
    email: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, v):
        return check_password_strength(v)

    @field_validator("confirm_password")
    @classmethod
    def _match(cls, v, info):
        if v != info.data.get("new_password"):
            raise ValueError("Passwords do not match")
        return v


class SeenVersionIn(BaseModel):
    version: str

    @field_validator("version")
    @classmethod
    def _short(cls, v):
        v = v.strip()
        if not v or len(v) > 20:
            raise ValueError("Invalid version")
        return v


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: UserRole = UserRole.VIEWER

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v):
        return check_password_strength(v)


class UserUpdate(BaseModel):
    """Super-admin-only edit of another user's details. Omitted fields stay unchanged."""
    full_name: str | None = None
    email: str | None = None
    password: str | None = None

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v):
        return v if not v else check_password_strength(v)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    is_super_admin: bool = False
    must_change_password: bool = False
    last_seen_version: str | None = None

    class Config:
        from_attributes = True


class AdminUserOut(UserOut):
    # True for the super admin. Lets other admins grey out controls without revealing the role.
    is_protected: bool = False


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut
