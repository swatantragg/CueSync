from pydantic import BaseModel


class EpisodeBase(BaseModel):
    episode_number: int
    title: str | None = None
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

    class Config:
        from_attributes = True


class EpisodeCloneIn(BaseModel):
    source_episode_id: int
    new_episode_number: int
    new_title: str | None = None
