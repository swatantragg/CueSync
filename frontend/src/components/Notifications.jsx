import { CheckCircle2, XCircle } from "lucide-react";
import { C } from "../styles/palette";
import { useApp } from "../context/AppContext";

export default function Notifications({ onClose }) {
  const { notifications, setNotifications } = useApp();
  return (
    <div className="absolute right-0 top-12 w-96 rounded-2xl border shadow-2xl z-50 overflow-hidden" style={{ background: C.white, borderColor: C.mint1 + "44" }}>
      <div className="px-4 py-3 border-b font-semibold text-sm flex items-center justify-between" style={{ borderColor: C.mint4, background: C.mint4 + "66" }}>
        <span>Notifications</span>
        <button
          onClick={() => { setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))); onClose?.(); }}
          className="text-[10px] uppercase tracking-wider hover:underline"
          style={{ color: C.sub }}
        >
          Mark all read
        </button>
      </div>
      {notifications.length === 0 ? (
        <div className="p-4 text-sm text-center" style={{ color: C.sub }}>No notifications</div>
      ) : (
        notifications.map((n) => (
          <div key={n.id} className="px-4 py-3 border-b last:border-0 text-sm" style={{ borderColor: C.mint4 + "88", background: n.read ? "" : "#FFF8F0" }}>
            <div className="flex items-center gap-2 mb-1">
              {n.type === "rejection" ? <XCircle className="w-4 h-4 shrink-0" style={{ color: C.danger }} /> : <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: C.ok }} />}
              <span className="font-medium" style={{ color: n.type === "rejection" ? C.danger : C.ok }}>
                {n.type === "rejection" ? "Rejected" : "Approved"}
              </span>
              <span style={{ color: C.sub }}>·</span>
              <span className="font-medium" style={{ color: C.dark }}>{n.serial} Ep {n.epNum}</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: C.sub }}>{n.message}</p>
            <div className="text-[10px] mt-1" style={{ color: C.muted }}>by {n.from} · {n.at}</div>
          </div>
        ))
      )}
    </div>
  );
}
