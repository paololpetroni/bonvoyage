import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { usePersonal } from "../lib/personal.jsx";
import { CATEGORIES, CATEGORY_KEYS } from "../lib/categories.js";
import { cuisineInfo, cuisineLabel } from "../lib/cuisines.js";
import { useCity } from "../lib/places.js";
import { ScoreBars, ScoreHistogram } from "../components/Charts.jsx";
import Icon from "../components/Icon.jsx";

const cuisineOf = (tags) => {
  const c = (tags || []).find((t) => t.startsWith("c:") && cuisineInfo(t.slice(2)));
  return c ? cuisineLabel(c.slice(2)) : null;
};

// A ranked list of everything someone has rated (Beli-style): yours at /list, a friend's at /friends/:id.
export default function MyList() {
  const { id: friendId } = useParams();
  const me = usePersonal();
  const navigate = useNavigate();
  const [, setCity] = useCity();
  const [cat, setCat] = useState("all");
  const [friend, setFriend] = useState(null); // { name, handle, rows }
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!friendId) return;
    (async () => {
      const [f, r] = await Promise.all([supabase.rpc("get_my_friends"), supabase.rpc("get_friend_ratings", { p_friend: friendId })]);
      const who = (f.data || []).find((x) => x.friend_id === friendId && x.status === "accepted");
      if (!who) return setErr("You can only see lists of people you're friends with.");
      setFriend({ name: who.display_name || `@${who.handle}`, handle: who.handle, rows: r.data || [] });
    })();
  }, [friendId]);

  const rows = useMemo(() => {
    if (friendId) return (friend?.rows || []).map((r) => ({ ...r, place_id: r.place_id }));
    return me.ratings.map((r) => ({ place_id: r.place_id, overall: r.overall, tags: r.tags, updated_at: r.updated_at, category: r.category, ...(r.places || {}) }));
  }, [friendId, friend, me.ratings]);

  const myScores = useMemo(() => new Map(me.ratings.map((r) => [r.place_id, Number(r.overall) * 2])), [me.ratings]);

  if (friendId && err) return <section className="panel narrow"><p>{err}</p><Link to="/friends">Back to friends</Link></section>;
  if (friendId && !friend) return <p className="muted">Loading their list…</p>;
  if (!friendId && !me.loaded) return <p className="muted">Loading your list…</p>;

  const counts = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, rows.filter((r) => r.category === k).length]));
  const shown = rows.filter((r) => cat === "all" || r.category === cat).sort((a, b) => b.overall - a.overall || new Date(b.updated_at) - new Date(a.updated_at));
  const dist = {};
  for (const r of shown) { const k = Math.round(Number(r.overall) * 2); dist[k] = (dist[k] || 0) + 1; }
  const avg = shown.length ? (shown.reduce((a, r) => a + Number(r.overall), 0) / shown.length) * 2 : null;
  const inCommon = friendId ? rows.filter((r) => myScores.has(r.place_id)).length : 0;

  const open = (r) => {
    if (r.lat != null) setCity({ name: r.city && r.city !== "Unknown" ? r.city : r.name, region: "", lat: r.lat, lon: r.lon, extent: null });
    navigate(`/explore?cat=${r.category}&place=${r.place_id}`);
  };

  const title = friendId ? `${friend.name}'s list` : "My list";

  return (
    <div className="stack-lg list-page">
      <div className="list-hero">
        <span className="avatar" aria-hidden="true">{(friendId ? friend.name : me.displayName || "Me").trim()[0].toUpperCase()}</span>
        <div>
          <div className="eyebrow">{friendId ? `@${friend.handle}` : "Everything you've rated"}</div>
          <h1>{title}</h1>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{rows.length}</b><span>places rated</span></div>
        <div className="stat"><b>{avg != null ? avg.toFixed(1) : "–"}</b><span>average score{cat !== "all" ? " here" : ""}</span></div>
        <div className="stat"><b>{friendId ? inCommon : new Set(rows.map((r) => r.city).filter(Boolean)).size}</b><span>{friendId ? "places you both rated" : "cities"}</span></div>
      </div>

      <nav className="tabs small-tabs" role="tablist" aria-label="Category">
        <button type="button" role="tab" className="tab" aria-selected={cat === "all"} onClick={() => setCat("all")}>All {rows.length}</button>
        {CATEGORY_KEYS.map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={cat === k} onClick={() => setCat(k)} disabled={!counts[k]}>
            <Icon name={k} size={16} /> {CATEGORIES[k].label} {counts[k] || ""}
          </button>
        ))}
      </nav>

      {shown.length > 1 && (
        <section className="panel stack">
          <h2 className="panel-title">How {friendId ? "they" : "you"} score</h2>
          <ScoreHistogram dist={dist} label="places" />
        </section>
      )}

      <section className="panel stack">
        <h2 className="panel-title">{cat === "all" ? "Ranked" : `${CATEGORIES[cat].label}, ranked`}</h2>
        <ScoreBars
          empty={friendId ? "Nothing rated here yet." : "You haven't rated anything here yet. Find a place in Explore and tap Rate it."}
          items={shown.map((r) => {
            const mine = friendId ? myScores.get(r.place_id) : null;
            return {
              id: r.place_id,
              label: r.name,
              score: Number(r.overall) * 2,
              sub: [cat === "all" ? CATEGORIES[r.category]?.one : null, r.category === "restaurants" ? cuisineOf(r.tags) || r.type : r.type, r.city !== "Unknown" ? r.city : null, mine != null ? `You: ${mine.toFixed(0)}` : null].filter(Boolean).join(" · "),
              onClick: () => open(r),
              tip: `${r.name}: ${(Number(r.overall) * 2).toFixed(1)}/10${mine != null ? ` · you gave ${mine.toFixed(1)}` : ""}`,
            };
          })}
        />
      </section>
      {!friendId && <p className="muted small"><Link to="/friends">Add friends</Link> to see their lists and compare scores.</p>}
    </div>
  );
}
