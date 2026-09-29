import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { CATEGORIES } from "../lib/categories.js";

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

  const tagList = cat.tags.map(([k, label]) => [label, data.tags[k] || 0]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="breakdown">
      {tagList.length > 0 && (
        <div className="chips">
          {tagList.map(([label, c]) => <span key={label} className="chip tag">{label} <span className="muted">{Math.round((c / data.n) * 100)}%</span></span>)}
        </div>
      )}
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
