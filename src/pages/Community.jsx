import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { usePersonal } from "../lib/personal.jsx";
import { CATEGORIES, CATEGORY_KEYS, occasionGroup } from "../lib/categories.js";
import { cuisineLabel } from "../lib/cuisines.js";
import { RADIUS_KM } from "../lib/photon.js";
import { cityOrDefault, coverPhoto, fetchAreaPlaces, fetchMatches, fetchPhotos, sameTown, useCity } from "../lib/places.js";
import { SORTS, localMean, placeCuisines, scorePlace } from "../lib/ranking.js";
import { SetupNeeded } from "../App.jsx";
import CityPicker from "../components/CityPicker.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import RatingForm from "../components/RatingForm.jsx";
import Breakdown from "../components/Breakdown.jsx";
import PhotoStrip from "../components/PhotoStrip.jsx";
import Cover from "../components/Cover.jsx";
import SectionGuide from "../components/SectionGuide.jsx";
import Icon from "../components/Icon.jsx";
import { useToast } from "../components/Toast.jsx";

const REASON_CLASS = { good: "good", weak: "weak", budget: "budgetchip", info: "info", flag: "flag" };

export default function Community() {
  const { user } = useAuth();
  const me = usePersonal();
  const toast = useToast();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const [storedCity, setCity] = useCity();
  const city = cityOrDefault(storedCity);
  const cat = CATEGORIES[params.get("cat")] ? params.get("cat") : "restaurants";
  const occasion = params.get("occ") || null;
  const focusPlace = Number(params.get("place")) || null;

  const [places, setPlaces] = useState([]);
  const [mine, setMine] = useState(new Map());
  const [photos, setPhotos] = useState(new Map());
  const [matches, setMatches] = useState(new Map());
  const [friendsOn, setFriendsOn] = useState(new Map()); // place id -> friends who rated it
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState({ id: null, view: null }); // view: "rate" | "details"
  const [refreshKey, setRefreshKey] = useState(0);
  const [sort, setSort] = useState("you");

  const setParam = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v == null ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!isConfigured || !me.loaded) return;
    setStatus((s) => (s === "ready" ? "ready" : "loading"));
    setError("");
    try {
      const list = await fetchAreaPlaces(city, cat);
      const ids = list.map((p) => p.id);
      const [ph, mt, rs, fo] = await Promise.all([
        fetchPhotos(ids),
        user ? fetchMatches(ids, me.myCount) : new Map(),
        user && ids.length ? supabase.from("ratings").select("*").eq("user_id", user.id).in("place_id", ids) : { data: [] },
        user && ids.length ? supabase.rpc("get_friends_on_places", { p_place_ids: ids }) : { data: [] },
      ]);
      const byPlace = new Map();
      for (const f of Array.isArray(fo.data) ? fo.data : []) byPlace.set(f.place_id, [...(byPlace.get(f.place_id) || []), f]);
      setFriendsOn(byPlace);
      setPlaces(list);
      setPhotos(ph);
      setMatches(mt);
      setMine(new Map((rs.data || []).map((r) => [r.place_id, r])));
      setStatus("ready");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
    // The city object comes from storage; its name and position identify it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.name, city.lat, city.lon, cat, user, me.loaded, me.myCount]);

  useEffect(() => { load(); }, [load]);

  // "Add a place" links land on the search box
  useEffect(() => {
    if (hash === "#add") {
      const el = document.getElementById("placeSearch");
      el?.scrollIntoView({ block: "center" });
      el?.focus();
    }
  }, [hash]);

  // Coming from a home page tile: scroll to that place once it's loaded
  useEffect(() => {
    if (status !== "ready" || !focusPlace) return;
    document.getElementById(`place-${focusPlace}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [status, focusPlace]);

  const ranked = useMemo(() => {
    const mean = localMean(places);
    const ctx = {
      category: cat, taste: me.taste, weights: me.rankWeights[cat], budget: me.budgets[cat],
      occasion, mean, learned: me.rankLearned, myCount: me.myCount,
    };
    return places.map((p) => ({ ...p, s: scorePlace(p, { ...ctx, match: matches.get(p.id) }) })).sort(SORTS[sort]);
  }, [places, me, cat, occasion, sort, matches]);

  const knownOsm = useMemo(() => new Set(places.filter((p) => p.osm_id).map((p) => `${p.osm_type}:${p.osm_id}`)), [places]);

  if (!isConfigured) return <SetupNeeded />;

  function changeCity(c) {
    setCity(c);
    setOpen({ id: null, view: null });
    setParam({ place: null });
  }

  function added(place) {
    setOpen({ id: place.id, view: user ? "rate" : null });
    setParam({ cat: place.category, place: String(place.id) });
    if (place.category === cat) load();
  }

  function toggle(id, view) {
    setOpen((o) => (o.id === id && o.view === view ? { id: null, view: null } : { id, view }));
  }

  async function rated(text) {
    setOpen({ id: null, view: null });
    toast(text);
    setRefreshKey((k) => k + 1);
    await Promise.all([load(), me.reload()]);
  }

  const q = filter.trim().toLowerCase();
  const shown = ranked.filter((p) => !q || `${p.name} ${p.type ?? ""} ${p.neighbourhood ?? ""} ${p.address ?? ""} ${p.city ?? ""}`.toLowerCase().includes(q));
  const ratedCount = places.filter((p) => p.n > 0).length;
  const label = CATEGORIES[cat].label.toLowerCase();
  const og = occasionGroup(cat);

  return (
    <div className="stack-lg explore">
      <div>
        <div className="eyebrow">Explore · within {RADIUS_KM} km</div>
        <CityPicker city={city} onChange={changeCity} />
      </div>

      <div id="add">
        <PlaceSearch city={city} knownOsm={knownOsm} onAdded={added} />
      </div>

      <nav className="tabs cat-tabs" role="tablist" aria-label="Categories">
        {CATEGORY_KEYS.map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={k === cat}
            onClick={() => { setParam({ cat: k, occ: null, place: null }); setOpen({ id: null, view: null }); }}>
            <Icon name={k} size={18} /> {CATEGORIES[k].label}
          </button>
        ))}
      </nav>

      <div className="occasion-bar">
        <div>
          <span className="muted small">What's the occasion?</span>
          <div className="occasions" role="group" aria-label="Occasion">
            <button type="button" className="occ" aria-pressed={!occasion} onClick={() => setParam({ occ: null })}>Anything</button>
            {og.options.map(([k, lab]) => {
              const full = `${og.prefix}:${k}`;
              return <button key={full} type="button" className="occ" aria-pressed={occasion === full} onClick={() => setParam({ occ: occasion === full ? null : full })}>{lab}</button>;
            })}
          </div>
        </div>
        <label className="sort">
          <span className="muted small">Sort</span>
          <select id="sortBy" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="you">{user ? "Best for you" : "Best match"}</option>
            <option value="top">Top rated</option>
            <option value="most">Most rated</option>
            <option value="near">Nearest</option>
          </select>
        </label>
      </div>
      {!user && <p className="muted small"><Link to="/sign-in">Sign in</Link> to rate places and get an order matched to your taste.</p>}

      {status === "error" && (
        <div className="panel error">
          <strong>Couldn't load places.</strong> {error}
          <p className="muted small">If this mentions a missing function, run the latest file in <code>supabase/</code> in the Supabase SQL editor.</p>
        </div>
      )}

      {status === "loading" && <div className="list-skeleton" aria-label="Loading"><span /><span /><span /></div>}

      {status === "ready" && places.length === 0 && (
        <section className="panel empty-hero">
          <Icon name={cat} size={30} />
          <h2>No {label} near {city.name} yet</h2>
          <p className="muted">Search for one you know above and add it. Everything added within {RADIUS_KM} km of {city.name} shows up here.</p>
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
              const cuisine = cat === "restaurants" && placeCuisines(p).length ? placeCuisines(p).map(cuisineLabel).join(" / ") : p.type;
              const pics = photos.get(p.id) || [];
              return (
                <li key={p.id} id={`place-${p.id}`} className={`card${p.id === focusPlace ? " highlight" : ""}${p.s.over ? " over" : ""}`}>
                  <div className="card-top">
                    <Cover photo={coverPhoto(pics, CATEGORIES[cat].cover)} category={cat} name={p.name} className="card-cover" />
                    <div className="card-body">
                      <div className="card-main">
                        <div style={{ minWidth: 0 }}>
                          <h3>{p.name}</h3>
                          <div className="muted small">{[cuisine, town, p.neighbourhood, away].filter(Boolean).join(" · ")}</div>
                          {p.address && <div className="muted tiny">{p.address}</div>}
                        </div>
                        <div className="score">
                          {user ? (
                            <>
                              <span className="score-pill personal">{(p.s.final * 2).toFixed(1)}</span>
                              <span className="lbl">for you</span>
                              <span className="tiny muted">{p.n > 0 ? `Community ${(p.avg_overall * 2).toFixed(1)} · ${p.n}` : "No ratings yet"}</span>
                            </>
                          ) : p.n > 0 ? (
                            <>
                              <span className="score-pill">{(p.avg_overall * 2).toFixed(1)}</span>
                              <span className="tiny muted">{p.n} rating{p.n > 1 ? "s" : ""}</span>
                            </>
                          ) : (
                            <span className="chip flag">Not yet rated</span>
                          )}
                        </div>
                      </div>
                      {(friendsOn.get(p.id) || []).length > 0 && (
                        <div className="chips">
                          {[...friendsOn.get(p.id)].sort((a, b) => b.overall - a.overall).slice(0, 3).map((f) => (
                            <span key={f.friend_id} className="chip friend"><span className="avatar xs">{(f.display_name || f.handle || "?")[0].toUpperCase()}</span>{f.display_name || "@" + f.handle} {(f.overall * 2).toFixed(0)}/10</span>
                          ))}
                          {friendsOn.get(p.id).length > 3 && <span className="chip friend">+{friendsOn.get(p.id).length - 3} friends</span>}
                        </div>
                      )}
                      {user && p.s.reasons.length > 0 && (
                        <div className="chips reasons">
                          {p.s.reasons.map((r, i) => <span key={i} className={`chip ${REASON_CLASS[r.kind] || "flag"}`}>{r.text}</span>)}
                        </div>
                      )}
                    </div>
                  </div>

                  {pics.length > 0 && <PhotoStrip photos={pics} slots={CATEGORIES[cat].photos} placeName={p.name} />}

                  <div className="card-actions">
                    {my && <span className="chip mine"><Icon name="check" size={14} /> You rated {(my.overall * 2).toFixed(0)}/10</span>}
                    {user
                      ? <button className={`btn small${my ? " ghost" : ""}`} type="button" onClick={() => toggle(p.id, "rate")}>
                          {isOpen && open.view === "rate" ? "Close" : my ? "Edit my rating" : p.n ? "Rate it" : "Be the first to rate"}
                        </button>
                      : <Link className="btn ghost small" to="/sign-in">Sign in to rate</Link>}
                    {cat === "sports" && (
                      <button className="btn ghost small" type="button" onClick={() => toggle(p.id, "seats")}>
                        {isOpen && open.view === "seats" ? "Hide seat guide" : "Seat guide"}
                      </button>
                    )}
                    {p.n > 0 && (
                      <button className="linkbtn" type="button" onClick={() => toggle(p.id, "details")}>
                        {isOpen && open.view === "details" ? "Hide details" : "What people say"}
                      </button>
                    )}
                  </div>

                  {isOpen && open.view === "details" && <Breakdown place={p} category={cat} refreshKey={refreshKey} mine={my?.overall} />}
                  {isOpen && open.view === "seats" && <SectionGuide place={p} />}
                  {isOpen && open.view === "rate" && user && (
                    <RatingForm place={p} category={cat} existing={my} myPhotos={pics.filter((x) => x.user_id === user.id)}
                      onDone={rated} onCancel={() => setOpen({ id: null, view: null })} />
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
