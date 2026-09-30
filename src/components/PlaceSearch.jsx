import { useState } from "react";
import { Link } from "react-router-dom";
import { searchPlaces, RADIUS_KM } from "../lib/photon.js";
import { useDebouncedSearch } from "../lib/useDebouncedSearch.js";
import { CATEGORIES } from "../lib/categories.js";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import AddPlaceForm from "./AddPlaceForm.jsx";
import Icon from "./Icon.jsx";

// Search-as-you-type: find any restaurant, bar, hotel, venue or sight by name or address and add it to Bonvoyage.
// If the map doesn't know it, add it yourself.
export default function PlaceSearch({ city, knownOsm = new Set(), onAdded, actionLabel = "Add", title = "Find a place" }) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [adding, setAdding] = useState(null); // { name, where } when the add-it-yourself form is open
  const { results, status, error } = useDebouncedSearch(q, (query, signal) => searchPlaces(query, { near: city, signal }));

  async function save(p, key) {
    setBusyKey(key);
    setMsg({ kind: "", text: "" });
    const { data, error: err } = await supabase.rpc("add_place", {
      p_category: p.category, p_name: p.name, p_lat: p.lat, p_lon: p.lon, p_type: p.type || null,
      p_address: p.address || null, p_neighbourhood: p.neighbourhood || null, p_city: p.city || null,
      p_osm_type: p.osm_type || null, p_osm_id: p.osm_id || null,
    });
    setBusyKey("");
    if (err) return setMsg({ kind: "error", text: err.message });
    setMsg({ kind: "ok", text: `${p.name} is on Bonvoyage.` });
    setAdding(null);
    setQ("");
    onAdded({ id: data, category: p.category, name: p.name });
  }

  const typed = q.trim();
  const searched = typed.length >= 3 && (status === "done" || status === "error");
  const places = results.filter((r) => r.kind === "place");

  return (
    <section className="panel stack search-panel">
      <label className="field search-label">{title}
        <input id="placeSearch" type="search" value={q} onChange={(e) => { setQ(e.target.value); setMsg({ kind: "", text: "" }); }}
          placeholder={`Restaurant, bar, hotel, stadium or sight within ${RADIUS_KM} km of ${city.name}, by name or address`} autoComplete="off" />
      </label>

      {status === "loading" && <p className="muted small">Searching…</p>}
      {status === "error" && <p className="msg error">{error}</p>}
      {msg.text && <p className={`msg ${msg.kind}`} role="status">{msg.text}</p>}

      {results.length > 0 && typed.length >= 3 && !adding && (
        <ul className="results">
          {results.map((r) => {
            const key = (r.osm_type || "") + (r.osm_id || "");
            const away = r.km == null ? null : r.km < 1 ? "under 1 km" : `${Math.round(r.km)} km`;
            const where = [r.address, r.city, away].filter(Boolean).join(" · ");
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
                    ? <button className="btn small" type="button" disabled={busyKey === key} onClick={() => save(r, key)}>{busyKey === key ? "Adding…" : actionLabel}</button>
                    : <Link className="btn ghost small" to="/sign-in">Sign in to add</Link>)}
                {r.kind === "address" && user && (
                  <button className="btn ghost small" type="button"
                    onClick={() => setAdding({ name: "", where: { lat: r.lat, lon: r.lon, address: r.address || r.name, neighbourhood: r.neighbourhood, city: r.city, label: r.name } })}>
                    Add a place here
                  </button>
                )}
                {r.kind === "other" && <span className="muted small">Not a kind of place we rate</span>}
              </li>
            );
          })}
        </ul>
      )}

      {searched && !adding && (
        <div className="not-found">
          <span>
            {places.length === 0
              ? <>Nothing called “{typed}” within {RADIUS_KM} km of {city.name}. It may not be on the map yet.</>
              : <>Not the one you meant?</>}
          </span>
          {user
            ? <button type="button" className="btn ghost small" onClick={() => setAdding({ name: typed, where: null })}><Icon name="plus" size={15} /> Add “{typed.length > 28 ? typed.slice(0, 28) + "…" : typed}” yourself</button>
            : <Link className="btn ghost small" to="/sign-in">Sign in to add it</Link>}
        </div>
      )}

      {adding && (
        <AddPlaceForm city={city} initialName={adding.name} initialWhere={adding.where} busy={busyKey === "manual"}
          onCancel={() => setAdding(null)} onSubmit={(p) => save(p, "manual")} />
      )}

      <p className="muted tiny">Search by Photon · map data © OpenStreetMap contributors</p>
    </section>
  );
}
