from app.services.exporters.ascap import build_ascap
from app.services.exporters.iprs import build_iprs
from app.services.exporters.prs import build_prs


def build_export(
    society: str,
    project,
    episode,
    total_ep_count: int | None = None,
) -> bytes:
    s = society.lower()
    if s == "iprs":
        return build_iprs(project, episode, total_ep_count=total_ep_count)
    if s == "prs":
        return build_prs(project, episode)
    return build_ascap(project, episode)
