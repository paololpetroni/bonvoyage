import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { CATEGORIES } from "../lib/categories.js";
import { cuisineLabel } from "../lib/cuisines.js";

// What everyone who rated this place said, as averages and tag counts
export default function Breakdown({ place, category, refreshKey }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const cat = CATEGORIES[category];

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_place_breakdown", { p_place_id: place.id }).then(({ data: d, error }) => {
      if (cancelled) return;
      if (error) setErr(error.message);
      else setData(d);
    });
    return () => { cancelled = true; };
  }, [place.id, refreshKey]);

  if (err) return <p className="msg error">{err}</p>;
  if (!data) return <p className="muted small">Loading…</p>;
  if (!data.n) return <p className="muted small">No ratings yet.</p>;

  const pct = (c) => `${Math.round((c / data.n) * 100)}%`;
  const cuisineList = Object.entries(data.tags).filter(([k]) => k.startsWith("c:")).sort((a, b) => b[1] - a[1]);
  const groups = cat.tagGroups
    .map((g) => ({ g, list: g.options.map(([k, label]) => [label, data.tags[`${g.prefix}:${k}`] || 0]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]) }))
    .filter((x) => x.list.length);

  return (
    <div className="breakdown">
      {cuisineList.length > 0 && (
        <div className="tag-row"><span className="muted small">Cuisine</span>
          <div className="chips">{cuisineList.map(([k, c]) => <span key={k} className="chip tag">{cuisineLabel(k.slice(2))} <span className="muted">{pct(c)}</span></span>)}</div>
        </div>
      )}
      {groups.map(({ g, list }) => (
        <div key={g.key} className="tag-row"><span className="muted small">{g.label}</span>
          <div className="chips">{list.map(([label, c]) => <span key={label} className="chip tag">{label} <span className="muted">{pct(c)}</span></span>)}</div>
        </div>
      ))}
      <div className="bars">
        {cat.criteria.map(([k, label]) => {
          const v = data.criteria[k];
          const none = data.missing[k];
          if (v == null && !none) return null;
          return (
            <div key={k} className="bar">
              <span>{label}</span>
              <span className="track"><span className="fill" style={{ width: `${v ? (v / 5) * 100 : 0}%` }} /></span>
              <span className="v">{v != null ? (v * 2).toFixed(1) : "none"}</span>
            </div>
          );
        })}
      </div>
      {data.spend != null && <p className="muted small">People spent about ${data.spend} {cat.unit}.</p>}
    </div>
  );
}
