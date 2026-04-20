export function fmtD(v) {
  if (!v) return "";
  if (typeof v === "string" && v.includes(":")) return v;
  if (typeof v === "number") {
    const s = Math.round(v * 86400);
    return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  return String(v);
}

export const now = () =>
  new Date().toLocaleString("en-IN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
