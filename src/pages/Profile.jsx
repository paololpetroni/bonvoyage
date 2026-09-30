import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { deleteAllMyPhotos } from "../lib/photos.js";
import TasteProfile from "../components/TasteProfile.jsx";
import { usePersonal } from "../lib/personal.jsx";
import Icon from "../components/Icon.jsx";
import { useToast } from "../components/Toast.jsx";

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [twins, setTwins] = useState(null);
  const me = usePersonal();
  const toast = useToast();
  const { hash } = useLocation();

  useEffect(() => {
    supabase.rpc("count_taste_matches").then(({ data }) => setTwins(typeof data === "number" ? data : null));
  }, [me.myCount]);

  async function changePassword(e) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return toast("Couldn't change your password: " + error.message, "error");
    setNewPassword("");
    toast("Your password is updated.");
  }

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", user.id).single().then(({ data, error }) => {
      if (error) return setMsg("Couldn't load your profile: " + error.message);
      setProfile(data);
      setName(data.display_name ?? "");
      setCity(data.home_city ?? "");
    });
  }, [user.id]);

  async function save(e) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() || null, home_city: city.trim() || null }).eq("id", user.id);
    if (error) return toast("Couldn't save: " + error.message, "error");
    toast("Profile saved.");
    me.reload();
  }

  async function exportData() {
    const [p, r, pl, ph, sr, fr] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("ratings").select("*").eq("user_id", user.id),
      supabase.from("places").select("*").eq("created_by", user.id),
      supabase.from("place_photos").select("*").eq("user_id", user.id),
      supabase.from("seat_reports").select("*").eq("user_id", user.id),
      supabase.rpc("get_my_friends"),
    ]);
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), email: user.email, profile: p.data, ratings: r.data, places_added: pl.data, photos: ph.data, seat_reports: sr.data, friends: fr.data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bonvoyage-my-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function deleteAccount() {
    await deleteAllMyPhotos(user.id);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) return setMsg("Couldn't delete your account: " + error.message);
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  if (!profile) return <p className="muted">{msg || "Loading your profile…"}</p>;

  const categoriesTried = new Set(me.ratings.map((r) => r.category).filter(Boolean)).size;

  return (
    <div className="stack-lg narrow profile">
      <div className="profile-head">
        <span className="avatar" aria-hidden="true">{(profile.display_name || user.email || "?").trim()[0].toUpperCase()}</span>
        <div>
          <h1>{profile.display_name || "Your profile"}</h1>
          <div className="muted small">{user.email}</div>
        </div>
      </div>

      <div className="row-gap">
        <Link className="btn ghost small" to="/list"><Icon name="spark" size={15} /> My list</Link>
        <Link className="btn ghost small" to="/friends"><Icon name="user" size={15} /> Friends</Link>
      </div>

      <div className="stats">
        <div className="stat"><b>{me.myCount}</b><span>places rated</span></div>
        <div className="stat"><b>{categoriesTried}</b><span>of 5 categories rated</span></div>
        <div className="stat"><b>{twins ?? "–"}</b><span>travelers like you</span></div>
      </div>
      {me.myCount < 3 && <p className="muted small">Rate {3 - me.myCount} more place{3 - me.myCount > 1 ? "s" : ""} to start matching with travelers who share your taste.</p>}
      {!me.onboarded && <p className="small"><Icon name="spark" size={16} /> <Link to="/welcome">Take the one-minute quick start</Link> to sharpen your picks.</p>}

      <form className="panel stack" onSubmit={save}>
        <label className="field">Display name
          <input id="displayName" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown next to your ratings" />
        </label>
        <label className="field">Home city
          <input id="homeCity" maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <button className="btn" type="submit">Save</button>
      </form>

      <TasteProfile userId={user.id} />

      <section className="panel stack">
        <h2>Your data</h2>
        <p className="muted small">Download everything we store about you, or delete your account and all your ratings.</p>
        <div className="row-gap">
          <button className="btn ghost" type="button" onClick={exportData}>Download my data</button>
          <button className="btn ghost" type="button" onClick={signOut}>Sign out</button>
          <Link className="btn ghost" to="/welcome">Redo the quick start</Link>
        </div>
        <form id="password" className={`stack${hash === "#password" ? " highlight-block" : ""}`} onSubmit={changePassword}>
          <label className="field">New password
            <input id="newPassword" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <button className="btn ghost small" type="submit">Change password</button>
        </form>
        <label className="field">Type DELETE to permanently delete your account
          <input id="confirmDelete" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
        </label>
        <button className="btn danger" type="button" disabled={confirmDelete !== "DELETE"} onClick={deleteAccount}>Delete my account</button>
      </section>
    </div>
  );
}
