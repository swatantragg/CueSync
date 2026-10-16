import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { C, FONTS, alpha } from "../styles/palette";

// Flattens <option>/<optgroup> children into a list, same as a native <select> would.
function readOptions(children) {
  const out = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "optgroup") {
      out.push({ group: child.props.label });
      out.push(...readOptions(child.props.children));
      return;
    }
    if (child.type !== "option") return;
    const label = child.props.children;
    const value = child.props.value !== undefined ? child.props.value : Children.toArray(label).join("");
    out.push({ value: String(value), label, disabled: !!child.props.disabled });
  });
  return out;
}

/**
 * Themed drop-in for <select>: same value / onChange(e.target.value) contract, styled trigger
 * (className/style apply to it) and a listbox rendered in a portal so tables and modals can't clip it.
 * `tone="dark"` matches the dark modals.
 */
export default function Select({ value, onChange, children, className = "", style, disabled, tone = "light", placeholder, title, onClick }) {
  const options = useMemo(() => readOptions(children), [children]);
  const choices = options.filter((o) => !o.group);
  const current = choices.find((o) => o.value === String(value ?? ""));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const dark = tone === "dark";

  const panel = dark
    ? { bg: C.dark, border: alpha(C.mint1, "33"), text: C.mint4, hover: C.mid, selBg: C.mint1, selText: C.dark, group: alpha(C.mint1, "AA") }
    : { bg: C.white, border: alpha(C.mint1, "66"), text: C.dark, hover: C.mint4, selBg: C.dark, selText: C.mint4, group: C.sub };

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 240 && r.top > below;
    setPos({
      left: r.left,
      width: Math.max(r.width, 160),
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
      maxHeight: Math.max(160, Math.min(320, (up ? r.top : below) - 16)),
    });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onMove = (e) => { if (!listRef.current?.contains(e.target)) place(); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const choose = (opt) => {
    if (!opt || opt.disabled) return;
    setOpen(false);
    btnRef.current?.focus();
    if (opt.value !== String(value ?? "")) onChange?.({ target: { value: opt.value } });
  };

  const step = (from, dir) => {
    for (let i = from + dir; i >= 0 && i < choices.length; i += dir) if (!choices[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e) => {
    if (disabled) return;
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      setActive(Math.max(0, choices.indexOf(current)));
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape" || e.key === "Tab") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => step(i, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => step(i, -1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(step(-1, 1)); }
    else if (e.key === "End") { e.preventDefault(); setActive(step(choices.length, -1)); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(choices[active]); }
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = choices.findIndex((o) => !o.disabled && Children.toArray(o.label).join("").toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  let idx = -1;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onClick?.(e); if (disabled) return; setActive(Math.max(0, choices.indexOf(current))); setOpen((o) => !o); }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${className} inline-flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
        style={{ fontFamily: FONTS.sans, ...style, ...(open ? { boxShadow: `0 0 0 2px ${alpha(C.mint1, "88")}` } : null) }}
      >
        <span className="truncate">{current ? current.label : (placeholder || "Select…")}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform" style={{ opacity: 0.7, transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && pos && createPortal(
        <div
          ref={listRef}
          role="listbox"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className={`${dark ? "cs-dark " : ""}cs-pop cs-scroll fixed rounded-xl shadow-2xl overflow-y-auto py-1`}
          style={{
            zIndex: 1000, left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width,
            maxWidth: Math.max(pos.width, 320), maxHeight: pos.maxHeight,
            background: panel.bg, border: `1px solid ${panel.border}`, fontFamily: FONTS.sans,
          }}
        >
          {options.map((o, i) => {
            if (o.group) {
              return (
                <div key={`g${i}`} className="px-3 pt-2 pb-1 text-[0.625rem] font-bold uppercase tracking-widest" style={{ color: panel.group }}>
                  {o.group}
                </div>
              );
            }
            idx += 1;
            const myIdx = idx;
            const selected = o.value === String(value ?? "");
            const hot = myIdx === active;
            return (
              <div
                key={`${o.value}-${i}`}
                data-idx={myIdx}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(myIdx)}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
                className="mx-1 px-3 py-2 rounded-lg text-sm flex items-center gap-2 cursor-pointer"
                style={{
                  background: selected ? panel.selBg : hot ? panel.hover : "transparent",
                  color: selected ? panel.selText : panel.text,
                  fontWeight: selected ? 600 : 500,
                  opacity: o.disabled ? 0.4 : 1,
                }}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
