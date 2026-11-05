import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { C, alpha, T } from "../../styles/palette";
import { api } from "../../utils/api";
import {
  Card, ClientDetail, ClientOrdersChart, EditorsAttention, EditorsChart, Empty, LINE, NUM, Pipeline, TH, fmtDate, plural,
} from "./AdminInsights";

// Work Delegator Dashboard: the editor and client side of the Admin Dashboard (/api/insights/wd-dashboard).
// Allotted episodes split three ways — in progress, approved but not sent, sent to a society — so pending is
// whatever isn't sent yet.

const PARTS = [
  { key: "sent_allotted", label: "Sent", color: C.ok, hint: "Emailed to a society from the client's Gmail" },
  { key: "awaiting_send", label: "Approved", color: T.blue, hint: "Approved by a reviewer, not sent yet" },
  { key: "in_editing", label: "In progress", color: T.grayLight, hint: "With the editor or waiting for review" },
];

function Progress({ c }) {
  if (!c.allotted) return <span className="text-[0.6875rem]" style={{ color: C.muted }}>Nothing allotted</span>;
  return (
    <div className="w-28">
      <div className="flex gap-0.5 h-1.5" role="img" aria-label={PARTS.map((p) => `${p.label} ${c[p.key]}`).join(", ")}>
        {PARTS.filter((p) => c[p.key] > 0).map((p) => (
          <span key={p.key} className="h-full rounded-full" style={{ width: `${(c[p.key] / c.allotted) * 100}%`, background: p.color, minWidth: 3 }} />
        ))}
      </div>
      <div className="text-[0.625rem] mt-0.5" style={{ color: C.sub, ...NUM }}>{Math.round((c.sent_allotted / c.allotted) * 100)}% sent</div>
    </div>
  );
}

function ClientsWork({ rows }) {
  const [open, setOpen] = useState(null);
  const pending = (c) => c.in_editing + c.awaiting_send;
  const sorted = [...rows].sort((a, b) => pending(b) - pending(a) || b.allotted - a.allotted || a.name.localeCompare(b.name));
  return (
    <Card title="Clients" className="md:col-span-2"
      note="Episodes allotted for each client: still in progress, approved by a reviewer, and sent to a society. Pending is everything not sent yet. Click a client for its serials.">
      {rows.length === 0 ? <Empty>No clients yet.</Empty> : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[0.6875rem]" style={{ color: C.sub }}>
            {PARTS.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1.5" title={p.hint}>
                <span className="w-2 h-2 rounded-full" style={{ background: p.color }} /> {p.label}
              </span>
            ))}
          </div>
          <div className="-mx-4 overflow-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10" style={{ background: C.white }}>
                <tr className="border-b" style={{ borderColor: LINE, color: C.sub }}>
                  <th className={`${TH} pl-4`}>Client</th>
                  <th className={TH}>Progress</th>
                  <th className={`${TH} text-right`} title="Episodes given to editors">Allotted</th>
                  <th className={`${TH} text-right`} title={PARTS[2].hint}>In progress</th>
                  <th className={`${TH} text-right`} title={PARTS[1].hint}>Approved</th>
                  <th className={`${TH} text-right`} title={PARTS[0].hint}>Sent</th>
                  <th className={`${TH} text-right`} title="Allotted episodes not sent to a society yet">Pending</th>
                  <th className={`${TH} pr-4`}>Last sent</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => {
                  const isOpen = open === c.key;
                  const Chevron = isOpen ? ChevronDown : ChevronRight;
                  const cell = (v) => ({ color: v ? C.dark : C.muted, ...NUM });
                  return [
                    <tr key={c.key} onClick={() => setOpen(isOpen ? null : c.key)}
                      className="border-b cursor-pointer transition hover:bg-black/[0.03]" style={{ borderColor: alpha(C.mint4, "99") }}>
                      <td className="pl-4 pr-3 py-2">
                        <div className="flex items-center gap-1.5 font-semibold whitespace-nowrap" style={{ color: C.dark }}>
                          <Chevron className="w-3.5 h-3.5 shrink-0" style={{ color: C.muted }} /> {c.name}
                        </div>
                        {c.projects_count > 0 && (
                          <div className="pl-5 text-[0.625rem] whitespace-nowrap" style={{ color: C.sub }}>{plural(c.projects_count, "serial / movie", "serials / movies")}</div>
                        )}
                      </td>
                      <td className="px-3 py-2"><Progress c={c} /></td>
                      <td className="px-3 py-2 text-right" style={cell(c.allotted)}>{c.allotted}</td>
                      <td className="px-3 py-2 text-right" style={cell(c.in_editing)}>{c.in_editing}</td>
                      <td className="px-3 py-2 text-right" style={cell(c.awaiting_send)}>{c.awaiting_send}</td>
                      <td className="px-3 py-2 text-right" style={cell(c.sent_allotted)}>{c.sent_allotted}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-semibold" style={cell(pending(c))}>{pending(c)}</div>
                        {c.pending_count > 0 && (
                          <div className="text-[0.625rem] whitespace-nowrap" style={{ color: C.sub }}>in {plural(c.pending_count, "serial")}</div>
                        )}
                      </td>
                      <td className="pl-3 pr-4 py-2 whitespace-nowrap" style={{ color: C.sub }}>{fmtDate(c.last_sent_at)}</td>
                    </tr>,
                    isOpen && <tr key={`${c.key}-detail`}><td colSpan={8} className="p-0 border-b" style={{ borderColor: alpha(C.mint4, "99") }}><ClientDetail c={c} /></td></tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

export default function WDInsights({ reloadKey, onProjects }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.wdInsights()
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(e.message || "Failed to load the dashboard"))
      .finally(() => setLoading(false));
  };
  useEffect(load, [reloadKey]);

  if (!data) {
    return loading
      ? <div className="p-8 text-center text-sm" style={{ color: C.sub }}>Loading…</div>
      : <div className="p-8 text-center text-sm" style={{ color: C.danger }}>{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-[0.6875rem]" style={{ color: C.sub }}>
        <span>This week: {data.periods.week.label}</span>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold hover:opacity-80 disabled:opacity-50"
          style={{ background: C.mint4, color: C.dark }}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <EditorsChart data={data} />
        <ClientOrdersChart data={data} />
        <Pipeline data={data} links={(p) => [
          { label: plural(p.serials, "serial"), onClick: () => onProjects("serial") },
          { label: plural(p.movies, "movie"), onClick: () => onProjects("movie") },
        ]} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ClientsWork rows={data.clients} />
        <EditorsAttention data={data} />
      </div>
    </div>
  );
}
