import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { usePersonal } from "../lib/personal.jsx";
import { CATEGORIES, CATEGORY_KEYS, DIETARY_NEEDS, tagLabel } from "../lib/categories.js";
import { cuisineLabel } from "../lib/cuisines.js";
import { BUDGET_MAX, defaultWeights } from "../lib/taste.js";
import { suggestionsFor } from "../lib/learning.js";
import CuisinePicker from "./CuisinePicker.jsx";
import Icon from "./Icon.jsx";
import { useToast } from "./Toast.jsx";

const describe = (s) => {
  if (s.kind === "love") return { title: `You seem to love ${cuisineLabel(s.key)}`, detail: `You rated ${s.n} ${cuisineLabel(s.key)} places about ${(s.gap * 2).toFixed(1)} points above your usual.`, action: "Add to cuisines I love" };
  if (s.kind === "avoid") return { title: `${cuisineLabel(s.key)} doesn't seem to be your thing`, detail: `You rated ${s.n} ${cuisineLabel(s.key)} places about ${(Math.abs(s.gap) * 2).toFixed(1)} points below your usual.`, action: "Add to cuisines I avoid" };
  return { title: `You tend to love ${tagLabel(s.category, s.key).toLowerCase()} ${CATEGORIES[s.category].label.toLowerCase()}`, detail: `${s.n} of your ratings, about ${(s.gap * 2).toFixed(1)} points above your usual.`, action: "Add to my taste" };
};

