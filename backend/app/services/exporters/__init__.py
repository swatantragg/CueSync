from app.services.exporters.ascap import build_ascap
from app.services.exporters.iprs import build_iprs
from app.services.exporters.prs import build_prs

_BUILDERS = {"iprs": build_iprs, "prs": build_prs, "ascap": build_ascap}


def build_export(society: str, project, episode) -> bytes:
    fn = _BUILDERS[society.lower()]
    return fn(project, episode)
