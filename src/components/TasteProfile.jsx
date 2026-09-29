import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { CATEGORIES, CATEGORY_KEYS, DIETARY_NEEDS } from "../lib/categories.js";
import { BUDGET_MAX, defaultWeights, normalizeTaste } from "../lib/taste.js";
import CuisinePicker from "./CuisinePicker.jsx";

// Your taste: cuisines you love or avoid, the ambiance you usually like, dietary needs,
// what matters most in each category, and your usual budget. Occasions (date night...) are chosen when browsing.
export default function TasteProfile({ userId }) {
  const [state, setState] = useState(null);
  const [cat, setCat] = useState("restaurants");
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("taste, weights, budgets, learn_from_ratings").eq("id", userId).single().then(({ data, error }) => {
      if (error) setMsg({ kind: "error", text: "Couldn't load your taste profile: " + error.message });
      else setState(normalizeTaste(data));
    });
  }, [userId]);

  if (!state) return <p className="muted small">{msg.text || "Loading your taste profile…"}</p>;

  const set = (patch) => { setState({ ...state, ...patch }); setMsg({ kind: "", text: "" }); };
  const c = CATEGORIES[cat];
  const likes = new Set(state.taste.likes[cat]);
  const w = state.weights[cat];
  const wTotal = c.criteria.reduce((s, [k]) => s + (w[k] || 0), 0) || 1;
  const budget = state.budgets[cat];
  const likeGroups = c.tagGroups.filter((g) => !g.occasion && g.key !== "dietary");

  function toggleLike(full) {
    const next = new Set(likes);
    next.has(full) ? next.delete(full) : next.add(full);
    set({ taste: { ...state.taste, likes: { ...state.taste.likes, [cat]: [...next] } } });
  }
  function toggleDiet(k) {
    const d = new Set(state.taste.dietary);
    d.has(k) ? d.delete(k) : d.add(k);
    set({ taste: { ...state.taste, dietary: [...d] } });
  }
  function setCuisines(which, list) {
    const other = which === "love" ? "avoid" : "love";
    set({ taste: { ...state.taste, cuisines: { [which]: list, [other]: state.taste.cuisines[other].filter((k) => !list.includes(k)) } } });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      taste: state.taste, weights: state.weights, budgets: state.budgets, learn_from_ratings: state.learn,
    }).eq("id", userId);
    setSaving(false);
    setMsg(error ? { kind: "error", text: "Couldn't save: " + error.message } : { kind: "ok", text: "Saved. Your recommendations now use this." });
  }

  return (
    <section className="panel stack taste">
      <div>
        <h2>Your taste</h2>
        <p className="muted small">This shapes the “Best for you” order. The occasion (date night, friends…) you pick when browsing.</p>
      </div>

      <div className="stack">
        <h3>Cuisines</h3>
        <div className="field"><span>I love</span>
          <CuisinePicker value={state.taste.cuisines.love} onChange={(l) => setCuisines("love", l)} label="Cuisines I love" chipClass="love" />
        </div>
        <div className="field"><span>I'd rather avoid</span>
          <CuisinePicker value={state.taste.cuisines.avoid} onChange={(l) => setCuisines("avoid", l)} label="Cuisines I avoid" chipClass="avoid" placeholder="Type a cuisine to avoid" />
        </div>
        <p className="muted tiny">Loving a whole cuisine (Italian) boosts all its regions. Loving one region (Molisano) boosts it more.</p>
      </div>

      <div className="stack">
        <h3>Dietary needs</h3>
        <div className="tagpick">
          {DIETARY_NEEDS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={state.taste.dietary.includes(k)} onClick={() => toggleDiet(k)}>{label}</button>
          ))}
        </div>
        <p className="muted tiny">Restaurants confirmed by other diners show a check. Always confirm allergies with the restaurant; ratings can't guarantee them.</p>
      </div>

      <nav className="tabs small-tabs" role="tablist" aria-label="Category">
        {CATEGORY_KEYS.map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={k === cat} onClick={() => setCat(k)}>{CATEGORIES[k].label}</button>
        ))}
      </nav>

      {likeGroups.map((g) => (
        <div key={g.key} className="field">
          <span>{g.key === "ambiance" ? "Ambiance I usually like" : g.key === "knownfor" ? "What I usually drink" : g.key === "style" ? "Hotel styles I like" : "What I'm into"}</span>
          <div className="tagpick">
            {g.options.map(([k, label]) => {
              const full = `${g.prefix}:${k}`;
              return <button key={full} type="button" aria-pressed={likes.has(full)} onClick={() => toggleLike(full)}>{label}</button>;
            })}
          </div>
        </div>
      ))}

      <details className="fold">
        <summary>What matters most for {c.label.toLowerCase()}</summary>
        <div className="crit-grid">
          {c.criteria.map(([k, label, , hint]) => (
            <div key={k} className="field">
              <div className="field-top"><label htmlFor={`w-${cat}-${k}`}>{label}</label><span className="muted small num">{Math.round(((w[k] || 0) / wTotal) * 100)}%</span></div>
              <input id={`w-${cat}-${k}`} type="range" min="0" max="10" step="1" value={w[k] || 0}
                onChange={(e) => set({ weights: { ...state.weights, [cat]: { ...w, [k]: Number(e.target.value) } } })} />
              <span className="muted tiny">{hint}</span>
            </div>
          ))}
        </div>
        <button className="linkbtn" type="button" onClick={() => set({ weights: { ...state.weights, [cat]: defaultWeights(cat) } })}>Reset to defaults</button>
      </details>

      <div className="field">
        <div className="field-top"><label htmlFor={`b-${cat}`}>Usual budget</label>
          <span className="muted small">{budget == null || budget >= BUDGET_MAX[cat] ? "Any" : `Up to $${budget} ${c.unit}`}</span></div>
        <input id={`b-${cat}`} type="range" min="0" max={BUDGET_MAX[cat]} step={BUDGET_MAX[cat] > 300 ? 25 : 5} value={budget ?? BUDGET_MAX[cat]}
          onChange={(e) => { const v = Number(e.target.value); set({ budgets: { ...state.budgets, [cat]: v >= BUDGET_MAX[cat] ? null : v } }); }} />
      </div>

      <div className="row-gap">
        <button className="btn" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save my taste"}</button>
        {msg.text && <span className={`msg ${msg.kind}`} role="status">{msg.text}</span>}
      </div>
    </section>
  );
}
