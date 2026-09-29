import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { CATEGORIES, CATEGORY_KEYS, occasionGroup } from "../lib/categories.js";
import { cuisineLabel } from "../lib/cuisines.js";
import { useTasteProfile } from "../lib/taste.js";
import { SORTS, localMean, placeCuisines, scorePlace } from "../lib/ranking.js";
import { DEFAULT_CITY, RADIUS_KM, distanceKm, radiusBounds } from "../lib/photon.js";
import { SetupNeeded } from "../App.jsx";
import CityPicker from "../components/CityPicker.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import RatingForm from "../components/RatingForm.jsx";
import Breakdown from "../components/Breakdown.jsx";
import PhotoStrip from "../components/PhotoStrip.jsx";

const CITY_KEY = "bonvoyage-city";
function loadCity() {
  try { return JSON.parse(localStorage.getItem(CITY_KEY)) || DEFAULT_CITY; } catch { return DEFAULT_CITY; }
}
const sameTown = (a, b) => (a || "").localeCompare(b || "", undefined, { sensitivity: "base" }) === 0;

export default function Community() {
  const { user } = useAuth();
  const [city, setCity] = useState(loadCity);
  const [cat, setCat] = useState("restaurants");
  const [places, setPlaces] = useState([]);
  const [mine, setMine] = useState(new Map());
  const [photos, setPhotos] = useState(new Map()); // place id -> photos, newest first
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [highlight, setHighlight] = useState(null);
  const [open, setOpen] = useState({ id: null, view: null }); // view: "rate" | "details"
  const [notice, setNotice] = useState({ id: null, text: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [occasion, setOccasion] = useState(null); // e.g. "g:date"
  const [sort, setSort] = useState("you");
  const profile = useTasteProfile(user);

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setStatus((s) => (s === "ready" ? "ready" : "loading"));
    setError("");
    const b = radiusBounds(city);
    const { data, error: err } = await supabase.rpc("get_area_places", {
      p_min_lat: b.minLat, p_max_lat: b.maxLat, p_min_lon: b.minLon, p_max_lon: b.maxLon, p_category: cat,
    });
    if (err) {
      setError(err.message);
      setStatus("error");
      return;
    }
    const list = (data || [])
      .map((p) => ({ ...p, km: distanceKm(city, p) }))
      .filter((p) => p.km <= RADIUS_KM);
    setPlaces(list);

    if (list.length) {
      const { data: ph } = await supabase.from("place_photos").select("id, place_id, user_id, slot, path, width, height, created_at")
        .in("place_id", list.map((p) => p.id)).order("created_at", { ascending: false }).limit(1000);
      const byPlace = new Map();
      for (const x of ph || []) byPlace.set(x.place_id, [...(byPlace.get(x.place_id) || []), x]);
      setPhotos(byPlace);
    } else setPhotos(new Map());

    if (user && list.length) {
      const { data: rs } = await supabase.from("ratings").select("*").eq("user_id", user.id).in("place_id", list.map((p) => p.id));
      setMine(new Map((rs || []).map((r) => [r.place_id, r])));
    } else setMine(new Map());
    setStatus("ready");
  }, [city, cat, user]);

  useEffect(() => { load(); }, [load]);

  // Personal score and reasons for every place
  const ranked = useMemo(() => {
    const mean = localMean(places);
    const ctx = { category: cat, taste: profile.taste, weights: profile.weights[cat], budget: profile.budgets[cat], occasion, mean };
    return places.map((p) => ({ ...p, s: scorePlace(p, ctx) })).sort(SORTS[sort]);
  }, [places, profile, cat, occasion, sort]);

  const knownOsm = useMemo(() => new Set(places.filter((p) => p.osm_id).map((p) => `${p.osm_type}:${p.osm_id}`)), [places]);

  if (!isConfigured) return <SetupNeeded />;

  function changeCity(c) {
    setCity(c);
    setOpen({ id: null, view: null });
    try { localStorage.setItem(CITY_KEY, JSON.stringify(c)); } catch { /* private window: fine */ }
  }

  function added(place) {
    setHighlight(place.id);
    setOpen({ id: place.id, view: user ? "rate" : null });
    if (place.category !== cat) setCat(place.category);
    else load();
  }

  function toggle(id, view) {
    setNotice({ id: null, text: "" });
    setOpen((o) => (o.id === id && o.view === view ? { id: null, view: null } : { id, view }));
  }

  async function rated(id, text) {
    setOpen({ id: null, view: null });
    setNotice({ id, text });
    setRefreshKey((k) => k + 1);
    await load();
  }

  const q = filter.trim().toLowerCase();
  const shown = ranked.filter((p) => !q || `${p.name} ${p.type ?? ""} ${p.neighbourhood ?? ""} ${p.address ?? ""} ${p.city ?? ""}`.toLowerCase().includes(q));
  const ratedCount = places.filter((p) => p.n > 0).length;
  const label = CATEGORIES[cat].label.toLowerCase();

  return (
    <div className="stack-lg">
      <div>
        <div className="eyebrow">Community · within {RADIUS_KM} km</div>
        <CityPicker city={city} onChange={changeCity} />
      </div>

      <PlaceSearch city={city} knownOsm={knownOsm} onAdded={added} />

      <nav className="tabs" role="tablist" aria-label="Categories">
        {CATEGORY_KEYS.map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={k === cat} onClick={() => { setCat(k); setOccasion(null); setOpen({ id: null, view: null }); }}>
            {CATEGORIES[k].label}
          </button>
        ))}
      </nav>

      <div className="occasion-bar">
        <span className="muted small">What's the occasion?</span>
        <div className="tagpick">
          <button type="button" aria-pressed={!occasion} onClick={() => setOccasion(null)}>Anything</button>
          {occasionGroup(cat).options.map(([k, lab]) => {
            const full = `${occasionGroup(cat).prefix}:${k}`;
            return <button key={full} type="button" aria-pressed={occasion === full} onClick={() => setOccasion(occasion === full ? null : full)}>{lab}</button>;
          })}
        </div>
        <label className="sort">
          <span className="muted small">Sort</span>
          <select id="sortBy" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="you">Best for you</option>
            <option value="top">Top rated</option>
            <option value="most">Most rated</option>
            <option value="near">Nearest</option>
          </select>
        </label>
      </div>
      {!user && <p className="muted small">Sign in and set your taste on your profile to get a personal order.</p>}

      {status === "error" && (
        <div className="panel error">
          <strong>Couldn't load places.</strong> {error}
          <p className="muted small">If this mentions a missing function, run the latest file in <code>supabase/</code> in the Supabase SQL editor.</p>
        </div>
      )}

      {status === "loading" && <p className="muted">Loading {label}…</p>}

      {status === "ready" && places.length === 0 && (
        <section className="panel empty">
          <h2>No {label} near {city.name} yet</h2>
          <p>Be the first: search for a place you know above and add it. Everything added within {RADIUS_KM} km of {city.name} shows up here.</p>
        </section>
      )}

      {status === "ready" && places.length > 0 && (
        <>
          <div className="list-head">
            {places.length > 8
              ? <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter these ${label}`} aria-label="Filter places" />
              : <span />}
            <span className="muted small">{places.length} on Bonvoyage · {ratedCount} rated</span>
          </div>
          <ul className="cards">
            {shown.map((p) => {
              const my = mine.get(p.id);
              const isOpen = open.id === p.id;
              const town = p.city && !sameTown(p.city, city.name) && p.city !== "Unknown" ? p.city : null;
              const away = p.km < 1 ? null : `${Math.round(p.km)} km`;
              return (
                <li key={p.id} className={`card${p.id === highlight ? " highlight" : ""}${p.s.over ? " over" : ""}`}>
                  <div className="card-main">
                    <div style={{ minWidth: 0 }}>
                      <h3>{p.name}</h3>
                      <div className="muted small">{[cat === "restaurants" && placeCuisines(p).length ? placeCuisines(p).map(cuisineLabel).join(" / ") : p.type, town, p.neighbourhood, p.address, away].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="score">
                      {user ? (
                        <>
                          <span className="lbl">For you</span>
                          <span><span className="big">{(p.s.final * 2).toFixed(1)}</span><span className="of">/10</span></span>
                          <span className="small muted">{p.n > 0 ? `Community ${(p.avg_overall * 2).toFixed(1)} · ${p.n} rating${p.n > 1 ? "s" : ""}` : "No ratings yet"}</span>
                        </>
                      ) : p.n > 0 ? (
                        <>
                          <span><span className="big">{(p.avg_overall * 2).toFixed(1)}</span><span className="of">/10</span></span>
                          <span className="small muted">{p.n} rating{p.n > 1 ? "s" : ""}</span>
                        </>
                      ) : (
                        <span className="chip flag">Not yet rated</span>
                      )}
                    </div>
                  </div>

                  {user && p.s.reasons.length > 0 && (
                    <div className="chips reasons">
                      {p.s.reasons.map((r, i) => <span key={i} className={`chip ${r.kind === "good" ? "good" : r.kind === "weak" ? "weak" : r.kind === "budget" ? "budgetchip" : "flag"}`}>{r.text}</span>)}
                    </div>
                  )}

                  <PhotoStrip photos={photos.get(p.id) || []} slots={CATEGORIES[cat].photos} placeName={p.name} />

                  <div className="card-actions">
                    {my && <span className="chip mine">You rated {(my.overall * 2).toFixed(1)}</span>}
                    {user
                      ? <button className={`btn small${my ? " ghost" : ""}`} type="button" onClick={() => toggle(p.id, "rate")}>
                          {isOpen && open.view === "rate" ? "Close" : my ? "Edit my rating" : p.n ? "Rate it" : "Be the first to rate"}
                        </button>
                      : <Link className="btn ghost small" to="/sign-in">Sign in to rate</Link>}
                    {p.n > 0 && (
                      <button className="linkbtn" type="button" onClick={() => toggle(p.id, "details")}>
                        {isOpen && open.view === "details" ? "Hide details" : "Community details"}
                      </button>
                    )}
                    {notice.id === p.id && <span className="msg ok small" role="status">{notice.text}</span>}
                  </div>

                  {isOpen && open.view === "details" && <Breakdown place={p} category={cat} refreshKey={refreshKey} />}
                  {isOpen && open.view === "rate" && user && (
                    <RatingForm place={p} category={cat} existing={my} myPhotos={(photos.get(p.id) || []).filter((x) => x.user_id === user.id)} onDone={(text) => rated(p.id, text)} onCancel={() => setOpen({ id: null, view: null })} />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
