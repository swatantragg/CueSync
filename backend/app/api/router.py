from fastapi import APIRouter

from app.api.routes import activity, auth, cues, delegations, episodes, exports, library, notifications, projects, uploads, users, validation

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(episodes.router, prefix="/episodes", tags=["episodes"])
api_router.include_router(cues.router, prefix="/cues", tags=["cues"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(validation.router, prefix="/validation", tags=["validation"])
api_router.include_router(exports.router, prefix="/exports", tags=["exports"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
api_router.include_router(activity.router, prefix="/activity", tags=["activity"])
api_router.include_router(delegations.router, prefix="/delegations", tags=["delegations"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
