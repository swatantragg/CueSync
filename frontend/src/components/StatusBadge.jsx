import { STATUS } from "../constants/status";

export default function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  const Icon = s.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium" style={{ color: s.color, background: s.bg }}>
      <Icon className="w-3.5 h-3.5" /> {s.label}
    </span>
  );
}
