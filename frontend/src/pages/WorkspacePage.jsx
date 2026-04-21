import { useEffect, useMemo, useState } from "react";
import { Plus, ChevronRight, Tv, Trash2, ChevronLeft } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import Header from "../components/Header";
import NewSerialModal from "../components/NewSerialModal";
import { useApp } from "../context/AppContext";
import { api } from "../utils/api";

const PAGE_SIZE = 10;

export default function WorkspacePage() {
  const { projects, setProjects, isAdmin, setActiveProjectId, setScreen } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(1);

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
    if (!confirm("Delete this serial and all its episodes?")) return;
    try { await api.deleteProject(id); setProjects((prev) => prev.filter((p) => p.id !== id)); }
    catch (ex) { alert(ex.message); }
  };

  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => projects.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [projects, pageSafe]
  );

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-10">
          <div>
            <h2 className="text-5xl mb-2" style={{ fontFamily: FONTS.serif }}>Projects</h2>
            <p className="text-sm" style={{ color: C.sub }}>
              {isAdmin ? "Admin view — review and approve episode submissions" : "Data entry — fill cue details and submit for approval"}
            </p>
          </div>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
            <Plus className="w-4 h-4" />New Serial
          </button>
          {showNew && <NewSerialModal onClose={() => setShowNew(false)} onCreate={handleCreate} />}
        </div>

        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
            <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Serials ({projects.length})</h3>
            <span className="text-xs" style={{ color: C.sub }}>Page {pageSafe} of {totalPages}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
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
                <tr><td colSpan={6} className="px-5 py-10 text-center text-sm" style={{ color: C.sub }}>No serials yet.</td></tr>
              )}
              {pageItems.map((p) => {
                const approved = p.episodes.filter((e) => e.status === "approved").length;
                const submitted = p.episodes.filter((e) => e.status === "submitted").length;
                const rejected = p.episodes.filter((e) => e.status === "rejected").length;
                return (
                  <tr
                    key={p.id}
                    className="border-b last:border-0 hover:bg-green-50/40 transition cursor-pointer"
                    style={{ borderColor: C.mint4 + "88" }}
                    onClick={() => { setActiveProjectId(p.id); setScreen("serial"); }}
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium" style={{ fontFamily: FONTS.serif, color: C.dark }}>{p.title}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: C.sub }}>{p.episodes.length} episodes</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider" style={{ color: C.sub }}>
                        <Tv className="w-3.5 h-3.5" />{p.type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs" style={{ color: C.sub }}>
                      {[p.language, p.genre, p.year].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-5 py-4 text-xs" style={{ color: C.sub }}>
                      {[p.productionCompany, p.channel].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#E8F5E9", color: C.ok }}>{approved} approved</span>
                        {submitted > 0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#F3E5F5", color: "#7B1FA2" }}>{submitted} in review</span>}
                        {rejected > 0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#FFEBEE", color: C.danger }}>{rejected} rejected</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => handleDelete(e, p.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50"
                          title="Delete serial"
                        ><Trash2 className="w-4 h-4" style={{ color: C.danger }} /></button>
                        <span className="text-xs uppercase tracking-wider flex items-center gap-1 font-medium" style={{ color: C.dark }}>
                          Open <ChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t flex items-center justify-between text-xs" style={{ borderColor: C.mint4, background: C.mint4 + "22", color: C.sub }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageSafe <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg disabled:opacity-30"
                style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className="w-8 h-8 rounded-lg text-xs font-medium"
                    style={{
                      background: n === pageSafe ? C.dark : C.white,
                      color: n === pageSafe ? C.mint4 : C.dark,
                      border: `1px solid ${C.mint1}55`,
                    }}
                  >{n}</button>
                ))}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageSafe >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg disabled:opacity-30"
                style={{ background: C.white, border: `1px solid ${C.mint1}55`, color: C.dark }}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
