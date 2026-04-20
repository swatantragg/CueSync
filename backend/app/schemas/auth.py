from pydantic import BaseModel, EmailStr

from app.models.user import UserRole


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: UserRole = UserRole.VIEWER


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool

    class Config:
        from_attributes = True
