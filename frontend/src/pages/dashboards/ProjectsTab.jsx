import { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, Tv, Trash2, ChevronLeft, Search, ShieldOff, X } from "lucide-react";
import { showAlert, showConfirm } from "../../components/Dialog";
import { C, FONTS } from "../../styles/palette";
import NewSerialModal from "../../components/NewSerialModal";
import { useApp } from "../../context/AppContext";
import { api } from "../../utils/api";

const PAGE_SIZE = 10;

export default function ProjectsTab({ hideHeader = false, showCreateBtn, filterProjectIds }) {
  const { projects, setProjects, isAdmin, setActiveProjectId, setScreen } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showPrivModal, setShowPrivModal] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    api.projects().then((list) => {
      setProjects(list.map((p) => ({
        ...p,
        year: p.production_year,
        productionCompany: p.production_company,
        channel: p.channel_name,
        countryOfOrigin: p.country,
        backgroundMusicComposer: p.bg_music_composer,
        episodes: [],
      })));
    }).catch(() => {});
  }, []);

  const handleCreate = async (payload) => {
    const p = await api.createProject(payload);
    setProjects((prev) => [{ ...p, episodes: [] }, ...prev]);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!isAdmin) { setShowPrivModal(true); return; }
    const serial = projects.find((p) => p.id === id);
    const ok = await showConfirm(
      `"${serial?.title || "this serial"}" and all its episodes will be permanently deleted.`,
      { title: "Delete Serial", confirmLabel: "Delete", variant: "danger", detail: "This cannot be undone." }
    );
    if (!ok) return;
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    } catch (ex) { await showAlert(ex.message, { title: "Delete Failed", variant: "error" }); }
  };

  const handleDeleteSelected = async () => {
    if (!selected.size) return;
    if (!isAdmin) { setShowPrivModal(true); return; }
    const ok = await showConfirm(
      `${selected.size} serial${selected.size > 1 ? "s" : ""} and all their episodes will be permanently deleted.`,
      { title: `Delete ${selected.size} Serial${selected.size > 1 ? "s" : ""}`, confirmLabel: "Delete All", variant: "danger", detail: "This cannot be undone." }
    );
    if (!ok) return;
    setDeleting(true);
    const ids = [...selected];
    const successIds = new Set();
    const errors = [];
    for (const id of ids) {
      try { await api.deleteProject(id); successIds.add(id); }
      catch (ex) { errors.push(ex.message); }
    }
    setProjects((prev) => prev.filter((p) => !successIds.has(p.id)));
    setSelected((prev) => { const n = new Set(prev); successIds.forEach((id) => n.delete(id)); return n; });
    setDeleting(false);
    if (errors.length) await showAlert(`${errors.length} deletion(s) failed:\n${errors.join("\n")}`, { title: "Partial Failure", variant: "warn" });
  };

  const filtered = useMemo(() => {
    let list = projects;
    if (filterProjectIds) list = list.filter((p) => filterProjectIds.has(p.id));
    const q = searchQ.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.type || "").toLowerCase().includes(q) ||
      (p.language || "").toLowerCase().includes(q) ||
      (p.genre || "").toLowerCase().includes(q) ||
      (p.productionCompany || "").toLowerCase().includes(q) ||
      (p.channel || "").toLowerCase().includes(q)
    );
  }, [projects, searchQ, filterProjectIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe]
  );

  const pageIds = pageItems.map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allPageSelected
    ? new Set([...selected].filter((id) => !pageIds.includes(id)))
    : new Set([...selected, ...pageIds])
  );

  useEffect(() => { setPage(1); }, [searchQ]);

  return (
    <div>
      {showPrivModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{ background: C.dark }}>
            <div className="flex items-center gap-2.5 mb-4">
              <ShieldOff className="w-5 h-5" style={{ color: "#ef4444" }} />
              <span className="font-semibold" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>Insufficient Privilege</span>
            </div>
            <p className="text-sm mb-5" style={{ color: "#9ca3af" }}>Only admins can delete serials.</p>
            <button onClick={() => setShowPrivModal(false)} className="w-full py-2 rounded-xl text-sm font-medium" style={{ background: C.mint1, color: C.dark }}>Got it</button>
          </div>
        </div>
      )}

      {!hideHeader && (
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-3xl mb-1" style={{ fontFamily: FONTS.serif }}>Serials</h2>
          </div>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
            <Plus className="w-4 h-4" />New Serial
          </button>
        </div>
      )}

      {showNew && <NewSerialModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}

      <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
        <div className="px-6 py-4 border-b flex flex-wrap items-center gap-3 justify-between" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
          <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>
            {filtered.length}{searchQ ? ` of ${projects.length}` : ""} Serials
          </h3>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: C.sub }} />
              <input type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search serials…"
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:outline-none"
                style={{ borderColor: C.mint1 + "44", background: C.white, color: C.dark, width: 190 }} />
              {searchQ && <button onClick={() => setSearchQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: C.sub }}><X className="w-3 h-3" /></button>}
            </div>
            {selected.size > 0 && isAdmin && (
              <button onClick={handleDeleteSelected} disabled={deleting}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                style={{ background: "#FFEBEE", color: C.danger, border: "1px solid #EF9A9A" }}>
                <Trash2 className="w-3.5 h-3.5" />{deleting ? "Deleting…" : `Delete ${selected.size}`}
              </button>
            )}
            {selected.size > 0 && !isAdmin && (
              <button onClick={() => setShowPrivModal(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: "#FFEBEE", color: C.danger, border: "1px solid #EF9A9A" }}>
                <Trash2 className="w-3.5 h-3.5" />Delete {selected.size}
              </button>
            )}
            {(showCreateBtn ?? !hideHeader) && <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
              <Plus className="w-3.5 h-3.5" />New Serial
            </button>}
            <span className="text-xs" style={{ color: C.sub }}>Page {pageSafe} of {totalPages}</span>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
              <th className="px-5 py-3 w-10"><input type="checkbox" checked={allPageSelected} onChange={toggleAll} style={{ accentColor: C.dark }} /></th>
              <th className="text-left px-5 py-3">Title</th>
              <th className="text-left px-5 py-3 w-28">Type</th>
              <th className="text-left px-5 py-3">Language · Genre · Year</th>
              <th className="text-left px-5 py-3">Production · Channel</th>
              <th className="text-left px-5 py-3 w-56">Status</th>
              <th className="text-right px-5 py-3 w-40">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-sm" style={{ color: C.sub }}>
                {searchQ ? `No serials match "${searchQ}".` : "No serials yet."}
              </td></tr>
            )}
            {pageItems.map((p) => {
              const approved = (p.episodes || []).filter((e) => e.status === "approved").length;
              const submitted = (p.episodes || []).filter((e) => e.status === "submitted").length;
              const rejected = (p.episodes || []).filter((e) => e.status === "rejected").length;
              const isSelected = selected.has(p.id);
              return (
                <tr key={p.id}
                  className="border-b last:border-0 hover:bg-green-50/40 transition cursor-pointer"
                  style={{ borderColor: C.mint4 + "88", background: isSelected ? C.mint4 + "99" : undefined }}
                  onClick={() => { setActiveProjectId(p.id); setScreen("serial"); }}>
                  <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(p.id)} style={{ accentColor: C.dark }} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium" style={{ fontFamily: FONTS.serif, color: C.dark }}>{p.title}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: C.sub }}>{(p.episodes || []).length} episodes</div>
                  </td>
                  <td className="px-5 py-4"><span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider" style={{ color: C.sub }}><Tv className="w-3.5 h-3.5" />{p.type}</span></td>
                  <td className="px-5 py-4 text-xs" style={{ color: C.sub }}>{[p.language, p.genre, p.year].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-5 py-4 text-xs" style={{ color: C.sub }}>{[p.productionCompany, p.channel].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#E8F5E9", color: C.ok }}>{approved} approved</span>
                      {submitted > 0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#F3E5F5", color: "#7B1FA2" }}>{submitted} in review</span>}
                      {rejected > 0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#FFEBEE", color: C.danger }}>{rejected} rejected</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {isAdmin && <button onClick={(e) => handleDelete(e, p.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete"><Trash2 className="w-4 h-4" style={{ color: C.danger }} /></button>}
                      <button onClick={() => { setActiveProjectId(p.id); setScreen("serial"); }}
                        className="text-xs uppercase tracking-wider flex items-center gap-1 font-medium hover:gap-2 transition-all" style={{ color: C.dark }}>
                        Open <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t flex items-center justify-between text-xs" style={{ borderColor: C.mint4, background: C.mint4 + "22", color: C.sub }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg disabled:opacity-30"
              style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}>
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button key={n} onClick={() => setPage(n)} className="w-8 h-8 rounded-lg text-xs font-medium"
                  style={{ background: n === pageSafe ? C.dark : C.white, color: n === pageSafe ? C.mint4 : C.dark, border: `1px solid ${C.mint1}55` }}>{n}</button>
              ))}
            </div>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg disabled:opacity-30"
              style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
