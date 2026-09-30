import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Community from "./pages/Community.jsx";
import SignIn from "./pages/SignIn.jsx";
import Profile from "./pages/Profile.jsx";
import Privacy from "./pages/Privacy.jsx";
import Welcome from "./pages/Welcome.jsx";
import MyList from "./pages/MyList.jsx";
import Friends from "./pages/Friends.jsx";
import { useAuth } from "./lib/auth.jsx";
import { isConfigured } from "./lib/supabase.js";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (!isConfigured) return <SetupNeeded />;
  if (loading) return <p className="muted">Loading…</p>;
  return user ? children : <Navigate to="/sign-in" replace />;
}

// Start each new page at the top (but let #add links jump to their spot)
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo(0, 0); }, [pathname, hash]);
  return null;
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
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="explore" element={<Community />} />
          <Route path="community" element={<Navigate to="/explore" replace />} />
          <Route path="sign-in" element={<SignIn />} />
          <Route path="welcome" element={<RequireAuth><Welcome /></RequireAuth>} />
          <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="list" element={<RequireAuth><MyList /></RequireAuth>} />
          <Route path="friends" element={<RequireAuth><Friends /></RequireAuth>} />
          <Route path="friends/:id" element={<RequireAuth><MyList /></RequireAuth>} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
