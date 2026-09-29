import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, isConfigured } from "../lib/supabase.js";
import { CATEGORIES, CATEGORY_KEYS } from "../lib/categories.js";
import { DEFAULT_CITY, cityBounds } from "../lib/photon.js";
import { SetupNeeded } from "../App.jsx";
import CityPicker from "../components/CityPicker.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";

const CITY_KEY = "bonvoyage-city";
function loadCity() {
  try { return JSON.parse(localStorage.getItem(CITY_KEY)) || DEFAULT_CITY; } catch { return DEFAULT_CITY; }
}

export default function Community() {
  const [city, setCity] = useState(loadCity);
  const [cat, setCat] = useState("restaurants");
  const [places, setPlaces] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(null);

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setStatus("loading");
    setError("");
    const b = cityBounds(city);
    const { data, error: err } = await supabase.rpc("get_places_in_area", {
      p_min_lat: b.minLat, p_max_lat: b.maxLat, p_min_lon: b.minLon, p_max_lon: b.maxLon, p_category: cat,
    });
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    setPlaces(data || []);
    setStatus("ready");
  }, [city, cat]);

  useEffect(() => { load(); }, [load]);

  const knownOsm = useMemo(() => new Set(places.filter((p) => p.osm_id).map((p) => `${p.osm_type}:${p.osm_id}`)), [places]);

  if (!isConfigured) return <SetupNeeded />;

  function changeCity(c) {
    setCity(c);
    try { localStorage.setItem(CITY_KEY, JSON.stringify(c)); } catch { /* private window: fine */ }
  }

  function added(place) {
    setHighlight(place.id);
    if (place.category !== cat) setCat(place.category);
    else load();
  }

  const q = filter.trim().toLowerCase();
  const shown = places.filter((p) => !q || `${p.name} ${p.type ?? ""} ${p.neighbourhood ?? ""} ${p.address ?? ""}`.toLowerCase().includes(q));
  const rated = places.filter((p) => p.n > 0).length;
  const label = CATEGORIES[cat].label.toLowerCase();

  return (
    <div className="stack-lg">
      <div>
        <div className="eyebrow">Community</div>
        <CityPicker city={city} onChange={changeCity} />
      </div>

      <PlaceSearch city={city} knownOsm={knownOsm} onAdded={added} />

      <nav className="tabs" role="tablist" aria-label="Categories">
        {CATEGORY_KEYS.map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={k === cat} onClick={() => setCat(k)}>
            {CATEGORIES[k].label}
          </button>
        ))}
      </nav>

      {status === "error" && (
        <div className="panel error">
          <strong>Couldn't load places.</strong> {error}
          <p className="muted small">If this mentions get_places_in_area, run <code>supabase/002_place_search.sql</code> in the Supabase SQL editor.</p>
        </div>
      )}

      {status === "loading" && <p className="muted">Loading {label}…</p>}

      {status === "ready" && places.length === 0 && (
        <section className="panel empty">
          <h2>No {label} in {city.name} yet</h2>
          <p>Be the first: search for a place you know above and add it. Everything people add in {city.name} shows up here.</p>
        </section>
      )}

      {status === "ready" && places.length > 0 && (
        <>
          <div className="list-head">
            {places.length > 8
              ? <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter these ${label}`} aria-label="Filter places" />
              : <span />}
            <span className="muted small">{places.length} on Bonvoyage · {rated} rated</span>
          </div>
          <ul className="cards">
            {shown.map((p) => (
              <li key={p.id} className={`card${p.id === highlight ? " highlight" : ""}`}>
                <div style={{ minWidth: 0 }}>
                  <h3>{p.name}</h3>
                  <div className="muted small">{[p.type, p.neighbourhood, p.address].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="score">
                  {p.n > 0 ? (
                    <>
                      <span className="big">{(p.avg_overall * 2).toFixed(1)}</span><span className="of">/10</span>
                      <span className="small muted">{p.n} rating{p.n > 1 ? "s" : ""}</span>
                    </>
                  ) : (
                    <span className="chip flag">Not yet rated</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
