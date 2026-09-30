import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { usePersonal } from "../lib/personal.jsx";
import Icon from "../components/Icon.jsx";
import { useToast } from "../components/Toast.jsx";

const HANDLE = /^[a-z0-9_]{3,20}$/;
const RESULT = {
  requested: "Request sent. They'll see it next time they open Friends.",
  accepted: "You're now friends.",
  already_requested: "You've already asked them. Waiting on their reply.",
  already_friends: "You're already friends.",
};

// Friends: pick your @username, add people by theirs or with your invite link, answer requests, see lists.
export default function Friends() {
  const { user } = useAuth();
  const me = usePersonal();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [handle, setHandle] = useState(null); // your saved username
  const [draft, setDraft] = useState("");
  const [add, setAdd] = useState(params.get("add") || "");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, f] = await Promise.all([
      supabase.from("profiles").select("handle").eq("id", user.id).single(),
      supabase.rpc("get_my_friends"),
    ]);
    setHandle(p.data?.handle || "");
    setDraft(p.data?.handle || "");
    setRows(f.data || []);
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  async function saveHandle(e) {
    e.preventDefault();
    const h = draft.trim().replace(/^@/, "").toLowerCase();
    if (!HANDLE.test(h)) return toast("Usernames are 3 to 20 lowercase letters, numbers or underscores.", "error");
    const { error } = await supabase.from("profiles").update({ handle: h }).eq("id", user.id);
    if (error) return toast(error.message.includes("duplicate") ? `@${h} is taken. Try another.` : "Couldn't save: " + error.message, "error");
    setHandle(h);
    toast(`You're @${h}.`);
    me.reload();
  }

  async function request(h) {
    const clean = (h || "").trim().replace(/^@/, "").toLowerCase();
    if (!clean) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("request_friend", { p_handle: clean });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(RESULT[data] || "Done.");
    setAdd("");
    if (params.get("add")) setParams({}, { replace: true });
    load();
  }

  async function accept(r) {
    const { error } = await supabase.rpc("accept_friend", { p_id: r.friendship_id });
    if (error) return toast(error.message, "error");
    toast(`You and ${r.display_name || "@" + r.handle} are now friends.`);
    load();
  }

  async function remove(r, text) {
    const { error } = await supabase.from("friendships").delete().eq("id", r.friendship_id);
    if (error) return toast(error.message, "error");
    toast(text);
    load();
  }

  const invite = handle ? `${window.location.origin}/friends?add=${handle}` : "";
  async function copyInvite() {
    try { await navigator.clipboard.writeText(invite); toast("Invite link copied."); }
    catch { toast("Copy didn't work. Select the link and copy it yourself.", "error"); }
  }

  const received = rows.filter((r) => r.status === "pending" && r.direction === "received");
  const sent = rows.filter((r) => r.status === "pending" && r.direction === "sent");
  const friends = rows.filter((r) => r.status === "accepted");
  const inviteFor = params.get("add");

  if (handle === null) return <p className="muted">Loading friends…</p>;

  return (
    <div className="stack-lg narrow friends">
      <div>
        <div className="eyebrow">Friends</div>
        <h1>Travel with your people</h1>
        <p className="muted">Friends see each other's ratings and lists, and you'll see which friends rated a place. Your email and seat dates stay private.</p>
      </div>

      {inviteFor && inviteFor !== handle && (
        <section className="panel invite-card">
          <Icon name="user" size={22} />
          <div><strong>@{inviteFor} invited you</strong><span className="muted small">Add them as a friend to see each other's lists.</span></div>
          <button type="button" className="btn" onClick={() => request(inviteFor)} disabled={busy}>Add @{inviteFor}</button>
        </section>
      )}

      <section className="panel stack">
        <h2 className="panel-title">Your username</h2>
        <form className="handle-row" onSubmit={saveHandle}>
          <span className="at">@</span>
          <input id="handle" value={draft} onChange={(e) => setDraft(e.target.value.toLowerCase())} maxLength={20} placeholder="paolo" aria-label="Your username" />
          <button type="submit" className="btn small" disabled={draft.replace(/^@/, "") === handle}>Save</button>
        </form>
        {handle ? (
          <div className="invite">
            <span className="muted small">Your invite link</span>
            <div className="invite-row"><code>{invite}</code><button type="button" className="btn ghost small" onClick={copyInvite}>Copy</button></div>
          </div>
        ) : <p className="muted small">Pick a username so friends can find you.</p>}
      </section>

      <section className="panel stack">
        <h2 className="panel-title">Add a friend</h2>
        <form className="handle-row" onSubmit={(e) => { e.preventDefault(); request(add); }}>
          <span className="at">@</span>
          <input id="addFriend" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="their username" aria-label="Friend's username" />
          <button type="submit" className="btn small" disabled={busy || !add.trim()}>Send request</button>
        </form>
        <p className="muted tiny">You need their exact username, so nobody can browse who's on Bonvoyage.</p>
      </section>

      {received.length > 0 && (
        <section className="panel stack">
          <h2 className="panel-title">Requests for you</h2>
          <ul className="people">
            {received.map((r) => (
              <li key={r.friendship_id}>
                <span className="avatar sm">{(r.display_name || r.handle || "?")[0].toUpperCase()}</span>
                <span className="who"><strong>{r.display_name || "@" + r.handle}</strong><span className="muted small">@{r.handle}</span></span>
                <button type="button" className="btn small" onClick={() => accept(r)}>Accept</button>
                <button type="button" className="linkbtn" onClick={() => remove(r, "Request declined.")}>Decline</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel stack">
        <h2 className="panel-title">Your friends {friends.length > 0 && <span className="muted">{friends.length}</span>}</h2>
        {friends.length === 0 && <p className="muted small">No friends yet. Share your invite link or add someone by username.</p>}
        <ul className="people">
          {friends.map((r) => (
            <li key={r.friendship_id}>
              <span className="avatar sm">{(r.display_name || r.handle || "?")[0].toUpperCase()}</span>
              <span className="who"><strong>{r.display_name || "@" + r.handle}</strong><span className="muted small">@{r.handle} · {r.ratings} rated</span></span>
              <Link className="btn ghost small" to={`/friends/${r.friend_id}`}>See list</Link>
              <button type="button" className="linkbtn danger-link" onClick={() => remove(r, "Removed from friends.")}>Remove</button>
            </li>
          ))}
        </ul>
        {sent.length > 0 && (
          <>
            <h3 className="sub-head">Waiting on</h3>
            <ul className="people">
              {sent.map((r) => (
                <li key={r.friendship_id}>
                  <span className="avatar sm muted-av">{(r.display_name || r.handle || "?")[0].toUpperCase()}</span>
                  <span className="who"><strong>{r.display_name || "@" + r.handle}</strong><span className="muted small">@{r.handle} · request sent</span></span>
                  <button type="button" className="linkbtn" onClick={() => remove(r, "Request cancelled.")}>Cancel</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
