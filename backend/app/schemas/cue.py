from pydantic import BaseModel, Field

from app.models.cue import UsageType


class ContributorIn(BaseModel):
    name: str
    role: str
    society: str | None = None
    share_percent: float = Field(ge=0, le=100)
    ipi_number: str | None = None
    cae_number: str | None = None


class ContributorOut(ContributorIn):
    id: int

    class Config:
        from_attributes = True


class CueBase(BaseModel):
    song_title: str
    usage_type: UsageType = UsageType.BACKGROUND
    duration_sec: int
    usage_count: int = 1
    isrc: str | None = None
    song_code: str | None = None
    work_number: str | None = None
    ascap_work_id: str | None = None
    validation_link: str | None = None
    order_index: int = 0


class CueCreate(CueBase):
    contributors: list[ContributorIn] = []


class CueUpdate(CueCreate):
    pass


class CueOut(CueBase):
    id: int
    episode_id: int
    contributors: list[ContributorOut] = []

    class Config:
        from_attributes = True
