import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { usePersonal } from "../lib/personal.jsx";
import { CATEGORIES, DIETARY_NEEDS } from "../lib/categories.js";
import { DEFAULT_CITY } from "../lib/photon.js";
import { useCity } from "../lib/places.js";
import CitySearch from "../components/CitySearch.jsx";
import CuisinePicker from "../components/CuisinePicker.jsx";
import PlaceSearch from "../components/PlaceSearch.jsx";
import StarInput from "../components/StarInput.jsx";
import Icon from "../components/Icon.jsx";
import { LogoMark } from "../components/Logo.jsx";
import { useToast } from "../components/Toast.jsx";

const STEPS = ["You", "Food", "Your scene", "Favourites"];

// Chips for one tag group, e.g. restaurant ambiance
function TagChoice({ category, groupKey, likes, onToggle }) {
  const g = CATEGORIES[category].tagGroups.find((x) => x.key === groupKey);
  return (
    <div className="tagpick">
      {g.options.map(([k, label]) => {
        const full = `${g.prefix}:${k}`;
        return <button key={full} type="button" aria-pressed={likes.includes(full)} onClick={() => onToggle(category, full)}>{label}</button>;
      })}
    </div>
  );
}

export default function Welcome() {
  const { user } = useAuth();
  const me = usePersonal();
  const toast = useToast();
  const navigate = useNavigate();
  const [, setBrowsingCity] = useCity();
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [home, setHome] = useState(null);
  const [taste, setTaste] = useState(me.taste);
  const [favs, setFavs] = useState([]); // [{ id, name, category, overall }]
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Start from whatever is already saved (someone redoing the quick start keeps their answers)
  useEffect(() => {
    if (!me.loaded || ready) return;
    setName(me.displayName);
    setHandle(me.handle || "");
    setHome(me.taste.homeCity || null);
    setTaste(me.taste);
    setReady(true);
  }, [me.loaded, ready, me.displayName, me.handle, me.taste]);

  if (!ready) return <p className="muted">Loading…</p>;

  const toggleLike = (cat, full) => {
    const list = taste.likes[cat] || [];
    setTaste({ ...taste, likes: { ...taste.likes, [cat]: list.includes(full) ? list.filter((x) => x !== full) : [...list, full] } });
  };
  const toggleDiet = (k) => setTaste({ ...taste, dietary: taste.dietary.includes(k) ? taste.dietary.filter((x) => x !== k) : [...taste.dietary, k] });
  const setCuisines = (which, list) => {
    const other = which === "love" ? "avoid" : "love";
    setTaste({ ...taste, cuisines: { [which]: list, [other]: taste.cuisines[other].filter((k) => !list.includes(k)) } });
  };

  async function saveProfile(extra = {}) {
    const nextTaste = { ...taste, homeCity: home || taste.homeCity || null, ...extra };
    const h = handle.trim().replace(/^@/, "").toLowerCase();
    if (h && !/^[a-z0-9_]{3,20}$/.test(h)) throw new Error("Usernames are 3 to 20 lowercase letters, numbers or underscores.");
    const { error } = await supabase.from("profiles").update({
      display_name: name.trim() || null,
      home_city: home?.name || null,
      taste: nextTaste,
      ...(h ? { handle: h } : {}),
    }).eq("id", user.id);
    if (error) throw new Error(error.message.includes("duplicate") ? `@${h} is taken. Try another username.` : error.message);
    setTaste(nextTaste);
  }

  async function next() {
    setErr("");
    setBusy(true);
    try {
      await saveProfile();
      if (step === 0 && home) setBrowsingCity(home);
      setStep(step + 1);
      window.scrollTo(0, 0);
    } catch (e) { setErr("Couldn't save: " + e.message); }
    setBusy(false);
  }

  async function finish({ skipped = false } = {}) {
    setErr("");
    setBusy(true);
    try {
      const rated = favs.filter((f) => f.overall);
      if (rated.length) {
        const { error } = await supabase.from("ratings").upsert(
          rated.map((f) => ({ user_id: user.id, place_id: f.id, overall: f.overall })),
          { onConflict: "user_id,place_id", ignoreDuplicates: true }
        );
        if (error) throw new Error(error.message);
      }
      await saveProfile({ onboarded: true });
      await me.reload();
      toast(skipped ? "You can finish the quick start any time from your profile." : "You're set. Here are your picks.");
      navigate("/", { replace: true });
    } catch (e) {
      setErr("Couldn't save: " + e.message);
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-head">
        <LogoMark size={44} />
        <div className="progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <span key={s} className={i <= step ? "on" : ""}><em>{s}</em></span>)}
        </div>
      </div>

      {step === 0 && (
        <section className="panel stack step">
          <h1>Welcome to Bonvoyage</h1>
          <p className="muted">A minute of setup and your picks start matching your taste. You can change anything later.</p>
          <label className="field">What should we call you?
            <input id="wName" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown next to your photos" />
          </label>
          <label className="field">Username <span className="muted small">so friends can add you</span>
            <div className="handle-row"><span className="at">@</span>
              <input id="wHandle" maxLength={20} value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="paolo" />
            </div>
          </label>
          <div className="field">
            <span>Home city</span>
            {home
              ? <div className="picked-city"><Icon name="pin" size={16} /> <strong>{home.name}</strong> <span className="muted small">{home.region}</span> <button type="button" className="linkbtn" onClick={() => setHome(null)}>Change</button></div>
              : <CitySearch onPick={setHome} placeholder="Where do you live?" />}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="panel stack step">
          <h1>What do you love to eat?</h1>
          <p className="muted">Pick whole cuisines or get specific. Type “march” for Marchigiano, “texas” for Texas BBQ.</p>
          <div className="field"><span>I love</span>
            <CuisinePicker value={taste.cuisines.love} onChange={(l) => setCuisines("love", l)} label="Cuisines I love" chipClass="love" />
          </div>
          <div className="field"><span>I'd rather avoid <span className="muted small">optional</span></span>
            <CuisinePicker value={taste.cuisines.avoid} onChange={(l) => setCuisines("avoid", l)} label="Cuisines I avoid" chipClass="avoid" placeholder="Type a cuisine to avoid" />
          </div>
          <div className="field"><span>Dietary needs <span className="muted small">optional</span></span>
            <div className="tagpick">
              {DIETARY_NEEDS.map(([k, label]) => <button key={k} type="button" aria-pressed={taste.dietary.includes(k)} onClick={() => toggleDiet(k)}>{label}</button>)}
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="panel stack step">
          <h1>What's your scene?</h1>
          <p className="muted">Tap what you usually go for. The occasion (date night, friends) you pick each time you browse.</p>
          <div className="field"><span>Restaurants that feel</span><TagChoice category="restaurants" groupKey="ambiance" likes={taste.likes.restaurants} onToggle={toggleLike} /></div>
          <div className="field"><span>At a bar I'm after</span><TagChoice category="bars" groupKey="knownfor" likes={taste.likes.bars} onToggle={toggleLike} /></div>
          <div className="field"><span>Bars that feel</span><TagChoice category="bars" groupKey="ambiance" likes={taste.likes.bars} onToggle={toggleLike} /></div>
          <div className="field"><span>Hotels I like</span><TagChoice category="hotels" groupKey="style" likes={taste.likes.hotels} onToggle={toggleLike} /></div>
        </section>
      )}

      {step === 3 && (
        <section className="panel stack step">
          <h1>Name 3 places you love</h1>
          <p className="muted">
            Anywhere near {(home || DEFAULT_CITY).name}. A quick star rating each is the fastest way for Bonvoyage to learn your taste
            and find travelers like you.
          </p>
          {favs.length < 5 && (
            <PlaceSearch city={home || DEFAULT_CITY} actionLabel="Pick" title="Search a restaurant, bar or hotel you love"
              onAdded={(pl) => setFavs((f) => (f.some((x) => x.id === pl.id) ? f : [...f, { ...pl, overall: 5 }]))} />
          )}
          {favs.length > 0 && (
            <ul className="fav-list">
              {favs.map((f) => (
                <li key={f.id}>
                  <span className={`cat-dot cat-${f.category}`}><Icon name={f.category} size={16} /></span>
                  <strong>{f.name}</strong>
                  <StarInput value={f.overall} label={`Your rating for ${f.name}`} onChange={(v) => setFavs(favs.map((x) => (x.id === f.id ? { ...x, overall: v } : x)))} />
                  <button type="button" className="linkbtn" onClick={() => setFavs(favs.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.name}`}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">{favs.length >= 3 ? "Nice. Add more or finish." : `${3 - favs.length} to go. You can also skip this.`}</p>
        </section>
      )}

      {err && <p className="msg error" role="alert">{err}</p>}

      <div className="welcome-actions">
        {step > 0 && <button type="button" className="btn ghost" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
        <span className="spacer" />
        <button type="button" className="linkbtn" onClick={() => finish({ skipped: true })} disabled={busy}>Skip for now</button>
        {step < STEPS.length - 1
          ? <button type="button" className="btn" onClick={next} disabled={busy}>{busy ? "Saving…" : "Next"}</button>
          : <button type="button" className="btn" onClick={() => finish()} disabled={busy}>{busy ? "Saving…" : "See my picks"}</button>}
      </div>
    </div>
  );
}
