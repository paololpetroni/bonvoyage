import { useId, useMemo, useState } from "react";
import { CUISINE_OPTIONS, cuisineInfo } from "../lib/cuisines.js";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Searchable cuisine picker: type "march" to find both Marchigiano regions. Picked cuisines show as removable chips.
export default function CuisinePicker({ value, onChange, max, placeholder = "Type a cuisine or region, e.g. Molisano", label, chipClass = "" }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const full = max != null && value.length >= max;

  const matches = useMemo(() => {
    const n = norm(q.trim());
    const list = CUISINE_OPTIONS.filter((o) => !value.includes(o.key));
    // Nothing typed yet: list every cuisine family. Typing: families and regions that match
    if (!n) return list.filter((o) => o.isFamily);
    const seen = new Set();
    const out = [];
    for (const o of list) {
      if (seen.has(o.key)) continue;
      if (norm(o.label).includes(n) || norm(o.group).includes(n)) {
        seen.add(o.key);
        out.push(o);
      }
    }
    return out.slice(0, 40);
  }, [q, value]);

  function pick(o) {
    if (full) return;
    onChange([...value, o.key]);
    setQ("");
    setActive(0);
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); pick(matches[active]); }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className="cuisine-picker">
      {value.length > 0 && (
        <div className="chips">
          {value.map((k) => {
            const c = cuisineInfo(k);
            return (
              <span key={k} className={`chip pick ${chipClass}`}>
                {c ? c.label : k}{c && c.key !== c.family ? <span className="muted"> · {c.familyLabel}</span> : null}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={`Remove ${c ? c.label : k}`}>×</button>
              </span>
            );
          })}
        </div>
      )}
      {!full && (
        <div className="combo">
          <input type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-label={label || "Cuisine"} autoComplete="off"
            value={q} placeholder={placeholder}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
          {open && matches.length > 0 && (
            <ul className="combo-list" id={listId} role="listbox">
              {!q.trim() && <li className="combo-hint" aria-hidden="true">Pick a whole cuisine, or type to find a region: Molisano, Sichuan, Oaxacan, Texas BBQ…</li>}
              {matches.map((o, i) => (
                <li key={o.key} role="option" aria-selected={i === active} className={i === active ? "active" : ""}
                  onMouseDown={(e) => { e.preventDefault(); pick(o); }} onMouseEnter={() => setActive(i)}>
                  <span className={o.isFamily ? "fam" : ""}>{o.label}</span>
                  {!o.isFamily && <span className="muted small"> · {o.group}</span>}
                  {o.isFamily && <span className="muted small">{q.trim() ? " · the whole cuisine" : ""}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
