"""Seed initial admin user. Run: python -m app.scripts.seed_admin"""
import asyncio
import os

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.user import User, UserRole


async def main():
    email = os.getenv("ADMIN_EMAIL", "admin@cuesync.local")
    password = os.getenv("ADMIN_PASSWORD", "admin123")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            print(f"Admin already exists: {email}")
            return
        u = User(email=email, full_name="Admin", hashed_password=hash_password(password), role=UserRole.ADMIN)
        db.add(u)
        await db.commit()
        print(f"Created admin: {email} / {password}")


if __name__ == "__main__":
    asyncio.run(main())
