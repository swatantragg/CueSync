import * as XLSX from "xlsx";
import { CODE_REVERSE } from "../constants/usage";
import { uid } from "./uid";
import { fmtD } from "./format";

export function parseRoughSheet(wb) {
  const episodes = [];
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!data || data.length < 5) continue;

    let epNum = parseInt(sn) || 0;
    let airDate = "", totalDuration = "", musicalDuration = "", bgInst = "", bgVocal = "";
    let director = "", genre = "", language = "", prodCo = "", actors = "", producer = "", bgComposer = "";

    for (let r = 0; r < Math.min(25, data.length); r++) {
      const row = data[r];
      const f = String(row[0] || "").trim().toUpperCase();
      if (f === "TITLE" || f.startsWith("TITLE")) {
        const t = String(row[1] || "");
        const m1 = t.match(/ep[- ]?(\d+)/i); if (m1) epNum = parseInt(m1[1]);
        const m2 = t.match(/(\d{1,2}\s+\w+\s+\d{4})/i); if (m2) airDate = m2[1];
      }
      if (f.includes("TOTAL MOVIE DURATION") || f.includes("TOTAL EPISODE DURATION")) totalDuration = fmtD(row[row.length > 7 ? 7 : 1]);
      if (f.includes("TOTAL MUSICAL DURATION")) musicalDuration = fmtD(row[row.length > 7 ? 7 : 1]);
      if (f.includes("BACKGROUND INSTRUMENTAL")) bgInst = fmtD(row[row.length > 7 ? 7 : 1]);
      if (f.includes("BACKGROUND VOCAL") && !f.includes("INSTRUMENTAL")) bgVocal = fmtD(row[row.length > 7 ? 7 : 1]);
      if (f === "DIRECTOR") director = String(row[1] || row[7] || "").trim();
      if (f.includes("GENRE")) genre = String(row[1] || "").trim();
      if (f === "LANGUAGE") language = String(row[1] || "").trim();
      if (f.includes("BANNER") || f.includes("PRODUCTION COMPANY")) prodCo = String(row[1] || row[7] || "").trim();
      if (f.includes("PRINCIPAL ACTORS")) actors = String(row[1] || row[7] || "").trim();
      if (f === "PRODUCER") producer = String(row[1] || "").trim();
      if (f.includes("BACKGROUND MUSIC COMPOSER")) bgComposer = String(row[1] || row[7] || "").trim();
    }

    let cueStart = -1;
    for (let r = 0; r < data.length; r++) {
      if (String(data[r][0] || "").toUpperCase().includes("SONG TITLE")) { cueStart = r + 1; break; }
    }

    const cues = [];
    if (cueStart > 0) {
      let cur = null;
      for (let r = cueStart; r < data.length; r++) {
        const row = data[r];
        const st = String(row[0] || "").trim();
        if (String(row[0] || "").toUpperCase().includes("CODE")) break;
        if (st) {
          cur = {
            id: uid(), songTitle: st,
            usageType: CODE_REVERSE[String(row[1] || "").trim().toUpperCase()] || "Background Instrumental",
            duration: fmtD(row[4]), usages: parseInt(row[2]) || 1,
            songCode: String(row[3] || ""), singer: String(row[row.length > 10 ? 10 : 6] || ""),
            isrc: "", workNumber: "", ascapWorkId: "", validationLink: "", contributors: [],
          };
          cues.push(cur);
        }
        if (cur) {
          const role = String(row[5] || "").trim().toUpperCase();
          const name = String(row[6] || "").trim();
          if (role && name) {
            cur.contributors.push({
              id: uid(), name,
              role: role === "C" ? "Composer" : role === "A" ? "Author" : role === "E" ? "Publisher" : role,
              society: String(row[7] || ""), share: parseFloat(row[8]) || 0, ipi: String(row[9] || ""),
            });
          }
        }
      }
    }

    episodes.push({
      id: uid(), number: epNum, title: "", airDate, totalDuration, musicalDuration,
      bgInstrumental: bgInst, bgVocal, status: "pending", editHistory: [], uploadedBy: "", uploadedAt: "",
      extracted: { director, genre, language, prodCo, actors, producer, bgComposer }, cues,
    });
  }
  return episodes.sort((a, b) => a.number - b.number);
}
