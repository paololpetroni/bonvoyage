import { useState } from "react";
import { Link } from "react-router-dom";
import { searchPlaces } from "../lib/photon.js";
import { useDebouncedSearch } from "../lib/useDebouncedSearch.js";
import { CATEGORIES, CATEGORY_KEYS } from "../lib/categories.js";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";

// Search-as-you-type: find any restaurant, bar, hotel, venue or sight by name or address and add it to Bonvoyage.
export default function PlaceSearch({ city, knownOsm, onAdded }) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [manual, setManual] = useState(null); // address result being turned into a place
  const { results, status, error } = useDebouncedSearch(q, (query, signal) => searchPlaces(query, { near: city, signal }));

  async function add(r, overrides = {}) {
    const key = (r.osm_type || "") + (r.osm_id || "") + (overrides.name || "");
    setBusyKey(key);
    setMsg({ kind: "", text: "" });
    const manualAdd = Boolean(overrides.name);
    const { data, error: err } = await supabase.rpc("add_place", {
      p_category: overrides.category || r.category,
      p_name: overrides.name || r.name,
      p_lat: r.lat,
      p_lon: r.lon,
      p_type: overrides.type ?? r.type,
      p_address: r.address,
      p_neighbourhood: r.neighbourhood,
      p_city: r.city,
      // A place typed in at an address isn't the OpenStreetMap object itself, so it gets no OSM id
      p_osm_type: manualAdd ? null : r.osm_type,
      p_osm_id: manualAdd ? null : r.osm_id,
    });
    setBusyKey("");
    if (err) return setMsg({ kind: "error", text: err.message });
    const name = overrides.name || r.name;
    const category = overrides.category || r.category;
    setMsg({ kind: "ok", text: `${name} is on Bonvoyage.` });
    setManual(null);
    setQ("");
    onAdded({ id: data, category, name });
  }

  return (
    <section className="panel stack search-panel">
      <label className="field">Find a place
        <input id="placeSearch" type="search" value={q} onChange={(e) => { setQ(e.target.value); setMsg({ kind: "", text: "" }); }}
          placeholder={`Restaurant, bar, hotel, stadium or sight in ${city.name}, by name or address`} autoComplete="off" />
      </label>

      {status === "loading" && <p className="muted small">Searching…</p>}
      {status === "error" && <p className="msg error">{error}</p>}
      {status === "done" && results.length === 0 && <p className="muted small">Nothing found. Try the street address instead.</p>}
      {msg.text && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}

      {results.length > 0 && q.trim().length >= 3 && (
        <ul className="results">
          {results.map((r) => {
            const key = (r.osm_type || "") + (r.osm_id || "");
            const where = [r.address, r.city].filter(Boolean).join(" · ");
            const already = r.osm_id && knownOsm.has(`${r.osm_type}:${r.osm_id}`);
            return (
              <li key={key} className="result-row">
                <div className="result-text">
                  <strong>{r.name}</strong>
                  <span className="muted small">
                    {r.kind === "place" ? `${CATEGORIES[r.category].one} · ${r.type}` : r.kind === "address" ? "Address" : r.type}
                    {where ? ` · ${where}` : ""}
                  </span>
                </div>
                {r.kind === "place" && (already
                  ? <span className="chip done">On Bonvoyage</span>
                  : user
                    ? <button className="btn small" type="button" disabled={busyKey === key} onClick={() => add(r)}>{busyKey === key ? "Adding…" : "Add"}</button>
                    : <Link className="btn ghost small" to="/sign-in">Sign in to add</Link>)}
                {r.kind === "address" && user && (
                  <button className="btn ghost small" type="button" onClick={() => setManual({ r, name: "", category: "restaurants", type: "" })}>Add a place here</button>
                )}
                {r.kind === "other" && <span className="muted small">Not a kind of place we rate</span>}
              </li>
            );
          })}
        </ul>
      )}

      {manual && (
        <form className="panel stack inset" onSubmit={(e) => { e.preventDefault(); add(manual.r, { name: manual.name.trim(), category: manual.category, type: manual.type.trim() || null }); }}>
          <strong>Add a place at {manual.r.name}</strong>
          <label className="field">Name of the place
            <input id="manualName" required maxLength={120} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
          </label>
          <div className="two-col">
            <label className="field">Category
              <select id="manualCategory" value={manual.category} onChange={(e) => setManual({ ...manual, category: e.target.value })}>
                {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k].label}</option>)}
              </select>
            </label>
            <label className="field">Type (optional)
              <input id="manualType" maxLength={40} value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })} placeholder="e.g. Thai, Brewery, Boutique hotel" />
            </label>
          </div>
          <div className="row-gap">
            <button className="btn" type="submit" disabled={!manual.name.trim()}>Add place</button>
            <button className="linkbtn" type="button" onClick={() => setManual(null)}>Cancel</button>
          </div>
        </form>
      )}

      <p className="muted tiny">Search by Photon · map data © OpenStreetMap contributors</p>
    </section>
  );
}
