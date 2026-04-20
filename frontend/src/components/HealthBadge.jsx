import { useEffect, useState } from "react";
import { api } from "../utils/api";
import { C } from "../styles/palette";

export default function HealthBadge() {
  const [status, setStatus] = useState("checking");
  useEffect(() => {
    let alive = true;
    const ping = () =>
      api.health()
        .then(() => alive && setStatus("online"))
        .catch(() => alive && setStatus("offline"));
    ping();
    const id = setInterval(ping, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const map = {
    checking: { c: C.muted, t: "API …" },
    online:   { c: C.ok,    t: `API ${api.base}` },
    offline:  { c: C.danger, t: "API offline" },
  };
  const s = map[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg" style={{ color: s.c, background: s.c + "22" }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.c }} />
      {s.t}
    </span>
  );
}
