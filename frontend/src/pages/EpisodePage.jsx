import { useState } from "react";
import { XCircle, CheckCircle2, History, Send, Check, Package } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import SectionTitle from "../components/SectionTitle";
import Fld from "../components/Fld";
import Inp from "../components/Inp";
import CueCard from "../components/CueCard";
import ExpBtn from "../components/ExpBtn";
import { USERS_DB } from "../constants/users";
import { uid } from "../utils/uid";
import { now } from "../utils/format";
import { buildIPRS, buildPRS, buildASCAP, dlExport } from "../utils/exporters";
import { useApp } from "../context/AppContext";

export default function EpisodePage() {
  const { activeProject, activeEpisode, currentUser, isAdmin, updateEpisode, setNotifications } = useApp();
  const [adminReviewNote, setAdminReviewNote] = useState("");

  if (!activeProject || !activeEpisode) return null;
  const proj = activeProject;
  const ep = activeEpisode;
  const uploader = USERS_DB.find((u) => u.id === ep.uploadedBy);

  const shareCheck = (c) => {
    const s = c.contributors.reduce((a, x) => a + Number(x.share || 0), 0);
    return { ok: s === 100, sum: s };
  };
  const allValid = ep.cues.every((c) => shareCheck(c).ok);

  const addEditEntry = (action) => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, editHistory: [...e.editHistory, { userId: currentUser.id, name: currentUser.name, action, at: now() }] }));
  };
  const updateCue = (cid, k, v) => {
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      status: e.status === "pending" || e.status === "rejected" ? "in_progress" : e.status,
      cues: e.cues.map((c) => (c.id === cid ? { ...c, [k]: v } : c)),
    }));
  };
  const updateContrib = (cid, coid, k, v) => {
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      status: e.status === "pending" || e.status === "rejected" ? "in_progress" : e.status,
      cues: e.cues.map((c) => (c.id === cid ? { ...c, contributors: c.contributors.map((co) => (co.id === coid ? { ...co, [k]: v } : co)) } : c)),
    }));
  };
  const addContrib = (cid) => {
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      cues: e.cues.map((c) => (c.id === cid ? { ...c, contributors: [...c.contributors, { id: uid(), name: "", role: "Composer", society: "", share: 0, ipi: "" }] } : c)),
    }));
  };
  const removeContrib = (cid, coid) => {
    updateEpisode(proj.id, ep.id, (e) => ({
      ...e,
      cues: e.cues.map((c) => (c.id === cid ? { ...c, contributors: c.contributors.filter((co) => co.id !== coid) } : c)),
    }));
  };
  const removeSong = (cid) => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, cues: e.cues.filter((c) => c.id !== cid) }));
    addEditEntry("Removed a song");
  };
  const handleSubmit = () => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, status: "submitted" }));
    addEditEntry("Submitted for approval");
  };
  const handleApprove = () => {
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, status: "approved", rejectionNote: "" }));
    addEditEntry("Approved");
    setNotifications((prev) => [...prev, { id: uid(), type: "approval", serial: proj.title, epNum: ep.number, message: `Episode ${ep.number} has been approved. Cue sheets are ready for export.`, from: currentUser.name, at: now(), read: false }]);
  };
  const handleReject = () => {
    if (!adminReviewNote.trim()) return;
    updateEpisode(proj.id, ep.id, (e) => ({ ...e, status: "rejected", rejectionNote: adminReviewNote }));
    addEditEntry(`Rejected — ${adminReviewNote}`);
    setNotifications((prev) => [...prev, { id: uid(), type: "rejection", serial: proj.title, epNum: ep.number, message: adminReviewNote, from: currentUser.name, at: now(), read: false }]);
    setAdminReviewNote("");
  };

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.sub }}>{proj.title} · Episode {String(ep.number).padStart(2, "0")}</div>
            <h2 className="text-4xl mb-2" style={{ fontFamily: FONTS.serif }}>Episode {ep.number}</h2>
            {ep.airDate && <div className="text-sm" style={{ color: C.sub }}>Air date: {ep.airDate}</div>}
          </div>
          <StatusBadge status={ep.status} />
        </div>

        {ep.status === "rejected" && ep.rejectionNote && (
          <div className="rounded-2xl border px-5 py-4 mb-6 flex items-start gap-3" style={{ background: "#FFEBEE", borderColor: "#EF9A9A" }}>
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: C.danger }} />
            <div>
              <div className="font-semibold text-sm mb-1" style={{ color: C.danger }}>Rejected — changes required</div>
              <p className="text-sm leading-relaxed" style={{ color: "#B71C1C" }}>{ep.rejectionNote}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border mb-6 overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
            <History className="w-4 h-4" style={{ color: C.sub }} />
            <span className="text-sm font-semibold" style={{ fontFamily: FONTS.serif }}>Activity Log</span>
            {uploader && <span className="ml-auto text-xs" style={{ color: C.sub }}>Uploaded by <strong>{uploader.name}</strong> on {ep.uploadedAt}</span>}
          </div>
          <div className="divide-y" style={{ borderColor: C.mint4 + "88" }}>
            {[...(ep.editHistory || [])].reverse().map((h, i) => (
              <div key={i} className="px-5 py-2.5 flex items-center gap-3 text-xs" style={{ background: i === 0 ? C.mint4 + "44" : "" }}>
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[8px] font-bold shrink-0" style={{ background: h.userId === currentUser?.id ? C.dark : C.mint1, color: h.userId === currentUser?.id ? C.mint1 : C.dark }}>
                  {USERS_DB.find((u) => u.id === h.userId)?.avatar || "??"}
                </div>
                <span className="font-medium" style={{ color: C.dark }}>{h.name}</span>
                <span style={{ color: C.sub }}>{h.action}</span>
                <span className="ml-auto" style={{ color: C.muted, fontFamily: FONTS.mono, fontSize: 10 }}>{h.at}</span>
                {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: C.mint1, color: C.dark }}>LATEST</span>}
              </div>
            ))}
          </div>
        </div>

        <SectionTitle title="Cue Details" />
        <div className="rounded-2xl border p-6 mb-6" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="grid grid-cols-4 gap-4">
            <Fld label="Serial Title" tag="once"><Inp value={proj.title} readOnly={isAdmin} /></Fld>
            <Fld label="Channel" tag="once"><Inp value={proj.channel} readOnly={isAdmin} /></Fld>
            <Fld label="Serial Type" tag="once"><Inp value={proj.serialType} readOnly={isAdmin} /></Fld>
            <Fld label="Language" tag="auto"><Inp value={proj.language} readOnly={isAdmin} /></Fld>
            <Fld label="Director" tag="auto"><Inp value={proj.director} readOnly={isAdmin} /></Fld>
            <Fld label="Genre" tag="auto"><Inp value={proj.genre} readOnly={isAdmin} /></Fld>
            <Fld label="Production Company" tag="auto"><Inp value={proj.productionCompany} readOnly={isAdmin} /></Fld>
            <Fld label="Country" tag="once"><Inp value={proj.countryOfOrigin} readOnly={isAdmin} /></Fld>
            <Fld label="Principal Actors" tag="auto" span={2}><Inp value={proj.actors} readOnly={isAdmin} /></Fld>
            <Fld label="Producer" tag="auto"><Inp value={proj.producer} readOnly={isAdmin} /></Fld>
            <Fld label="Production Year" tag="once"><Inp value={proj.year} readOnly={isAdmin} /></Fld>
          </div>
        </div>

        <SectionTitle title="Episode Details" />
        <div className="rounded-2xl border p-6 mb-6" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="grid grid-cols-4 gap-4">
            <Fld label="Episode #" tag="auto"><Inp value={ep.number} readOnly /></Fld>
            <Fld label="Air Date" tag="auto"><Inp value={ep.airDate} readOnly={isAdmin} /></Fld>
            <Fld label="Total Duration" tag="auto"><Inp value={ep.totalDuration} readOnly={isAdmin} mono /></Fld>
            <Fld label="Musical Duration" tag="auto"><Inp value={ep.musicalDuration} readOnly={isAdmin} mono /></Fld>
          </div>
        </div>

        <SectionTitle title={`Song Details (${ep.cues.length})`} />
        <div className="space-y-6 mb-8">
          {ep.cues.map((cue, idx) => (
            <CueCard
              key={cue.id}
              cue={cue}
              idx={idx}
              isAdmin={isAdmin}
              onUpdate={updateCue}
              onContribUpdate={updateContrib}
              onContribAdd={addContrib}
              onContribRemove={removeContrib}
              onRemove={removeSong}
            />
          ))}
        </div>

        {!isAdmin && (ep.status === "in_progress" || ep.status === "pending" || ep.status === "rejected" || ep.status === "edited") && (
          <div className="rounded-2xl border p-6 mb-6 flex items-center justify-between" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
            <div>
              <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Ready to submit?</div>
              <div className="text-xs mt-1" style={{ color: C.sub }}>Once submitted, the admin will review and approve or request changes.</div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!allValid || ep.cues.length === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition"
              style={{ background: C.dark, color: C.mint4 }}
            >
              <Send className="w-4 h-4" />Submit for Approval
            </button>
          </div>
        )}

        {ep.status === "submitted" && !isAdmin && (
          <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background: "#F3E5F5", borderColor: "#CE93D8" }}>
            <Send className="w-6 h-6 mx-auto mb-2" style={{ color: "#7B1FA2" }} />
            <div className="font-semibold" style={{ color: "#7B1FA2" }}>Submitted — awaiting admin review</div>
            <div className="text-xs mt-1" style={{ color: "#9C27B0" }}>You'll be notified once the admin approves or requests changes.</div>
          </div>
        )}

        {ep.status === "approved" && !isAdmin && (
          <div className="rounded-2xl border p-6 mb-6 text-center" style={{ background: "#E8F5E9", borderColor: "#A5D6A7" }}>
            <CheckCircle2 className="w-6 h-6 mx-auto mb-2" style={{ color: C.ok }} />
            <div className="font-semibold" style={{ color: C.ok }}>Approved by admin</div>
            <div className="text-xs mt-1" style={{ color: C.mid }}>Cue sheets are ready for export (admin-only).</div>
          </div>
        )}

        {isAdmin && ep.status === "submitted" && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: C.dark }}>
            <div className="px-6 py-5 border-b" style={{ borderColor: C.mid }}>
              <div className="font-semibold text-xl" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>Admin Review</div>
              <div className="text-xs mt-1" style={{ color: C.mint1 + "88" }}>Review the data above. Approve to enable export, or reject with a note.</div>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-widest block mb-2" style={{ color: C.mint1 + "88" }}>Rejection note (required to reject)</label>
                <textarea
                  value={adminReviewNote}
                  onChange={(e) => setAdminReviewNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Song Code missing for 'Montu Da Theme'. Please verify singer name."
                  className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none"
                  style={{ borderColor: C.mid, background: "rgba(255,255,255,0.05)", color: C.mint4 }}
                />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleApprove} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium hover:opacity-90 transition" style={{ background: C.ok, color: C.white }}>
                  <Check className="w-4 h-4" />Approve
                </button>
                <button onClick={handleReject} disabled={!adminReviewNote.trim()} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium disabled:opacity-40 hover:opacity-90 transition" style={{ background: C.danger, color: C.white }}>
                  <XCircle className="w-4 h-4" />Reject
                </button>
              </div>
            </div>
          </div>
        )}

        {isAdmin && ep.status === "approved" && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{ background: C.dark }}>
            <div className="px-6 py-5 flex items-center justify-between border-b" style={{ borderColor: C.mid }}>
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5" style={{ color: C.mint1 }} />
                <div>
                  <div className="font-semibold text-xl" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>Export Cue Sheets</div>
                  <div className="text-xs mt-0.5" style={{ color: C.mint1 + "88" }}>Approved — download in society template format</div>
                </div>
              </div>
              <span className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#27AE6033", border: "1px solid #27AE60", color: "#7DCEA0" }}>Ready to export</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-x" style={{ borderColor: C.mid }}>
              <ExpBtn label="IPRS" sub="India" icon="🇮🇳" onClick={() => dlExport(buildIPRS, "IPRS", proj, ep)} />
              <ExpBtn label="PRS" sub="UK" icon="🇬🇧" onClick={() => dlExport(buildPRS, "PRS", proj, ep)} />
              <ExpBtn label="ASCAP" sub="USA" icon="🇺🇸" onClick={() => dlExport(buildASCAP, "ASCAP", proj, ep)} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
