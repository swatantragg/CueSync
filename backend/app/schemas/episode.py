from pydantic import BaseModel


class EpisodeBase(BaseModel):
    episode_number: int
    title: str | None = None
    air_date: str | None = None
    total_duration_sec: int | None = None
    musical_duration_sec: int | None = None
    bg_instrumental_duration_sec: int | None = None
    bg_vocal_duration_sec: int | None = None


class EpisodeCreate(EpisodeBase):
    pass


class EpisodeUpdate(EpisodeBase):
    pass


class EpisodeOut(EpisodeBase):
    id: int
    project_id: int
    status: str = "pending"
    rejection_note: str | None = None
    review_note: str | None = None

    class Config:
        from_attributes = True


class ReviewNoteIn(BaseModel):
    note: str


class EpisodeCloneIn(BaseModel):
    source_episode_id: int
    new_episode_number: int
    new_title: str | None = None
