from app.services.exporters._common import fmt_dur, new_wb, save_bytes, set_row


def _flatten(contribs) -> str:
    return "; ".join(
        f"{c.name} ({c.role}, {float(c.share_percent):.2f}%)" + (f" IPI:{c.ipi_number}" if c.ipi_number else "")
        for c in contribs
    )


def build_ascap(project, episode) -> bytes:
    wb, ws = new_wb("ASCAP")
    from openpyxl.styles import Font
    ws.merge_cells("A1:H1")
    ws["A1"] = f"ASCAP CUE SHEET - {project.title} - EP {episode.episode_number}"
    ws["A1"].font = Font(bold=True, size=14)

    headers = ["Cue #", "ASCAP Work ID", "Song Title", "Usage", "Duration", "Usages", "Contributors (flat)", "Validation"]
    set_row(ws, 3, headers, bold=True, fill=True)

    for idx, cue in enumerate(episode.cues, 1):
        set_row(ws, 3 + idx, [
            idx,
            cue.ascap_work_id or "",
            cue.song_title,
            cue.usage_type.value,
            fmt_dur(cue.duration_sec),
            cue.usage_count,
            _flatten(cue.contributors),
            cue.validation_link or "",
        ])

    widths = [8, 18, 30, 12, 12, 8, 60, 24]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w

    return save_bytes(wb)
