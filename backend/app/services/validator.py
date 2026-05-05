from app.models.episode import Episode
from app.services.cue_rules import computed_share, role_key

IPRS_REQUIRED = ["isrc"]
PRS_REQUIRED = ["work_number"]
ASCAP_REQUIRED = ["ascap_work_id"]


def validate_episode(ep: Episode) -> dict:
    issues: list[dict] = []
    for cue in ep.cues:
        contributors = cue.contributors or []
        total_share = sum(computed_share(c, contributors) for c in contributors)
        if contributors and abs(total_share - 100) > 0.02:
            issues.append({"cue_id": cue.id, "type": "share_mismatch", "total": round(total_share, 2)})
        if contributors and not any(role_key(c.role) in {"Composer", "CA"} for c in contributors):
            issues.append({"cue_id": cue.id, "type": "missing_share_role", "role": "Composer"})
        if contributors and not any(role_key(c.role) in {"Author", "CA"} for c in contributors):
            issues.append({"cue_id": cue.id, "type": "missing_share_role", "role": "Author"})
        if contributors and not any(role_key(c.role) == "Publisher" for c in contributors):
            issues.append({"cue_id": cue.id, "type": "missing_share_role", "role": "Publisher"})
        for f in IPRS_REQUIRED:
            if not getattr(cue, f):
                issues.append({"cue_id": cue.id, "type": "missing_iprs", "field": f})
        for f in PRS_REQUIRED:
            if not getattr(cue, f):
                issues.append({"cue_id": cue.id, "type": "missing_prs", "field": f})
        for f in ASCAP_REQUIRED:
            if not getattr(cue, f):
                issues.append({"cue_id": cue.id, "type": "missing_ascap", "field": f})
        if not cue.contributors:
            issues.append({"cue_id": cue.id, "type": "no_contributors"})
    return {
        "episode_id": ep.id,
        "ok": len(issues) == 0,
        "cue_count": len(ep.cues),
        "issues": issues,
    }
