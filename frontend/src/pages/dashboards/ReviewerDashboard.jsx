import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, MessageSquare, Download, ChevronRight, Search, X } from "lucide-react";
import { C, FONTS } from "../../styles/palette";
import DashboardShell from "./DashboardShell";
import { api } from "../../utils/api";
import { showAlert, showConfirm } from "../../components/Dialog";
import { useApp } from "../../context/AppContext";

function ReviewModal({ episode, onClose, onAction }) {
  const [note, setNote] = useState("");
  const [action, setAction] = useState(null);
  const [saving, setSaving] = useState(false);

  const handle = async (type) => {
    if ((type === "reject" || type === "suggest") && !note.trim()) {
      await showAlert("Please enter a note before submitting.", { variant: "warn" });
      return;
    }
    setSaving(true);
    try {
      await onAction(episode.id, type, note.trim());
      onClose();
    } catch (ex) {
      await showAlert(ex.message, { title: "Action Failed", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div className="rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" style={{ background: C.dark }}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mid }}>
          <div>
            <h3 className="font-semibold" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
              Review — {episode.project_title} Ep {episode.episode_number}
            </h3>
            {episode.title && <p className="text-xs mt-0.5" style={{ color: C.muted }}>{episode.title}</p>}
          </div>
          <button onClick={onClose} style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: C.muted }}>Note (required for Reject / Suggest)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Enter rejection reason or suggested changes…"
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
              style={{ background: C.mid, color: C.mint4, border: `1px solid ${C.mint1}33` }}
            />
          </div>
          <div className="flex gap-3">
            <button onClick={() => handle("approve")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "#E8F5E9", color: "#2E7D32" }}>
              <CheckCircle2 className="w-4 h-4" />Approve
            </button>
            <button onClick={() => handle("suggest")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "#E3F2FD", color: "#1565C0" }}>
              <MessageSquare className="w-4 h-4" />Suggest Changes
            </button>
            <button onClick={() => handle("reject")} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: "#FFEBEE", color: "#C62828" }}>
              <XCircle className="w-4 h-4" />Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadsTab() {
  const [entries, setEntries] = useState(() => {
    try { return JSON.parse(localStorage.getItem("reviewer_downloads") || "[]"); } catch { return []; }
  });
  const [form, setForm] = useState({ client: "", serial: "", count: "" });

  const save = () => {
    if (!form.client.trim() || !form.serial.trim()) return;
    const updated = [...entries, { ...form, id: Date.now(), at: new Date().toISOString() }];
    setEntries(updated);
    localStorage.setItem("reviewer_downloads", JSON.stringify(updated));
    setForm({ client: "", serial: "", count: "" });
  };

  const remove = (id) => {
    const updated = entries.filter((e) => e.id !== id);
    setEntries(updated);
    localStorage.setItem("reviewer_downloads", JSON.stringify(updated));
  };

  return (
    <div>
      <div className="rounded-xl border p-4 mb-6" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <h4 className="text-sm font-semibold mb-3" style={{ fontFamily: FONTS.serif }}>Add Download Entry</h4>
        <div className="grid grid-cols-3 gap-3">
          <input value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
            placeholder="Client name" className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", color: C.dark }} />
          <input value={form.serial} onChange={(e) => setForm((f) => ({ ...f, serial: e.target.value }))}
            placeholder="Serial / movie name" className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", color: C.dark }} />
          <input value={form.count} onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
            placeholder="No. of cue sheets" type="number" className="px-3 py-2 rounded-lg text-sm border focus:outline-none"
            style={{ borderColor: C.mint1 + "44", color: C.dark }} />
        </div>
        <button onClick={save} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: C.dark, color: C.mint4 }}>Add Entry</button>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-4 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: C.mint4, background: C.mint4 + "66", color: C.sub }}>
          Download Records ({entries.length})
        </div>
        {entries.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: C.sub }}>No entries yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "22" }}>
                <th className="text-left px-4 py-2">Client</th>
                <th className="text-left px-4 py-2">Serial / Movie</th>
                <th className="text-center px-4 py-2">Cue Sheets</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="w-8 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0" style={{ borderColor: C.mint4 + "55" }}>
                  <td className="px-4 py-3" style={{ color: C.dark }}>{e.client}</td>
                  <td className="px-4 py-3" style={{ color: C.dark }}>{e.serial}</td>
                  <td className="px-4 py-3 text-center font-medium" style={{ color: C.dark }}>{e.count || "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{e.at ? new Date(e.at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(e.id)} className="hover:opacity-70"><X className="w-3.5 h-3.5" style={{ color: C.danger }} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function ReviewerDashboard() {
  const { setActiveProjectId, setScreen } = useApp();
  const [tab, setTab] = useState("queue");
  const [submitted, setSubmitted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewEp, setReviewEp] = useState(null);
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    api.submittedEpisodes().then(setSubmitted).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleAction = async (eid, type, note) => {
    if (type === "approve") await api.approveEpisode(eid);
    else if (type === "reject") await api.rejectEpisode(eid, note);
    else await api.suggestEpisode(eid, note);
    setSubmitted((prev) => prev.filter((e) => e.id !== eid));
  };

  const handleDownload = (ep) => {
    if (!ep.project_id) return;
    setActiveProjectId(ep.project_id);
    setScreen("serial");
  };

  const filtered = submitted.filter((e) => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return true;
    return (e.project_title || "").toLowerCase().includes(q) || String(e.episode_number).includes(q) || (e.title || "").toLowerCase().includes(q);
  });

  const tabs = [
    { key: "queue", label: "Review Queue", badge: submitted.length },
    { key: "downloads", label: "Download Records" },
  ];

  return (
    <DashboardShell title="Reviewer" subtitle="Review submitted cue sheets, approve or request changes" tabs={tabs} activeTab={tab} onTab={setTab}>
      {reviewEp && <ReviewModal episode={reviewEp} onClose={() => setReviewEp(null)} onAction={handleAction} />}

      {tab === "queue" && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
              <input type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search by serial, episode…"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
                style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark }} />
              {searchQ && <button onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3" style={{ color: C.sub }} /></button>}
            </div>
            <span className="text-sm" style={{ color: C.sub }}>{filtered.length} episodes pending review</span>
          </div>

          <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
                  <th className="text-left px-5 py-3">Serial</th>
                  <th className="text-left px-5 py-3">Episode</th>
                  <th className="text-left px-5 py-3">Title</th>
                  <th className="text-left px-5 py-3">Air Date</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: C.sub }}>Loading…</td></tr>}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: C.sub }}>
                    {submitted.length === 0 ? "No episodes awaiting review." : `No results for "${searchQ}".`}
                  </td></tr>
                )}
                {filtered.map((ep) => (
                  <tr key={ep.id} className="border-b last:border-0 hover:bg-green-50/30" style={{ borderColor: C.mint4 + "55" }}>
                    <td className="px-5 py-3 font-medium" style={{ color: C.dark }}>{ep.project_title || "—"}</td>
                    <td className="px-5 py-3 text-center font-medium" style={{ color: C.dark }}>{ep.episode_number}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{ep.title || "—"}</td>
                    <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{ep.air_date || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setActiveProjectId(ep.project_id); setScreen("serial"); }}
                          className="text-xs flex items-center gap-1 hover:opacity-70" style={{ color: C.sub }}>
                          View <ChevronRight className="w-3 h-3" />
                        </button>
                        <button onClick={() => setReviewEp(ep)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: C.dark, color: C.mint4 }}>
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "downloads" && <DownloadsTab />}
    </DashboardShell>
  );
}
