import { useEffect, useState } from "react";
import { supabase, isConfigured } from "../lib/supabase.js";
import { CATEGORIES, CATEGORY_KEYS } from "../lib/categories.js";
import { SetupNeeded } from "../App.jsx";

const CITY = "Montreal";

export default function Community() {
  const [cat, setCat] = useState("restaurants");
  const [places, setPlaces] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError("");
      const [placesRes, scoresRes] = await Promise.all([
        supabase.from("places").select("id, name, type, neighbourhood, address, status, source")
          .eq("city", CITY).eq("category", cat).order("name").limit(500),
        supabase.rpc("get_place_scores", { p_city: CITY, p_category: cat }),
      ]);
      if (cancelled) return;
      if (placesRes.error || scoresRes.error) {
        setError((placesRes.error || scoresRes.error).message);
        setStatus("error");
        return;
      }
      const scores = new Map((scoresRes.data || []).map((s) => [s.place_id, s]));
      setPlaces(placesRes.data.map((p) => ({ ...p, score: scores.get(p.id) || null })));
      setStatus("ready");
    })();
    return () => { cancelled = true; };
  }, [cat]);

  if (!isConfigured) return <SetupNeeded />;

  const q = query.trim().toLowerCase();
  const shown = places.filter((p) => !q || `${p.name} ${p.type ?? ""} ${p.neighbourhood ?? ""}`.toLowerCase().includes(q));
  const rated = places.filter((p) => p.score?.n > 0).length;

  return (
    <div className="stack-lg">
      <div>
        <div className="eyebrow">Community · {CITY}</div>
        <h1>Rated by travelers</h1>
      </div>

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
          <p className="muted small">If this says a table or function doesn't exist, run <code>supabase/schema.sql</code> in the Supabase SQL editor.</p>
        </div>
      )}

      {status === "loading" && <p className="muted">Loading {CATEGORIES[cat].label.toLowerCase()}…</p>}

      {status === "ready" && places.length === 0 && (
        <section className="panel empty">
          <h2>No {CATEGORIES[cat].label.toLowerCase()} yet</h2>
          <p>
            The database is connected and ready. Every {CATEGORIES[cat].label.toLowerCase()} in {CITY} arrives in Phase 2,
            imported from OpenStreetMap. Each one will show here as “Not yet rated” until someone rates it.
          </p>
        </section>
      )}

      {status === "ready" && places.length > 0 && (
        <>
          <div className="list-head">
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, type or neighbourhood" aria-label="Search places" />
            <span className="muted small">{places.length} places · {rated} rated</span>
          </div>
          <ul className="cards">
            {shown.map((p) => (
              <li key={p.id} className="card">
                <div>
                  <h3>{p.name}</h3>
                  <div className="muted small">{[p.type, p.neighbourhood].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="score">
                  {p.score?.n ? (
                    <>
                      <span className="big">{(p.score.avg_overall * 2).toFixed(1)}</span><span className="of">/10</span>
                      <span className="small muted">{p.score.n} rating{p.score.n > 1 ? "s" : ""}</span>
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
