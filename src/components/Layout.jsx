import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth.jsx";
import { usePersonal } from "../lib/personal.jsx";
import Logo from "./Logo.jsx";
import Icon from "./Icon.jsx";

function QuickStartBanner() {
  const { pathname } = useLocation();
  const me = usePersonal();
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem("bonvoyage-qs-later") === "1"; } catch { return false; }
  });
  if (!me?.signedIn || !me.loaded || me.onboarded || hidden || pathname === "/welcome") return null;
  const later = () => {
    setHidden(true);
    try { sessionStorage.setItem("bonvoyage-qs-later", "1"); } catch { /* fine */ }
  };
  return (
    <div className="qs-banner">
      <Icon name="spark" size={20} />
      <span><strong>Get picks that fit your taste.</strong> The quick start takes about a minute.</span>
      <Link className="btn small" to="/welcome">Start</Link>
      <button type="button" className="linkbtn" onClick={later}>Later</button>
    </div>
  );
}

export default function Layout() {
  const { user } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Bonvoyage home"><Logo /></Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>Discover</NavLink>
          <NavLink to="/explore">Explore</NavLink>
          {user && <NavLink to="/list">My list</NavLink>}
          {user && <NavLink to="/friends" end={false}>Friends</NavLink>}
          {user && <NavLink to="/profile">Profile</NavLink>}
        </nav>
        <div className="top-actions">
          <Link to="/explore#add" className="btn small add-btn"><Icon name="plus" size={16} /> Add a place</Link>
          {!user && <Link to="/sign-in" className="btn small ghost">Sign in</Link>}
        </div>
      </header>
      <QuickStartBanner />
      <main className="page">
        <Outlet />
      </main>
      <footer className="footer">
        <span>bonvoyage · early preview</span>
        <Link to="/privacy">Privacy</Link>
        <span>Place data © OpenStreetMap contributors</span>
      </footer>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><Icon name="compass" size={22} /><span>Discover</span></NavLink>
        <NavLink to="/explore" end><Icon name="list" size={22} /><span>Explore</span></NavLink>
        <Link to="/explore#add" className="tab-add" aria-label="Add a place"><Icon name="plus" size={24} /></Link>
        {user
          ? <NavLink to="/list"><Icon name="spark" size={22} /><span>My list</span></NavLink>
          : null}
        {user
          ? <NavLink to="/profile"><Icon name="user" size={22} /><span>You</span></NavLink>
          : <NavLink to="/sign-in"><Icon name="user" size={22} /><span>Sign in</span></NavLink>}
      </nav>
    </div>
  );
}
