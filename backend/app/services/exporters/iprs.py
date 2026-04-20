from app.services.exporters._common import fmt_dur, new_wb, save_bytes, set_row


def build_iprs(project, episode) -> bytes:
    wb, ws = new_wb("IPRS")
    is_serial = getattr(project.type, "value", str(project.type)).lower() == "serial"

    ws.merge_cells("A1:J1")
    ws["A1"] = f"IPRS CUE SHEET - {'TV/WEB SERIAL' if is_serial else 'MOVIE'}"
    ws["A1"].font = __import__("openpyxl.styles", fromlist=["Font"]).Font(bold=True, size=14)

    meta = [
        ["Title", project.title, "Language", project.language or "", "Year", project.production_year or ""],
        ["Director", project.director or "", "Producer", project.producer or "", "Company", project.production_company or ""],
    ]
    if is_serial:
        meta.append(["Channel", project.channel_name or "", "Episode", episode.episode_number, "Ep Title", episode.title or ""])
    for i, row in enumerate(meta, start=3):
        set_row(ws, i, row, bold=True)

    header_row = 3 + len(meta) + 1
    headers = ["S.No", "Song Title", "Usage Type", "Duration", "Usages", "Contributor Name", "Role", "IPI No", "Share %", "ISRC"]
    set_row(ws, header_row, headers, bold=True, fill=True)

    r = header_row + 1
    for idx, cue in enumerate(episode.cues, 1):
        first = True
        for c in cue.contributors or [None]:
            set_row(ws, r, [
                idx if first else "",
                cue.song_title if first else "",
                cue.usage_type.value if first else "",
                fmt_dur(cue.duration_sec) if first else "",
                cue.usage_count if first else "",
                c.name if c else "",
                c.role if c else "",
                c.ipi_number if c else "",
                float(c.share_percent) if c else "",
                cue.isrc if first else "",
            ])
            r += 1
            first = False

    widths = [6, 30, 14, 12, 8, 28, 14, 16, 10, 16]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w

    return save_bytes(wb)
