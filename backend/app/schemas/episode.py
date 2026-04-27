from pydantic import BaseModel


class EpisodeBase(BaseModel):
    episode_number: int
    title: str | None = None
    air_date: str | None = None
    total_duration_sec: int | None = None
    musical_duration_sec: int | None = None
    bg_instrumental_duration_sec: int | None = None
    bg_vocal_duration_sec: int | None = None
    cue_serial_title: str | None = None
    cue_channel: str | None = None
    cue_serial_type: str | None = None
    cue_language: str | None = None
    cue_director: str | None = None
    cue_genre: str | None = None
    cue_production_company: str | None = None
    cue_country: str | None = None
    cue_actors: str | None = None
    cue_producer: str | None = None
    cue_production_year: int | None = None
    cue_bg_music_composer: str | None = None
    cue_submitted_by: str | None = None


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
