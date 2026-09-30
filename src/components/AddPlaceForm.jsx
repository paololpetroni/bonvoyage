import { useState } from "react";
import { RADIUS_KM, reverseAddress, searchPlaces } from "../lib/photon.js";
import { useDebouncedSearch } from "../lib/useDebouncedSearch.js";
import { CATEGORIES, CATEGORY_KEYS } from "../lib/categories.js";
import { cuisineLabel } from "../lib/cuisines.js";
import CuisinePicker from "./CuisinePicker.jsx";
import Icon from "./Icon.jsx";

// Add a place the map doesn't know yet: its name, what kind of place it is, and where it is
// (a street address, a cross street, or "I'm there now").
export default function AddPlaceForm({ city, initialName = "", initialWhere = null, onSubmit, onCancel, busy }) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState("restaurants");
  const [cuisine, setCuisine] = useState([]);
  const [type, setType] = useState("");
  const [where, setWhere] = useState(initialWhere);
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState("");
  const { results, status } = useDebouncedSearch(q, (query, signal) => searchPlaces(query, { near: city, signal }));

  function hereNow() {
    if (!navigator.geolocation) return setLocating("Your browser can't share your location. Type the address instead.");
    setLocating("Finding you…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          setWhere(await reverseAddress(pos.coords.latitude, pos.coords.longitude));
          setLocating("");
        } catch (e) { setLocating(e.message); }
      },
      () => setLocating("Location is off. Type the address instead."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function submit(e) {
    e.preventDefault();
    const finalType = category === "restaurants" && cuisine[0] ? cuisineLabel(cuisine[0]) : type.trim() || null;
    onSubmit({
      name: name.trim(), category, type: finalType,
      lat: where.lat, lon: where.lon, address: where.address, neighbourhood: where.neighbourhood, city: where.city,
    });
  }

  return (
    <form className="panel stack inset add-form" onSubmit={submit}>
      <div className="add-form-head">
        <strong>Add a place that isn't on the map yet</strong>
        <button type="button" className="linkbtn" onClick={onCancel}>Cancel</button>
      </div>

      <label className="field">Name
        <input id="newPlaceName" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dic Ann's" />
      </label>

      <div className="field">
        <span>What kind of place?</span>
        <div className="tagpick">
          {CATEGORY_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={category === k} onClick={() => setCategory(k)}><Icon name={k} size={16} /> {CATEGORIES[k].one}</button>
          ))}
        </div>
      </div>

      {category === "restaurants" ? (
        <div className="field"><span>Cuisine <span className="muted small">optional</span></span>
          <CuisinePicker value={cuisine} onChange={setCuisine} max={1} label="Cuisine" placeholder="e.g. Burgers, Marchigiano, Pho" />
        </div>
      ) : (
        <label className="field">Type <span className="muted small">optional</span>
          <input id="newPlaceType" maxLength={40} value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Cocktail bar, Boutique hotel, Museum" />
        </label>
      )}

      <div className="field">
        <span>Where is it?</span>
        {where ? (
          <div className="picked-city">
            <Icon name="pin" size={16} />
            <span><strong>{where.label}</strong>{where.city && <span className="muted small"> · {where.city}</span>}</span>
            <button type="button" className="linkbtn" onClick={() => { setWhere(null); setQ(""); }}>Change</button>
          </div>
        ) : (
          <>
            <input id="newPlaceWhere" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
              placeholder={`Street address or cross streets near ${city.name}, e.g. 5465 Pie-IX`} />
            {status === "loading" && <span className="muted small">Searching…</span>}
            {status === "done" && results.length === 0 && <span className="muted small">No match within {RADIUS_KM} km. Try just the street name.</span>}
            {results.length > 0 && q.trim().length >= 3 && (
              <ul className="results">
                {results.filter((r) => r.lat != null).slice(0, 6).map((r) => (
                  <li key={`${r.osm_type}${r.osm_id}`}>
                    <button type="button" className="result" onClick={() => setWhere({
                      lat: r.lat, lon: r.lon, address: r.address || r.name, neighbourhood: r.neighbourhood, city: r.city,
                      label: r.address || r.name,
                    })}>
                      <strong>{r.name}</strong> <span className="muted small">{[r.kind === "place" ? r.address : null, r.city].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="linkbtn" onClick={hereNow}><Icon name="pin" size={15} /> I'm there now, use my location</button>
            {locating && <span className="muted small">{locating}</span>}
          </>
        )}
      </div>

      <div className="row-gap">
        <button className="btn" type="submit" disabled={busy || !name.trim() || !where}>{busy ? "Adding…" : "Add place"}</button>
        {!where && <span className="muted small">Pick where it is to continue.</span>}
      </div>
    </form>
  );
}
