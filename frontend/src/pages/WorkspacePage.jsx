import { useEffect, useState } from "react";
import { Plus, ChevronRight, Tv, Trash2 } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import Header from "../components/Header";
import NewSerialModal from "../components/NewSerialModal";
import { useApp } from "../context/AppContext";
import { api } from "../utils/api";

export default function WorkspacePage() {
  const { projects, setProjects, isAdmin, setActiveProjectId, setScreen } = useApp();
  const [showNew, setShowNew] = useState(false);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => {
            const approved = p.episodes.filter((e) => e.status === "approved").length;
            const submitted = p.episodes.filter((e) => e.status === "submitted").length;
            const rejected = p.episodes.filter((e) => e.status === "rejected").length;
            return (
              <div
                key={p.id}
                className="group border rounded-2xl transition-all hover:shadow-lg cursor-pointer"
                style={{ background: C.white, borderColor: C.mint1 + "44" }}
                onClick={() => { setActiveProjectId(p.id); setScreen("serial"); }}
              >
                <div className="p-6 relative">
                  <button
                    onClick={(e) => handleDelete(e, p.id)}
                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-red-50"
                    title="Delete serial"
                  ><Trash2 className="w-4 h-4" style={{ color: C.danger }} /></button>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-4" style={{ color: C.sub }}>
                    <Tv className="w-3.5 h-3.5" />{p.type}
                  </div>
                  <h3 className="text-2xl mb-3" style={{ fontFamily: FONTS.serif }}>{p.title}</h3>
                  <div className="text-xs space-y-1 mb-4" style={{ color: C.sub }}>
                    <div>{p.language} · {p.genre} · {p.year}</div>
                    <div>{p.productionCompany} · {p.channel}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#E8F5E9", color: C.ok }}>{approved} approved</span>
                    {submitted > 0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#F3E5F5", color: "#7B1FA2" }}>{submitted} pending review</span>}
                    {rejected > 0 && <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "#FFEBEE", color: C.danger }}>{rejected} rejected</span>}
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: C.mint4 }}>
                    <span className="text-xs" style={{ color: C.sub }}>{p.episodes.length} episodes</span>
                    <span className="text-xs uppercase tracking-wider flex items-center gap-1 font-medium group-hover:gap-2 transition-all" style={{ color: C.dark }}>
                      Open <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
