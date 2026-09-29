import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Community from "./pages/Community.jsx";
import SignIn from "./pages/SignIn.jsx";
import Profile from "./pages/Profile.jsx";
import Privacy from "./pages/Privacy.jsx";
import { useAuth } from "./lib/auth.jsx";
import { isConfigured } from "./lib/supabase.js";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (!isConfigured) return <SetupNeeded />;
  if (loading) return <p className="muted">Loading…</p>;
  return user ? children : <Navigate to="/sign-in" replace />;
}

export function SetupNeeded() {
  return (
    <section className="panel">
      <h2>Connect the database first</h2>
      <p>
        Copy <code>.env.example</code> to <code>.env.local</code>, paste in your Supabase project URL and publishable key,
        then restart <code>npm run dev</code>. The README walks through it step by step.
      </p>
    </section>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="community" element={<Community />} />
        <Route path="sign-in" element={<SignIn />} />
        <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
