import { useState } from "react";
import { CheckCircle2, XCircle, Info, MessageSquare, Briefcase } from "lucide-react";
import { C, FONTS, alpha, T } from "../styles/palette";
import { useApp } from "../context/AppContext";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function categorize(n) {
  if (n.entity_type === "delegation") return "allotted";
  const t = (n.title || "").toLowerCase();
  if (t.includes("approved") || t.includes("approval")) return "approved";
  if (t.includes("reject")) return "rejected";
  if (t.includes("suggest") || t.includes("change") || t.includes("edited")) return "suggested";
  return "other";
}

const TABS = [
  { key: "all",       label: "All"       },
  { key: "allotted",  label: "Allotted"  },
  { key: "rejected",  label: "Rejected"  },
  { key: "approved",  label: "Approved"  },
  { key: "suggested", label: "Suggested" },
];

const CAT_STYLE = {
  allotted:  { color: T.orange, bg: T.orangeBg, Icon: Briefcase     },
  rejected:  { color: T.red, bg: T.redBg, Icon: XCircle       },
  approved:  { color: T.green, bg: T.greenBg, Icon: CheckCircle2  },
  suggested: { color: T.blue, bg: T.blueBg, Icon: MessageSquare },
  // Getters so a theme switch is picked up without a reload.
  other:     { get color() { return C.sub; }, get bg() { return C.mint4; }, Icon: Info },
};

function NotifIcon({ n }) {
  const { Icon, color } = CAT_STYLE[categorize(n)] || CAT_STYLE.other;
  return <Icon className="w-4 h-4 shrink-0" style={{ color }} />;
}

export default function Notifications({ onClose }) {
  const { notifications, markRead, markAllRead } = useApp();
  const [activeTab, setActiveTab] = useState("all");

  const filtered = activeTab === "all"
    ? notifications
    : notifications.filter((n) => categorize(n) === activeTab);

  const unreadCount = (key) => {
    const src = key === "all" ? notifications : notifications.filter((n) => categorize(n) === key);
    return src.filter((n) => !n.is_read).length;
  };

  return (
    <div
      className="absolute right-0 top-12 rounded-2xl border shadow-2xl z-50 overflow-hidden flex flex-col"
      style={{ background: C.white, borderColor: alpha(C.mint1, "44"), width: "min(26rem, calc(100vw - 2rem))", maxHeight: "min(32rem, calc(100vh - 6rem))" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: C.mint4, background: alpha(C.mint4, "66") }}>
        <span className="font-semibold text-sm" style={{ fontFamily: FONTS.serif }}>Notifications</span>
        <button
          onClick={() => { markAllRead(); onClose?.(); }}
          className="text-[0.625rem] uppercase tracking-wider hover:underline"
          style={{ color: C.sub }}
        >
          Mark all read
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex border-b shrink-0" style={{ borderColor: alpha(C.mint4, "88") }}>
        {TABS.map(({ key, label }) => {
          const count    = unreadCount(key);
          const isActive = activeTab === key;
          const cs       = CAT_STYLE[key] || { color: C.dark, bg: C.mint4 };
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="flex-1 px-2 py-2.5 text-[0.625rem] font-semibold uppercase tracking-wide transition-all whitespace-nowrap"
              style={{
                color:        isActive ? (key === "all" ? C.dark : cs.color) : C.muted,
                background:   isActive ? (key === "all" ? alpha(C.mint4, "88") : cs.bg) : "transparent",
                borderBottom: isActive ? `2px solid ${key === "all" ? C.dark : cs.color}` : "2px solid transparent",
              }}
            >
              {label}
              {count > 0 && (
                <span
                  className="ml-1 px-1 py-0.5 rounded-full text-[0.5625rem] font-bold"
                  style={{ background: key === "all" ? C.danger : cs.color, color: C.white }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: C.sub }}>
            No {activeTab === "all" ? "" : activeTab + " "}notifications
          </div>
        ) : (
          filtered.map((n) => {
            const cat = categorize(n);
            const cs  = CAT_STYLE[cat] || CAT_STYLE.other;
            return (
              <div
                key={n.id}
                className="px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 transition"
                style={{ borderColor: alpha(C.mint4, "88"), background: n.is_read ? "" : alpha(cs.bg, "55") }}
                onClick={() => markRead(n.id)}
              >
                <div className="flex items-start gap-2.5">
                  <NotifIcon n={n} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: C.dark }}>{n.title}</div>
                    {n.body && <div className="text-xs mt-0.5 line-clamp-2" style={{ color: C.sub }}>{n.body}</div>}
                    <div className="text-[0.625rem] mt-1" style={{ color: C.muted }}>{timeAgo(n.at)}</div>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: cs.color }} />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
