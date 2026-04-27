from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.project import ProjectType


class ProjectBase(BaseModel):
    title: str
    type: ProjectType

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, v):
        if isinstance(v, str):
            return v.upper()
        return v
    language: str | None = None
    genre: str | None = None
    production_company: str | None = None
    director: str | None = None
    producer: str | None = None
    actors: str | None = None
    production_year: int | None = None
    channel_name: str | None = None
    country: str | None = None
    total_episodes: int | None = None
    bg_music_composer: str | None = None
    submitted_by: str | None = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(ProjectBase):
    pass


class ProjectOut(ProjectBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
