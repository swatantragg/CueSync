from app.models.episode import Episode

IPRS_REQUIRED = ["isrc"]
PRS_REQUIRED = ["work_number"]
ASCAP_REQUIRED = ["ascap_work_id"]


def validate_episode(ep: Episode) -> dict:
    issues: list[dict] = []
    for cue in ep.cues:
        role_groups: dict[str, float] = {}
        for c in cue.contributors:
            role_groups[c.role] = role_groups.get(c.role, 0) + float(c.share_percent or 0)
        for role, total in role_groups.items():
            if round(total, 2) != 100.0:
                issues.append({"cue_id": cue.id, "type": "share_mismatch", "role": role, "total": total})
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
