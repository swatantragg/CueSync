export function roleKey(role) {
  const raw = String(role || "").trim();
  const compact = raw.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, " ").trim();
  if (raw.toUpperCase() === "CA" || compact === "ca" || compact === "composer author" || compact === "composer and author" || (compact.includes("composer") && compact.includes("author"))) return "CA";
  if (["c", "composer", "music composer"].includes(compact)) return "Composer";
  if (["a", "author", "lyricist", "writer"].includes(compact)) return "Author";
  if (["e", "publisher", "publishing"].includes(compact)) return "Publisher";
  if (["performer", "singer", "interpreter"].includes(compact)) return "Performer";
  if (compact === "arranger") return "Arranger";
  return raw || "Composer";
}

function roundShare(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// usageCode: "BI" | "BV" | "FI" | "FV" — if BI or no author, composer pool = 50 %
export function applyShareRules(contributors = [], usageCode = "") {
  const rows = contributors.map((co) => ({ ...co, role: roleKey(co.role) }));
  const composers  = rows.filter((co) => ["Composer", "CA"].includes(roleKey(co.role)));
  const authors    = rows.filter((co) => ["Author", "CA"].includes(roleKey(co.role)));
  const publishers = rows.filter((co) => roleKey(co.role) === "Publisher");

  const isBi      = (usageCode || "").toUpperCase() === "BI";
  const noAuthor  = authors.length === 0;
  const composerPool = (isBi || noAuthor) ? 50 : 25;

  return rows.map((co) => {
    const role = roleKey(co.role);
    let share = 0;
    if (["Composer", "CA"].includes(role) && composers.length)
      share += composerPool / composers.length;
    if (["Author", "CA"].includes(role) && authors.length && !(isBi || noAuthor))
      share += 25 / authors.length;
    if (role === "Publisher" && publishers.length)
      share += 50 / publishers.length;
    return { ...co, role, share: roundShare(share), share_percent: roundShare(share) };
  });
}

export function usageLabel(value) {
  return {
    bi: "BI - BG Instrumental",
    bv: "BV - BG Vocal",
    fi: "FI - Feature Instrumental",
    fv: "FV - Feature Vocal",
    background: "BI - BG Instrumental",
    instrumental: "BI - BG Instrumental",
    vocal: "BV - BG Vocal",
  }[value] || value || "";
}
