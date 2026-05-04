import { CheckCircle2, XCircle, Info } from "lucide-react";
import { C, FONTS } from "../styles/palette";
import { useApp } from "../context/AppContext";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function NotifIcon({ title }) {
  const t = (title || "").toLowerCase();
  if (t.includes("approved")) return <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: C.ok }} />;
  if (t.includes("rejected")) return <XCircle className="w-4 h-4 shrink-0" style={{ color: C.danger }} />;
  return <Info className="w-4 h-4 shrink-0" style={{ color: C.sub }} />;
}

export default function Notifications({ onClose }) {
  const { notifications, markRead, markAllRead } = useApp();

  return (
    <div className="absolute right-0 top-12 w-96 rounded-2xl border shadow-2xl z-50 overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="px-4 py-3 border-b font-semibold text-sm flex items-center justify-between" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
        <span style={{ fontFamily: FONTS.serif }}>Notifications</span>
        <button
          onClick={() => { markAllRead(); onClose?.(); }}
          className="text-[10px] uppercase tracking-wider hover:underline"
          style={{ color: C.sub }}
        >
          Mark all read
        </button>
      </div>
      <div className="overflow-y-auto max-h-[420px]">
        {notifications.length === 0 ? (
          <div className="p-6 text-sm text-center" style={{ color: C.sub }}>No notifications</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className="px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 transition"
              style={{ borderColor: C.mint4 + "88", background: n.is_read ? "" : "#FFF8F0" }}
              onClick={() => markRead(n.id)}
            >
              <div className="flex items-start gap-2">
                <NotifIcon title={n.title} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: C.dark }}>{n.title}</div>
                  {n.body && <div className="text-xs mt-0.5 line-clamp-2" style={{ color: C.sub }}>{n.body}</div>}
                  <div className="text-[10px] mt-1" style={{ color: C.sub }}>{timeAgo(n.at)}</div>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: C.danger }} />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
