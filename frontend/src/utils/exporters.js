import * as XLSX from "xlsx";
import { iprsCode, prsCode, ascapCode } from "../constants/usage";

export function buildIPRS(p, e) {
  const rows = [
    ["TV/WEB SERIES CUE SHEET"],
    ["SERIAL TITLE", p.title, "", "", "", "", "CHANNEL NAME", "", p.channel],
    ["SERIAL TYPE", p.serialType, "", "", "", "", "DIRECTOR", "", p.director],
    ["GENRE / CATEGORY", p.genre, "", "", "", "", "BANNER / PRODUCTION COMPANY", "", p.productionCompany],
    ["LANGUAGE", p.language, "", "", "", "", "PRINCIPAL ACTORS / ACTRESS", "", p.actors],
    ["PRODUCTION NUMBER", p.productionNumber, "", "", "", "", "TOTAL EPISODE DURATION", "", e.totalDuration],
    ["DATE OF EPISODE 1ST PERFORMED / AIRED", e.airDate, "", "", "", "", "TOTAL MUSICAL DURATION", "", e.musicalDuration],
    ["PRODUCTION YEAR", p.year, "", "", "", "", "BACKGROUND MUSIC COMPOSER", "", p.backgroundMusicComposer],
    ["PRODUCER", p.producer, "", "", "", "", "Submitted By (Name of C/A/E)", "", p.submittedBy],
    ["EPISODE NO.", e.number, "", "", "", "", "EPISODE TITLE", "", e.title],
    ["TOTAL NO. OF EPISODE", p.episodes?.length || ""],
    ["WORK DETAILS", "", "", "", "", "", "COMPOSER / AUTHOR / PUBLISHER / SINGER DETAILS"],
    ["SONG TITLE / TRACK NAME", "CHARACTERISTICS", "NO. OF USAGE", "Internal No/Song Code", "ISRC", "DURATION (HH:MM:SS)", "ROLE (C / A / E)", "NAMES", "SOCIETY", "SHARE", "IPI NO.", "SINGER", "VALIDATION LINK"],
  ];
  e.cues.forEach((c) => {
    c.contributors.forEach((co, i) => {
      rows.push([
        i === 0 ? c.songTitle : "",
        i === 0 ? iprsCode(c.usageType) : "",
        i === 0 ? String(c.usages).padStart(2, "0") : "",
        i === 0 ? c.songCode : "",
        i === 0 ? c.isrc || "" : "",
        i === 0 ? c.duration : "",
        co.role === "Composer" ? "C" : co.role === "Author" ? "A" : "E",
        co.name, co.society,
        co.share ? co.share + "%" : "",
        co.ipi,
        i === 0 ? c.singer || "" : "",
        i === 0 ? c.validationLink || "" : "",
      ]);
    });
  });
  return rows;
}

export function buildPRS(p, e) {
  const rows = [
    ["LICENSOR APPROVED MUSIC CUE SHEET"],
    ["Film/Series/Item Title", "", p.title, "", "Production Co.", p.productionCompany, "Country of Origin", "", p.countryOfOrigin, "T/P/F", "", "F"],
    ["Episode Title", "", e.title, "", "Production No.", p.productionNumber, "Production Year", "", p.year],
    ["Episode No.", "", e.number, "", "Director", p.director, "First Tx Date", "", e.airDate, "Film Duration", "", e.totalDuration],
    ["", "", "", "", "Principal Actors", p.actors, "Channel", "", p.channel, "Music Duration", "", e.musicalDuration],
    ["Music Details"],
    ["Seq", "Title", "", "Role", "Interested Parties", "", "CAE Number", "Share %", "Society", "Usage", "Duration", "Work Number"],
  ];
  e.cues.forEach((c, ci) => {
    c.contributors.forEach((co, i) => {
      rows.push([
        i === 0 ? ci + 1 : "",
        i === 0 ? c.songTitle : "",
        "", co.role, co.name, "", co.ipi,
        co.share ? co.share + "%" : "", co.society,
        i === 0 ? prsCode(c.usageType) : "",
        i === 0 ? c.duration : "",
        i === 0 ? c.workNumber || "" : "",
      ]);
    });
  });
  return rows;
}

export function buildASCAP(p, e) {
  const rows = [
    [`${p.title}(${p.language} ${p.type})Cuesheet`],
    [`Series/Film Title: ${p.title}`, "", "", "", `Company Name: ${p.productionCompany || "NA"}`],
    [`Episode Title/Number: ${e.number}`, "", "", "", `Contact: ${p.submittedBy || "NA"}`],
    [`Estimated Airdate: ${e.airDate || ""}`, "", "", "", `Network Station: ${p.channel || "NA"}`],
    [`Program Length: ${e.totalDuration}`, "", "", "", `Program Type: ${p.serialType || p.genre}`],
    ["Cue #", "Cue Title", "Use*", "Timing", "Composer(s) Affiliation / %", "Publisher(s) Affiliation / %", "Work ID (ASCAP)"],
  ];
  e.cues.forEach((c, i) => {
    const cm = c.contributors.filter((x) => x.role !== "Publisher").map((x) => `${x.name} (${x.society || "NS"}) ${x.share || ""}%`).join("\n");
    const pb = c.contributors.filter((x) => x.role === "Publisher").map((x) => `${x.name} (${x.society || "NS"}) ${x.share || ""}%`).join("\n");
    rows.push([i + 1, c.songTitle, ascapCode(c.usageType), c.duration, cm, pb, c.ascapWorkId || ""]);
  });
  return rows;
}

export function dlExport(builder, label, p, e) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(builder(p, e));
  XLSX.utils.book_append_sheet(wb, ws, `Ep${String(e.number).padStart(2, "0")}`);
  XLSX.writeFile(wb, `${p.title.replace(/[^a-z0-9]+/gi, "_")}_Ep${String(e.number).padStart(2, "0")}_${label}.xlsx`);
}