// Your taste: cuisines you love or avoid, the ambiance you usually like, dietary needs,
// what matters most in each category, your usual budget, and what your ratings suggest.
export default function TasteProfile({ userId }) {
  const me = usePersonal();
  const toast = useToast();
  const [state, setState] = useState(null);
  const [cat, setCat] = useState("restaurants");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (me.loaded && !dirty) setState({ taste: me.taste, weights: me.weights, budgets: me.budgets, learn: me.learn });
  }, [me.loaded, me.taste, me.weights, me.budgets, me.learn, dirty]);

  if (!state) return <p className="muted small">Loading your taste…</p>;

  const set = (patch) => { setState({ ...state, ...patch }); setDirty(true); };
  const c = CATEGORIES[cat];
  const likes = new Set(state.taste.likes[cat]);
  const w = state.weights[cat];
  const wTotal = c.criteria.reduce((s, [k]) => s + (w[k] || 0), 0) || 1;
  const budget = state.budgets[cat];
  const likeGroups = c.tagGroups.filter((g) => !g.occasion && g.key !== "dietary");
  const learnedW = me.learned?.byCategory[cat]?.weights;
  const lVals = learnedW ? Object.values(learnedW).filter((v) => v != null) : [];
  const lMean = lVals.length ? lVals.reduce((a, b) => a + b, 0) / lVals.length : 0;
  const suggestions = suggestionsFor(me.learned, state.taste);

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

  async function persist(next, message) {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      taste: next.taste, weights: next.weights, budgets: next.budgets, learn_from_ratings: next.learn,
    }).eq("id", userId);
    setSaving(false);
    if (error) return toast("Couldn't save: " + error.message, "error");
    setDirty(false);
    await me.reload();
    toast(message);
  }

  function accept(s) {
    const t = state.taste;
    let taste;
    if (s.kind === "love") taste = { ...t, cuisines: { love: [...t.cuisines.love, s.key], avoid: t.cuisines.avoid.filter((k) => k !== s.key) } };
    else if (s.kind === "avoid") taste = { ...t, cuisines: { avoid: [...t.cuisines.avoid, s.key], love: t.cuisines.love.filter((k) => k !== s.key) } };
    else taste = { ...t, likes: { ...t.likes, [s.category]: [...(t.likes[s.category] || []), s.key] } };
    const next = { ...state, taste };
    setState(next);
    persist(next, "Added to your taste.");
  }
  function dismiss(s) {
    const next = { ...state, taste: { ...state.taste, dismissed: [...(state.taste.dismissed || []), s.id] } };
    setState(next);
    persist(next, "Got it. We won't suggest that again.");
  }

  return (
    <section className="panel stack taste">
      <div>
        <h2>Your taste</h2>
        <p className="muted small">This shapes your picks. The occasion (date night, friends…) you choose each time you browse.</p>
      </div>

      {suggestions.length > 0 && (
        <div className="suggestions">
          <div className="sugg-head"><Icon name="spark" size={18} /> <strong>From your ratings</strong></div>
          {suggestions.map((s) => {
            const d = describe(s);
            return (
              <div key={s.id} className="sugg">
                <div><strong>{d.title}</strong><span className="muted small">{d.detail}</span></div>
                <div className="row-gap">
                  <button type="button" className="btn small" onClick={() => accept(s)} disabled={saving}>{d.action}</button>
                  <button type="button" className="linkbtn" onClick={() => dismiss(s)} disabled={saving}>Not really</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="stack">
        <h3>Cuisines</h3>
        <div className="field"><span>I love</span>
          <CuisinePicker value={state.taste.cuisines.love} onChange={(l) => setCuisines("love", l)} label="Cuisines I love" chipClass="love" />
        </div>
        <div className="field"><span>I'd rather avoid</span>
          <CuisinePicker value={state.taste.cuisines.avoid} onChange={(l) => setCuisines("avoid", l)} label="Cuisines I avoid" chipClass="avoid" placeholder="Type a cuisine to avoid" />
        </div>
        <p className="muted tiny">Loving a whole cuisine (Italian) lifts all its regions. Loving one region (Molisano) lifts it more.</p>
      </div>

      <div className="stack">
        <h3>Dietary needs</h3>
        <div className="tagpick">
          {DIETARY_NEEDS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={state.taste.dietary.includes(k)} onClick={() => toggleDiet(k)}>{label}</button>
          ))}
        </div>
        <p className="muted tiny">Places confirmed by other diners get a check. Always confirm allergies with the restaurant; ratings can't guarantee them.</p>
      </div>

      <nav className="tabs small-tabs" role="tablist" aria-label="Category">
        {CATEGORY_KEYS.map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={k === cat} onClick={() => setCat(k)}><Icon name={k} size={16} /> {CATEGORIES[k].label}</button>
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
        {learnedW && state.learn && <p className="muted small">Your Voyage-Meter scores are nudging these. Green notes show what your ratings suggest.</p>}
        <div className="crit-grid">
          {c.criteria.map(([k, label, , hint]) => {
            const lv = learnedW?.[k];
            const note = lv != null && Math.abs(lv - lMean) > 0.08 ? (lv > lMean ? "Your ratings: matters more to you" : "Your ratings: matters less to you") : null;
            return (
              <div key={k} className="field">
                <div className="field-top"><label htmlFor={`w-${cat}-${k}`}>{label}</label><span className="muted small num">{Math.round(((w[k] || 0) / wTotal) * 100)}%</span></div>
                <input id={`w-${cat}-${k}`} type="range" min="0" max="10" step="1" value={w[k] || 0}
                  onChange={(e) => set({ weights: { ...state.weights, [cat]: { ...w, [k]: Number(e.target.value) } } })} />
                <span className="muted tiny">{hint}</span>
                {note && state.learn && <span className="learned tiny">{note}</span>}
              </div>
            );
          })}
        </div>
        <button className="linkbtn" type="button" onClick={() => set({ weights: { ...state.weights, [cat]: defaultWeights(cat) } })}>Reset to defaults</button>
      </details>

      <div className="field">
        <div className="field-top"><label htmlFor={`b-${cat}`}>Usual budget</label>
          <span className="muted small">{budget == null || budget >= BUDGET_MAX[cat] ? "Any" : `Up to $${budget} ${c.unit}`}</span></div>
        <input id={`b-${cat}`} type="range" min="0" max={BUDGET_MAX[cat]} step={BUDGET_MAX[cat] > 300 ? 25 : 5} value={budget ?? BUDGET_MAX[cat]}
          onChange={(e) => { const v = Number(e.target.value); set({ budgets: { ...state.budgets, [cat]: v >= BUDGET_MAX[cat] ? null : v } }); }} />
      </div>

      <label className="toggle">
        <input type="checkbox" checked={state.learn} onChange={(e) => set({ learn: e.target.checked })} />
        <span><strong>Learn from my ratings</strong><br /><span className="muted small">Your ratings gently adjust your picks. What you set here always comes first, and dietary needs are never changed.</span></span>
      </label>

      <div className={`row-gap sticky-save${dirty ? " dirty" : ""}`}>
        <button className="btn" type="button" onClick={() => persist(state, "Saved. Your picks now use this.")} disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save my taste" : "Saved"}</button>
        {dirty && <span className="muted small">You have unsaved changes.</span>}
      </div>
    </section>
  );
}
