import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { CATEGORIES, allTags } from "../lib/categories.js";
import { cuisineFromOsm, cuisineInfo } from "../lib/cuisines.js";
import CuisinePicker from "./CuisinePicker.jsx";
import { deletePhoto, photoUrl, uploadPhoto } from "../lib/photos.js";

const stars = (v) => "★".repeat(Math.floor(v)) + (v % 1 ? "½" : "") + "☆".repeat(5 - Math.ceil(v));

// Rate a place: overall stars, what it was like (tags), optional detail scores, what you spent.
export default function RatingForm({ place, category, existing, myPhotos = [], onDone, onCancel }) {
  const { user } = useAuth();
  const cat = CATEGORIES[category];
  const [overall, setOverall] = useState(existing?.overall ? Number(existing.overall) : 4);
  const known = new Set(allTags(category).map(([k]) => k));
  const [tags, setTags] = useState(new Set((existing?.tags || []).filter((t) => known.has(t))));
  // Cuisine: from your earlier rating, else OpenStreetMap's guess for this place
  const [cuisines, setCuisines] = useState(() => {
    const mineC = (existing?.tags || []).filter((t) => t.startsWith("c:")).map((t) => t.slice(2)).filter((k) => cuisineInfo(k));
    if (mineC.length) return mineC;
    const guess = category === "restaurants" ? place.cuisine || cuisineFromOsm(place.type) : null;
    return guess ? [guess] : [];
  });
  const [criteria, setCriteria] = useState(() => {
    const c = {};
    for (const [k] of cat.criteria) c[k] = existing?.criteria && k in existing.criteria ? existing.criteria[k] : undefined;
    return c;
  });
  const [spend, setSpend] = useState(existing?.spend != null ? String(Number(existing.spend)) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState({}); // slot -> { file, preview }: new photos waiting to upload
  const [kept, setKept] = useState(() => Object.fromEntries(myPhotos.map((ph) => [ph.slot, ph]))); // slot -> your saved photo
  const [progress, setProgress] = useState("");

  // Free the photo previews when the form closes
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => () => Object.values(pendingRef.current).forEach((p) => URL.revokeObjectURL(p.preview)), []);

  function pickPhoto(slot, e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErr(`${file.name} isn't a photo.`);
    setErr("");
    if (pending[slot]) URL.revokeObjectURL(pending[slot].preview);
    setPending({ ...pending, [slot]: { file, preview: URL.createObjectURL(file) } });
  }

  function unpick(slot) {
    URL.revokeObjectURL(pending[slot].preview);
    const next = { ...pending };
    delete next[slot];
    setPending(next);
  }

  async function removeKept(slot) {
    setErr("");
    try {
      await deletePhoto(kept[slot]);
      const next = { ...kept };
      delete next[slot];
      setKept(next);
    } catch (e) {
      setErr("Couldn't remove that photo: " + e.message);
    }
  }

  function toggleTag(t) {
    const next = new Set(tags);
    next.has(t) ? next.delete(t) : next.add(t);
    setTags(next);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const crit = {};
    for (const [k, v] of Object.entries(criteria)) if (v !== undefined) crit[k] = v; // undefined = skipped, null = doesn't have one
    const { error } = await supabase.from("ratings").upsert(
      { user_id: user.id, place_id: place.id, overall, tags: [...cuisines.map((c) => `c:${c}`), ...tags], criteria: crit, spend: spend === "" ? null : Number(spend) },
      { onConflict: "user_id,place_id" }
    );
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    const failed = [];
    const slots = Object.keys(pending);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      setProgress(`Uploading photo ${i + 1} of ${slots.length}…`);
      try {
        if (kept[slot]) await deletePhoto(kept[slot]); // replacing your earlier photo in this slot
        await uploadPhoto({ placeId: place.id, userId: user.id, slot, file: pending[slot].file });
      } catch (e) {
        failed.push(e.message);
      }
    }
    setProgress("");
    setBusy(false);
    if (failed.length) {
      setPending({});
      return setErr(`Your rating is saved, but ${failed.length} photo${failed.length > 1 ? "s" : ""} didn't upload: ${failed[0]}`);
    }
    const added = slots.length ? ` with ${slots.length} photo${slots.length > 1 ? "s" : ""}` : "";
    onDone(existing ? `Your rating is updated${added}.` : `Thanks, your rating for ${place.name} is saved${added}.`);
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("ratings").delete().eq("user_id", user.id).eq("place_id", place.id);
    setBusy(false);
    if (error) return setErr(error.message);
    onDone("Your rating is removed.");
  }

  const detailCount = Object.values(criteria).filter((v) => v !== undefined).length;

  return (
    <form className="rateform" onSubmit={save}>
      <div className="field">
        <div className="field-top"><label htmlFor={`overall-${place.id}`}>Overall</label><span className="stars">{stars(overall)} {overall.toFixed(1)}</span></div>
        <input id={`overall-${place.id}`} type="range" min="1" max="5" step="0.5" value={overall} onChange={(e) => setOverall(Number(e.target.value))} />
      </div>

      {category === "restaurants" && (
        <div className="field">
          <span>Cuisine <span className="muted small">up to 2, regional if you know it</span></span>
          <CuisinePicker value={cuisines} onChange={setCuisines} max={2} label="Cuisine" />
        </div>
      )}

      {cat.tagGroups.map((g) => (
        <div key={g.key} className="field">
          <span>{g.label} <span className="muted small">tap all that apply</span></span>
          <div className="tagpick">
            {g.options.map(([k, label]) => {
              const full = `${g.prefix}:${k}`;
              return <button key={full} type="button" aria-pressed={tags.has(full)} onClick={() => toggleTag(full)}>{label}</button>;
            })}
          </div>
        </div>
      ))}

      <details>
        <summary>Voyage-Meter <span className="muted small">{detailCount ? `${detailCount} of ${cat.criteria.length} rated` : "optional detail scores"}</span></summary>
        <div className="crit-grid">
          {cat.criteria.map(([k, label, , hint, amenity]) => {
            const v = criteria[k];
            return (
              <div key={k} className="field">
                <div className="field-top">
                  <label htmlFor={`c-${place.id}-${k}`}>{label}</label>
                  <span className="stars">{v === null ? "none" : v === undefined ? "skip" : v.toFixed(1)}</span>
                </div>
                <input id={`c-${place.id}-${k}`} type="range" min="0" max="5" step="0.5" value={v ?? 0} disabled={v === null}
                  onChange={(e) => setCriteria({ ...criteria, [k]: Number(e.target.value) >= 1 ? Number(e.target.value) : undefined })} aria-describedby={`h-${place.id}-${k}`} />
                <span className="muted tiny" id={`h-${place.id}-${k}`}>{hint}</span>
                {amenity && (
                  <label className="na">
                    <input type="checkbox" checked={v === null} onChange={(e) => setCriteria({ ...criteria, [k]: e.target.checked ? null : undefined })} /> Doesn't have one
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </details>

      <div className="field">
        <span>Photos <span className="muted small">optional, one per slot. Visible to everyone. Location data is removed.</span></span>
        <div className="slot-grid">
          {cat.photos.map(([slot, label]) => {
            const fresh = pending[slot];
            const saved = kept[slot];
            const src = fresh ? fresh.preview : saved ? photoUrl(saved.path) : null;
            return (
              <div key={slot} className={`slot${fresh ? " new" : ""}${src ? " filled" : ""}`}>
                {src ? <img src={src} alt={`${label} photo`} /> : <span className="slot-plus" aria-hidden="true">+</span>}
                <span className="slot-label">{label}</span>
                <label className="slot-pick">
                  <span className="visually-hidden">{src ? `Replace ${label} photo` : `Add ${label} photo`}</span>
                  <input id={`photo-${place.id}-${slot}`} type="file" accept="image/jpeg,image/png,image/webp,image/*" onChange={(e) => pickPhoto(slot, e)} disabled={busy} />
                </label>
                {fresh && <button type="button" className="slot-x" onClick={() => unpick(slot)} aria-label={`Don't add this ${label} photo`} disabled={busy}>×</button>}
                {!fresh && saved && <button type="button" className="slot-x" onClick={() => removeKept(slot)} aria-label={`Remove your ${label} photo`} disabled={busy}>×</button>}
              </div>
            );
          })}
        </div>
      </div>

      <label className="field spend">What you spent ({cat.unit}, optional)
        <input id={`spend-${place.id}`} type="number" min="0" step="1" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="$" />
      </label>

      {err && <p className="msg error" role="alert">{err}</p>}

      <div className="row-gap">
        <button className="btn" type="submit" disabled={busy}>{busy ? progress || "Saving…" : existing ? "Update rating" : "Save rating"}</button>
        <button className="linkbtn" type="button" onClick={onCancel}>Cancel</button>
        {existing && !confirmDelete && <button className="linkbtn danger-link" type="button" onClick={() => setConfirmDelete(true)}>Remove my rating</button>}
        {existing && confirmDelete && (
          <span className="row-gap small">Remove it for good?
            <button className="linkbtn danger-link" type="button" disabled={busy} onClick={remove}>Yes, remove</button>
            <button className="linkbtn" type="button" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </span>
        )}
      </div>
    </form>
  );
}
