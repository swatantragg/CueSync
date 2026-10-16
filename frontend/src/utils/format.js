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

// "15 Oct 2026, 4:05 pm" in the viewer's locale.
export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDateTime(iso);
}

export const ACTION_LABEL = {
  upload: "Imported", create: "Added a song", update: "Edited", delete: "Removed a song",
  submit: "Submitted for review", approve: "Approved", reject: "Rejected", suggest: "Suggested changes",
  review_open: "Opened for review", login: "Signed in", logout: "Signed out", password_change: "Changed password",
};
