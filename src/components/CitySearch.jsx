import { useId, useState } from "react";
import { searchCities } from "../lib/photon.js";
import { useDebouncedSearch } from "../lib/useDebouncedSearch.js";
import Icon from "./Icon.jsx";

// Type-ahead city search. Arrow keys and Enter work; results come from OpenStreetMap via Photon.
export default function CitySearch({ onPick, placeholder = "Search a city or town", big = false, autoFocus = false }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const { results, status, error } = useDebouncedSearch(q, (query, signal) => searchCities(query, { signal }), { minLength: 2, delay: 250 });

  function pick(c) {
    onPick(c);
    setQ("");
    setOpen(false);
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div className={`city-search${big ? " big" : ""}`}>
      <div className="city-input">
        <Icon name="search" size={big ? 22 : 18} />
        <input type="text" role="combobox" aria-expanded={open && results.length > 0} aria-controls={listId} aria-label="City"
          value={q} placeholder={placeholder} autoFocus={autoFocus} autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
        {status === "loading" && <span className="spinner" aria-label="Searching" />}
      </div>
      {open && q.trim().length >= 2 && (
        <ul className="combo-list" id={listId} role="listbox">
          {status === "error" && <li className="combo-hint">{error}</li>}
          {status === "done" && results.length === 0 && <li className="combo-hint">No cities found. Check the spelling.</li>}
          {results.map((c, i) => (
            <li key={`${c.name}-${c.lat}`} role="option" aria-selected={i === active} className={i === active ? "active" : ""}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}>
              <Icon name="pin" size={16} /> <strong>{c.name}</strong> <span className="muted small">{c.region}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
