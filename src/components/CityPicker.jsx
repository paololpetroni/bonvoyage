import { useState } from "react";
import { searchCities } from "../lib/photon.js";
import { useDebouncedSearch } from "../lib/useDebouncedSearch.js";

export default function CityPicker({ city, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { results, status, error } = useDebouncedSearch(q, (query, signal) => searchCities(query, { signal }), { minLength: 2 });

  function choose(c) {
    onChange(c);
    setOpen(false);
    setQ("");
  }

  if (!open) {
    return (
      <div className="city-line">
        <h1>{city.name}</h1>
        <span className="muted">{city.region}</span>
        <button className="linkbtn" type="button" onClick={() => setOpen(true)}>Change city</button>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <label className="field">Which city?
        <input id="citySearch" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing a city, e.g. Boston" autoComplete="off" />
      </label>
      {status === "loading" && <p className="muted small">Searching…</p>}
      {status === "error" && <p className="msg error">{error}</p>}
      {status === "done" && results.length === 0 && <p className="muted small">No cities found. Check the spelling.</p>}
      {results.length > 0 && (
        <ul className="results">
          {results.map((c, i) => (
            <li key={i}><button type="button" className="result" onClick={() => choose(c)}><strong>{c.name}</strong> <span className="muted small">{c.region}</span></button></li>
          ))}
        </ul>
      )}
      <button className="linkbtn" type="button" onClick={() => setOpen(false)} style={{ justifySelf: "start" }}>Cancel</button>
    </div>
  );
}
