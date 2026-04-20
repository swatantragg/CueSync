from app.services.exporters._common import fmt_dur, new_wb, save_bytes, set_row


def build_prs(project, episode) -> bytes:
    wb, ws = new_wb("PRS")
    ws.merge_cells("A1:J1")
    ws["A1"] = f"PRS CUE SHEET - {project.title} - EP {episode.episode_number}"
    from openpyxl.styles import Font
    ws["A1"].font = Font(bold=True, size=14)

    headers = ["Seq", "Work Number", "Song Title", "Duration", "Usage", "Contributor", "Role", "CAE No", "Share %", "Society"]
    set_row(ws, 3, headers, bold=True, fill=True)

    r = 4
    for idx, cue in enumerate(episode.cues, 1):
        first = True
        for c in cue.contributors or [None]:
            set_row(ws, r, [
                idx if first else "",
                cue.work_number if first else "",
                cue.song_title if first else "",
                fmt_dur(cue.duration_sec) if first else "",
                cue.usage_type.value if first else "",
                c.name if c else "",
                c.role if c else "",
                c.cae_number if c else "",
                float(c.share_percent) if c else "",
                c.society if c else "",
            ])
            r += 1
            first = False

    widths = [6, 18, 30, 12, 12, 28, 14, 16, 10, 12]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w

    return save_bytes(wb)
