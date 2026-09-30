import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase.js";
import { CATEGORIES, CATEGORY_KEYS } from "../lib/categories.js";
import { RADIUS_KM, reverseCity } from "../lib/photon.js";
import { OCCASIONS, fetchAreaPlaces, fetchMatches, fetchPhotos, useCity } from "../lib/places.js";
import { SORTS, localMean, scorePlace } from "../lib/ranking.js";
import { usePersonal } from "../lib/personal.jsx";
import { SetupNeeded } from "../App.jsx";
import CitySearch from "../components/CitySearch.jsx";
import PlaceTile from "../components/PlaceTile.jsx";
import Icon from "../components/Icon.jsx";
import { LogoMark } from "../components/Logo.jsx";

export default function Home() {
  const me = usePersonal();
  const [city, setCity] = useCity();
  const [occ, setOcc] = useState(null);
  const [popular, setPopular] = useState([]);
  const [data, setData] = useState({ status: "idle", lists: {}, photos: new Map(), matches: new Map(), friends: [] });
  const [locating, setLocating] = useState("");

  useEffect(() => {
    if (!isConfigured) return;
    supabase.rpc("get_popular_cities", { p_limit: 8 }).then(({ data: d }) => setPopular(d || []));
  }, []);

  useEffect(() => {
    if (!isConfigured || !city || !me.loaded) return;
    let cancelled = false;
    (async () => {
      setData((d) => ({ ...d, status: "loading" }));
      try {
        const results = await Promise.all(CATEGORY_KEYS.map((c) => fetchAreaPlaces(city, c)));
        const lists = Object.fromEntries(CATEGORY_KEYS.map((c, i) => [c, results[i]]));
        const ids = results.flat().map((p) => p.id);
        const [photos, matches, fo] = await Promise.all([
          fetchPhotos(ids),
          me.signedIn ? fetchMatches(ids, me.myCount) : new Map(),
          me.signedIn && ids.length ? supabase.rpc("get_friends_on_places", { p_place_ids: ids }) : { data: [] },
        ]);
        if (!cancelled) setData({ status: "ready", lists, photos, matches, friends: Array.isArray(fo.data) ? fo.data : [] });
      } catch (e) {
        if (!cancelled) setData({ status: "error", error: e.message, lists: {}, photos: new Map(), matches: new Map(), friends: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [city, me.loaded, me.signedIn, me.myCount]);

  const occasion = OCCASIONS.find((o) => o.key === occ);

  const rows = useMemo(() => {
    if (data.status !== "ready") return [];
    return CATEGORY_KEYS
      .filter((c) => !occasion || occasion.map[c])
      .map((c) => {
        const list = data.lists[c] || [];
        const mean = localMean(list);
        const ctx = {
          category: c, taste: me.taste, weights: me.rankWeights[c], budget: me.budgets[c],
          occasion: occasion?.map[c] || null, mean, learned: me.rankLearned, myCount: me.myCount,
        };
        const ranked = list.map((p) => ({ ...p, s: scorePlace(p, { ...ctx, match: data.matches.get(p.id) }) })).sort(SORTS.you);
        return { category: c, total: list.length, places: ranked.slice(0, 10) };
      });
  }, [data, occasion, me]);

  // Places your friends scored 8/10 or more, best first
  const friendPicks = useMemo(() => {
    if (data.status !== "ready" || !data.friends.length) return [];
    const byPlace = new Map();
    for (const f of data.friends) byPlace.set(f.place_id, [...(byPlace.get(f.place_id) || []), f]);
    const all = rows.flatMap((r) => (data.lists[r.category] || []).map((p) => ({ p, category: r.category })));
    const ranked = new Map(rows.flatMap((r) => r.places.map((p) => [p.id, p])));
    return all
      .filter(({ p }) => (byPlace.get(p.id) || []).some((f) => f.overall >= 4))
      .map(({ p, category }) => {
        const fs = byPlace.get(p.id).sort((a, b) => b.overall - a.overall);
        const avg = fs.reduce((a, f) => a + Number(f.overall), 0) / fs.length;
        const base = ranked.get(p.id) || { ...p, s: { final: avg, reasons: [], over: false } };
        const who = fs.slice(0, 2).map((f) => `${f.display_name || "@" + f.handle} ${(f.overall * 2).toFixed(0)}`).join(", ");
        return { category, avg, p: { ...base, s: { ...base.s, reasons: [{ kind: "good", text: `Friends: ${who}${fs.length > 2 ? ` +${fs.length - 2}` : ""}` }, ...base.s.reasons] } } };
      })
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
  }, [data, rows]);

  if (!isConfigured) return <SetupNeeded />;

  function nearMe() {
    if (!navigator.geolocation) return setLocating("Your browser can't share your location. Search for your city instead.");
    setLocating("Finding you…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setCity(await reverseCity(pos.coords.latitude, pos.coords.longitude));
          setLocating("");
        } catch (e) { setLocating(e.message); }
      },
      () => setLocating("Location is off. Search for your city instead."),
      { timeout: 10000, maximumAge: 600000 }
    );
  }

  const home = me.taste.homeCity;
  const personal = me.signedIn;
  const anyPlaces = rows.some((r) => r.total > 0);

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Rated by real travelers</div>
          <h1>Where are you going?</h1>
          <CitySearch onPick={setCity} big placeholder="Try Montreal, Boston, Frontone…" />
          <div className="quick-cities">
            <button type="button" className="chip-btn" onClick={nearMe}><Icon name="pin" size={15} /> Near me</button>
            {home && (!city || city.name !== home.name) && (
              <button type="button" className="chip-btn" onClick={() => setCity(home)}>{home.name}</button>
            )}
            {popular.filter((p) => p.city !== city?.name && p.city !== home?.name).slice(0, 5).map((p) => (
              <button key={p.city} type="button" className="chip-btn" onClick={() => setCity({ name: p.city, region: "", lat: p.lat, lon: p.lon, extent: null })}>
                {p.city}
              </button>
            ))}
          </div>
          {locating && <p className="muted small">{locating}</p>}
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-card c1"><Icon name="restaurants" size={22} /><span>Trattoria</span><b>9.4</b></div>
          <div className="hero-card c2"><Icon name="bars" size={22} /><span>Cocktail bar</span><b>8.9</b></div>
          <div className="hero-card c3"><Icon name="hotels" size={22} /><span>Boutique hotel</span><b>9.1</b></div>
          <div className="hero-mark"><LogoMark size={72} /></div>
        </div>
      </section>

      {city && (
        <section className="picks">
          <div className="picks-head">
            <div>
              <div className="eyebrow">{personal ? "Picked for you" : "Top rated"} · within {RADIUS_KM} km</div>
              <h2 className="city-title">{city.name}{city.region && <span className="muted"> {city.region}</span>}</h2>
            </div>
            <Link className="linkbtn" to="/explore">See everything <Icon name="arrow" size={16} /></Link>
          </div>

          <div className="occasions" role="group" aria-label="Occasion">
            <button type="button" className="occ" aria-pressed={!occ} onClick={() => setOcc(null)}>Anything</button>
            {OCCASIONS.map((o) => (
              <button key={o.key} type="button" className="occ" aria-pressed={occ === o.key} onClick={() => setOcc(occ === o.key ? null : o.key)}>{o.label}</button>
            ))}
          </div>

          {!personal && (
            <p className="muted small">Showing community favourites. <Link to="/sign-in">Sign in</Link> to get picks matched to your taste.</p>
          )}
          {personal && me.loaded && !me.onboarded && (
            <p className="muted small">Your picks get sharper after the <Link to="/welcome">one-minute quick start</Link>.</p>
          )}

          {data.status === "loading" && <div className="row-skeleton" aria-label="Loading picks"><span /><span /><span /><span /></div>}
          {data.status === "error" && (
            <div className="panel error"><strong>Couldn't load picks.</strong> {data.error}
              <p className="muted small">If this mentions a missing function, run the latest file in <code>supabase/</code> in the Supabase SQL editor.</p>
            </div>
          )}

          {data.status === "ready" && !anyPlaces && (
            <div className="panel empty-hero">
              <Icon name="spark" size={28} />
              <h3>Nobody has added places near {city.name} yet</h3>
              <p className="muted">Be the first. Add a restaurant, bar or hotel you know and rate it in under a minute.</p>
              <Link className="btn" to="/explore#add"><Icon name="plus" size={16} /> Add a place</Link>
            </div>
          )}

          {friendPicks.length > 0 && (
            <section className="row-section">
              <div className="row-head">
                <h3><span className="cat-dot friends-dot"><Icon name="user" size={16} /></span>Your friends love</h3>
                <Link className="linkbtn" to="/friends">Friends <Icon name="arrow" size={15} /></Link>
              </div>
              <div className="row-scroll">
                {friendPicks.map(({ p, category }) => (
                  <PlaceTile key={`f-${p.id}`} p={p} category={category} city={city} photos={data.photos.get(p.id)} personal={personal} />
                ))}
              </div>
            </section>
          )}

          {data.status === "ready" && anyPlaces && rows.map((r) => {
            const cat = CATEGORIES[r.category];
            const occTag = occasion?.map[r.category];
            const seeAll = `/explore?cat=${r.category}${occTag ? `&occ=${encodeURIComponent(occTag)}` : ""}`;
            return (
              <section key={r.category} className="row-section">
                <div className="row-head">
                  <h3><span className={`cat-dot cat-${r.category}`}><Icon name={r.category} size={16} /></span>{cat.label}</h3>
                  {r.total > 0 && <Link className="linkbtn" to={seeAll}>See all {r.total} <Icon name="arrow" size={15} /></Link>}
                </div>
                <div className="row-scroll">
                  {r.places.map((p) => (
                    <PlaceTile key={p.id} p={p} category={r.category} city={city} photos={data.photos.get(p.id)} personal={personal} />
                  ))}
                  <Link className="tile add-tile" to={`/explore?cat=${r.category}#add`}>
                    <Icon name="plus" size={26} />
                    <span>{r.total ? `Know a great ${cat.one.toLowerCase()}?` : `Add the first ${cat.one.toLowerCase()} near ${city.name}`}</span>
                  </Link>
                </div>
              </section>
            );
          })}
        </section>
      )}

      {!me.signedIn && (
        <section className="how">
          <h2>How Bonvoyage works</h2>
          <ol className="how-steps">
            <li><span className="how-icon"><Icon name="search" size={22} /></span><strong>Find any place</strong><span className="muted">Restaurants, bars, hotels, games and sights, in any city.</span></li>
            <li><span className="how-icon"><Icon name="spark" size={22} /></span><strong>Rate what matters</strong><span className="muted">Stars, the Voyage-Meter, photos of every course and the vibe.</span></li>
            <li><span className="how-icon"><Icon name="user" size={22} /></span><strong>Get picks for you</strong><span className="muted">Ranked by your taste, the occasion and travelers like you.</span></li>
          </ol>
          <Link className="btn" to="/sign-in">Create a free account</Link>
        </section>
      )}

      <section className="teaser">
        <Icon name="compass" size={26} />
        <div>
          <strong>Trip planner, coming soon</strong>
          <p className="muted small">Tell us where, when and your budget. We'll build the days around places travelers like you loved.</p>
        </div>
      </section>
    </div>
  );
}
