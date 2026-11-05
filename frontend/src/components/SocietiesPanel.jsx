import { useCallback, useEffect, useState } from "react";
import { Plus, Edit2, Trash2, X, Paperclip } from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import EmailChips from "./EmailChips";
import { api } from "../utils/api";
import { showAlert, showConfirm } from "./Dialog";
import { useApp } from "../context/AppContext";

const TH = "text-left text-[0.625rem] uppercase tracking-wider font-semibold px-4 py-2.5";

function Emails({ list }) {
  if (!list.length) return <span style={{ color: C.sub }}>—</span>;
  return <div className="space-y-0.5">{list.map((e) => <div key={e}>{e}</div>)}</div>;
}

// ─── Add / edit society ───────────────────────────────────────────────────────
function SocietyForm({ initial, options, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || "",
    to_emails: initial?.to_emails || [],
    cc_emails: initial?.cc_emails || [],
    bcc_emails: initial?.bcc_emails || [],
    attachments: initial?.attachments || [],
    subject_template: initial?.subject_template || options.subject_template,
    body_template: initial?.body_template || options.body_template,
    notes: initial?.notes || "",
    is_active: initial ? initial.is_active : true,
  });
  const [saving, setSaving] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { await showAlert("Enter the society name.", { variant: "warn" }); return; }
    if (!form.to_emails.length) { await showAlert("Add the email address the society receives cue sheets at.", { variant: "warn" }); return; }
    setSaving(true);
    try {
      const { is_active, ...rest } = form;
      await onSave({ ...rest, notes: form.notes.trim() || null, ...(initial ? { is_active } : {}) });
      onClose();
    } catch (ex) {
      await showAlert(ex.message, { title: "Save Failed", variant: "error" });
    } finally { setSaving(false); }
  };

  const inp = "w-full px-3 py-2 rounded-lg text-sm focus:outline-none";
  const inpStyle = { background: C.mid, color: C.mint4, border: `1px solid ${alpha(C.mint1, "33")}` };
  const label = "block text-xs font-medium mb-1";

  return (
    <div className="cs-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="cs-dark cs-glass rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.mid }}>
          <h3 className="font-semibold text-lg" style={{ fontFamily: FONTS.serif, color: C.mint4 }}>
            {initial ? "Edit Society" : "Add Society"}
          </h3>
          <button onClick={onClose} style={{ color: C.muted }}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className={label} style={{ color: C.muted }}>Society Name *</label>
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. IPRS" className={inp} style={inpStyle} autoFocus />
          </div>
          <div>
            <label className={label} style={{ color: C.muted }}>To — where the society receives cue sheets *</label>
            <EmailChips tone="dark" value={form.to_emails} onChange={(v) => set({ to_emails: v })} placeholder="cuesheets@society.org" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label} style={{ color: C.muted }}>Default CC</label>
              <EmailChips tone="dark" value={form.cc_emails} onChange={(v) => set({ cc_emails: v })} placeholder="Optional" />
            </div>
            <div>
              <label className={label} style={{ color: C.muted }}>Default BCC</label>
              <EmailChips tone="dark" value={form.bcc_emails} onChange={(v) => set({ bcc_emails: v })} placeholder="Optional" />
            </div>
          </div>
          <div>
            <label className={label} style={{ color: C.muted }}>Attach by default</label>
            <div className="flex flex-wrap gap-4">
              {options.attachments.map((a) => (
                <label key={a.key} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.mint4 }}>
                  <input type="checkbox" checked={form.attachments.includes(a.key)}
                    onChange={(e) => set({ attachments: e.target.checked ? [...form.attachments, a.key] : form.attachments.filter((k) => k !== a.key) })} />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={label} style={{ color: C.muted }}>Subject</label>
            <input value={form.subject_template} onChange={(e) => set({ subject_template: e.target.value })} className={inp} style={inpStyle} />
          </div>
          <div>
            <label className={label} style={{ color: C.muted }}>Message</label>
            <textarea value={form.body_template} onChange={(e) => set({ body_template: e.target.value })} rows={6} className={`${inp} resize-y`} style={inpStyle} />
            <p className="text-[0.6875rem] mt-1" style={{ color: C.muted }}>
              Filled in when sending: {options.placeholders.map((p) => `{${p}}`).join("  ")}. The Reviewer can still edit the email before it goes.
            </p>
          </div>
          <div>
            <label className={label} style={{ color: C.muted }}>Notes</label>
            <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Optional" className={inp} style={inpStyle} />
          </div>
          {initial && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.mint4 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} />
              Active — can be picked in Submit to Society
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: C.muted }}>Cancel</button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: C.mint1, color: C.dark }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Societies tab (Admin + Reviewer) ─────────────────────────────────────────
export default function SocietiesPanel({ canDelete = false }) {
  const { pushToast } = useApp();
  const [societies, setSocieties] = useState([]);
  const [options, setOptions]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [editing, setEditing]     = useState(null);   // null | "new" | society

  const load = useCallback(() => {
    Promise.all([api.listSocieties(), api.societyOptions()])
      .then(([s, o]) => { setSocieties(s); setOptions(o); })
      .catch((ex) => pushToast({ kind: "error", title: "Could not load societies", body: ex.message }))
      .finally(() => setLoading(false));
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  const save = async (payload) => {
    if (editing === "new") {
      const s = await api.createSociety(payload);
      pushToast({ kind: "success", title: `${s.name} added` });
    } else {
      await api.updateSociety(editing.id, payload);
    }
    load();
  };

  const remove = async (s) => {
    const ok = await showConfirm(`Remove ${s.name} from the society list?`, { title: "Delete Society", confirmLabel: "Delete" });
    if (!ok) return;
    try { await api.deleteSociety(s.id); load(); }
    catch (ex) { await showAlert(ex.message, { title: "Failed", variant: "error" }); }
  };

  const label = (key) => options?.attachments.find((a) => a.key === key)?.label || key;

  if (loading) return <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>;

  return (
    <div className="space-y-5">
      {editing && options && <SocietyForm initial={editing === "new" ? null : editing} options={options} onSave={save} onClose={() => setEditing(null)} />}

      <div className="flex items-center gap-3">
        <p className="text-sm" style={{ color: C.sub }}>
          Where Submit to Society emails go. The client's Gmail sends to these addresses.
        </p>
        <button onClick={() => setEditing("new")}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: C.dark, color: C.mint4 }}>
          <Plus className="w-4 h-4" /> Add Society
        </button>
      </div>

      <div className="rounded-2xl border overflow-hidden" style={{ background: C.white, borderColor: alpha(C.mint1, "44") }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: alpha(C.mint4, "33"), color: C.sub }}>
              <th className={TH}>Society</th>
              <th className={TH}>To</th>
              <th className={TH}>CC / BCC</th>
              <th className={TH}>Attachments</th>
              <th className={TH}>Sent</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {societies.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-sm" style={{ color: C.sub }}>
                No societies yet. Add IPRS, PRS or ASCAP with the address they receive cue sheets at.
              </td></tr>
            )}
            {societies.map((s) => (
              <tr key={s.id} className="border-t align-top" style={{ borderColor: alpha(C.mint4, "88"), opacity: s.is_active ? 1 : 0.55 }}>
                <td className="px-4 py-3">
                  <div className="font-semibold flex items-center gap-2" style={{ color: C.dark }}>
                    {s.name}
                    {!s.is_active && <span className="text-[0.625rem] px-1.5 py-0.5 rounded font-semibold" style={{ background: T.grayBg, color: T.grayMid }}>Inactive</span>}
                  </div>
                  {s.notes && <div className="text-[0.6875rem] mt-0.5" style={{ color: C.sub }}>{s.notes}</div>}
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: C.dark }}><Emails list={s.to_emails} /></td>
                <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>
                  {s.cc_emails.length || s.bcc_emails.length ? (
                    <>
                      {s.cc_emails.length > 0 && <div>CC: {s.cc_emails.join(", ")}</div>}
                      {s.bcc_emails.length > 0 && <div>BCC: {s.bcc_emails.join(", ")}</div>}
                    </>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.attachments.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 text-[0.625rem] px-2 py-0.5 rounded-full font-semibold" style={{ background: T.blueBg, color: T.blue }}>
                        <Paperclip className="w-2.5 h-2.5" />{label(a)}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: C.sub }}>{s.submissions}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => setEditing(s)} title="Edit society"
                      className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90"
                      style={{ background: C.mint4, color: C.dark }}>
                      <Edit2 className="w-3 h-3" />
                    </button>
                    {canDelete && (
                      <button onClick={() => remove(s)} title="Delete society"
                        className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90"
                        style={{ background: T.redBg, color: T.red }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
