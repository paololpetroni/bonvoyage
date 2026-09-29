import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { SetupNeeded } from "../App.jsx";

export default function SignIn() {
  const { user } = useAuth();
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ kind: "", text: "" });

  if (!isConfigured) return <SetupNeeded />;
  if (user) return <Navigate to="/profile" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage({ kind: "", text: "" });
    const redirect = window.location.origin + "/profile";
    const { data, error } =
      mode === "sign-up"
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        : mode === "reset"
          ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
          : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setMessage({ kind: "error", text: error.message });
    if (mode === "reset") return setMessage({ kind: "ok", text: "Check your email for a link to set a new password." });
    if (mode === "sign-up" && !data.session) return setMessage({ kind: "ok", text: "Account created. Check your email to confirm it, then sign in." });
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/profile" } });
    if (error) setMessage({ kind: "error", text: "Google sign-in isn't set up yet. Use email for now. (" + error.message + ")" });
  }

  const titles = { "sign-in": "Sign in", "sign-up": "Create your account", reset: "Reset your password" };

  return (
    <section className="panel narrow">
      <h1>{titles[mode]}</h1>
      <form onSubmit={submit} className="stack">
        <label className="field">Email
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "reset" && (
          <label className="field">Password
            <input id="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === "sign-up" && <span className="muted small">At least 8 characters.</span>}
          </label>
        )}
        {mode === "sign-up" && (
          <p className="small muted">
            By creating an account you agree to how we handle your information, described in our <Link to="/privacy">privacy policy</Link>.
          </p>
        )}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Working…" : titles[mode]}</button>
      </form>

      {mode !== "reset" && <button className="btn ghost" type="button" onClick={google}>Continue with Google</button>}

      {message.text && <p className={message.kind === "error" ? "msg error" : "msg ok"} role="status">{message.text}</p>}

      <div className="small row-gap">
        {mode !== "sign-in" && <button className="linkbtn" type="button" onClick={() => setMode("sign-in")}>I have an account</button>}
        {mode !== "sign-up" && <button className="linkbtn" type="button" onClick={() => setMode("sign-up")}>Create an account</button>}
        {mode !== "reset" && <button className="linkbtn" type="button" onClick={() => setMode("reset")}>Forgot password?</button>}
      </div>
    </section>
  );
}
