import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { deleteAllMyPhotos } from "../lib/photos.js";
import TasteProfile from "../components/TasteProfile.jsx";

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

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
    setMsg(error ? "Couldn't save: " + error.message : "Saved.");
  }

  async function exportData() {
    const [p, r, pl, ph] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("ratings").select("*").eq("user_id", user.id),
      supabase.from("places").select("*").eq("created_by", user.id),
      supabase.from("place_photos").select("*").eq("user_id", user.id),
    ]);
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), email: user.email, profile: p.data, ratings: r.data, places_added: pl.data, photos: ph.data }, null, 2)], { type: "application/json" });
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

  return (
    <div className="stack-lg narrow">
      <div>
        <div className="eyebrow">Signed in as {user.email}</div>
        <h1>Your profile</h1>
      </div>

      <form className="panel stack" onSubmit={save}>
        <label className="field">Display name
          <input id="displayName" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown next to your ratings" />
        </label>
        <label className="field">Home city
          <input id="homeCity" maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <button className="btn" type="submit">Save</button>
        {msg && <p className="msg ok" role="status">{msg}</p>}
      </form>

      <TasteProfile userId={user.id} />

      <section className="panel stack">
        <h2>Your data</h2>
        <p className="muted small">Download everything we store about you, or delete your account and all your ratings.</p>
        <div className="row-gap">
          <button className="btn ghost" type="button" onClick={exportData}>Download my data</button>
          <button className="btn ghost" type="button" onClick={signOut}>Sign out</button>
        </div>
        <label className="field">Type DELETE to permanently delete your account
          <input id="confirmDelete" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
        </label>
        <button className="btn danger" type="button" disabled={confirmDelete !== "DELETE"} onClick={deleteAccount}>Delete my account</button>
      </section>
    </div>
  );
}
