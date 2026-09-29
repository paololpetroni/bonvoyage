import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";

export default function Layout() {
  const { user } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">Bonvoyage</Link>
        <nav className="nav">
          <NavLink to="/" end>Plan a trip</NavLink>
          <NavLink to="/community">Community</NavLink>
          {user ? <NavLink to="/profile">Profile</NavLink> : <NavLink to="/sign-in" className="nav-cta">Sign in</NavLink>}
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="footer">
        <span>Bonvoyage · early preview</span>
        <Link to="/privacy">Privacy</Link>
        <span>Place data © OpenStreetMap contributors</span>
      </footer>
    </div>
  );
}
