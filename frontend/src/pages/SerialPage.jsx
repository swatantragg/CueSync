import { useEffect, useState } from "react";
import { Upload, FileSpreadsheet, ChevronRight, Trash2 } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import Header from "../components/Header";
import MetaCard from "../components/MetaCard";
import StatusBadge from "../components/StatusBadge";
import { api } from "../utils/api";
import { useApp } from "../context/AppContext";

export default function SerialPage() {
  const { activeProject, isAdmin, updateProject, setActiveEpisodeId, setScreen } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reload = async () => {
    if (!activeProject) return;
    const [p, eps] = await Promise.all([api.getProject(activeProject.id), api.listEpisodes(activeProject.id)]);
    updateProject(activeProject.id, (prev) => ({
      ...prev, ...p,
      year: p.production_year, productionCompany: p.production_company, channel: p.channel_name,
      countryOfOrigin: p.country, backgroundMusicComposer: p.bg_music_composer,
      episodes: eps.map((e) => ({
        ...e, id: e.id, number: e.episode_number, airDate: e.air_date,
        totalDuration: e.total_duration_sec, musicalDuration: e.musical_duration_sec,
        status: "pending", editHistory: [], cues: [],
      })),
    }));
  };

  useEffect(() => { reload().catch(() => {}); }, [activeProject?.id]);

  if (!activeProject) return null;
  const proj = activeProject;

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true); setErr("");
    try {
      await api.uploadRough(proj.id, file);
      await reload();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); e.target.value = ""; }
  };

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: FONTS.sans, color: C.dark }}>
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: C.sub }}>{proj.type} · {proj.language}</div>
            <h2 className="text-5xl" style={{ fontFamily: FONTS.serif }}>{proj.title}</h2>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <MetaCard label="Director" value={proj.director} />
          <MetaCard label="Producer" value={proj.producer} />
          <MetaCard label="Channel" value={proj.channel} />
          <MetaCard label="Episodes" value={proj.episodes.length} mono />
        </div>

        {err && <div className="mb-4 text-sm" style={{ color: C.danger }}>{err}</div>}
        {busy && <div className="mb-4 text-sm" style={{ color: C.sub }}>Importing…</div>}
        {!isAdmin && (
          <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor: C.mint1 + "66", background: C.mint4 + "88" }}>
            <div className="px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: C.mint1 }}>
                  <Upload className="w-5 h-5" style={{ color: C.dark }} />
                </div>
                <div>
                  <div className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Import Rough Sheet</div>
                  <div className="text-xs" style={{ color: C.sub }}>Upload the composer's Excel → auto-extract episode data</div>
                </div>
              </div>
              <label className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer hover:opacity-90" style={{ background: C.dark, color: C.mint4 }}>
                <FileSpreadsheet className="w-4 h-4" />Choose .xlsx
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
              </label>
            </div>
          </div>
        )}

        <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
            <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif }}>Episodes ({proj.episodes.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider" style={{ borderColor: C.mint4, color: C.sub, background: C.mint4 + "33" }}>
                <th className="text-left px-5 py-3 w-16">Ep.</th>
                <th className="text-left px-5 py-3">Air Date</th>
                <th className="text-left px-5 py-3 w-28">Duration</th>
                <th className="text-left px-5 py-3 w-16">Songs</th>
                <th className="text-left px-5 py-3 w-32">Status</th>
                <th className="text-left px-5 py-3">Last Activity</th>
                <th className="text-right px-5 py-3 w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {proj.episodes.map((ep) => {
                const lastEdit = ep.editHistory?.[ep.editHistory.length - 1];
                return (
                  <tr key={ep.id} className="border-b last:border-0 hover:bg-green-50/30 transition" style={{ borderColor: C.mint4 + "88" }}>
                    <td className="px-5 py-3 font-mono text-sm">{String(ep.number).padStart(2, "0")}</td>
                    <td className="px-5 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{ep.airDate || "—"}</td>
                    <td className="px-5 py-3 text-xs" style={{ fontFamily: FONTS.mono, color: C.sub }}>{ep.totalDuration}</td>
                    <td className="px-5 py-3" style={{ color: C.sub }}>{ep.cues.length}</td>
                    <td className="px-5 py-3"><StatusBadge status={ep.status} /></td>
                    <td className="px-5 py-3 text-xs" style={{ color: C.sub }}>{lastEdit ? `${lastEdit.name} · ${lastEdit.at}` : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={async () => {
                            if (!confirm(`Delete episode ${ep.number}?`)) return;
                            try { await api.deleteEpisode(ep.id); await reload(); }
                            catch (ex) { alert(ex.message); }
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-50"
                          title="Delete episode"
                        ><Trash2 className="w-4 h-4" style={{ color: C.danger }} /></button>
                        <button
                          onClick={() => { setActiveEpisodeId(ep.id); setScreen("episode"); }}
                          className="text-xs uppercase tracking-wider flex items-center gap-1 font-medium hover:gap-2 transition-all"
                          style={{ color: C.dark }}
                        >
                          {isAdmin ? "Review" : "Open"} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
