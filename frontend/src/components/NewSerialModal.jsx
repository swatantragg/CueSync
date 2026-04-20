import { useState } from "react";
import { X } from "lucide-react";
import { C, FONTS } from "../styles/palette";

const COUNTRIES = ["India", "UK", "USA", "Bangladesh", "Other"];
const TYPES = ["serial", "movie"];

export default function NewSerialModal({ onClose, onCreate }) {
  const [f, setF] = useState({ title: "", type: "serial", country: "India", production_year: new Date().getFullYear(), total_episodes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return setErr("Title required");
    setBusy(true); setErr("");
    try {
      await onCreate({
        title: f.title.trim(),
        type: f.type,
        country: f.country,
        production_year: Number(f.production_year) || null,
        total_episodes: f.total_episodes ? Number(f.total_episodes) : null,
      });
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const inp = { padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.mint1}55`, fontSize: 14, width: "100%", background: C.white };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <form onSubmit={submit} style={{ background: C.white, borderRadius: 16, padding: 28, width: 480, fontFamily: FONTS.sans }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: FONTS.serif, fontSize: 24 }}>New Serial</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs" style={{ color: C.sub }}>Serial Title
            <input style={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>Type
            <select style={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: C.sub }}>Country
            <select style={inp} value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: C.sub }}>Production Year
            <input type="number" style={inp} value={f.production_year} onChange={(e) => setF({ ...f, production_year: e.target.value })} />
          </label>
          <label className="text-xs" style={{ color: C.sub }}>Total Episodes
            <input type="number" style={inp} value={f.total_episodes} onChange={(e) => setF({ ...f, total_episodes: e.target.value })} />
          </label>
        </div>
        {err && <div className="text-xs mt-3" style={{ color: C.danger }}>{err}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${C.mint1}55` }}>Cancel</button>
          <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ background: C.dark, color: C.mint4 }}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
