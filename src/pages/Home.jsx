import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="stack-lg">
      <section className="hero">
        <div className="eyebrow">Early preview</div>
        <h1>Plan a trip around places real travelers rated</h1>
        <p className="lede">
          Tell us where you're going, what you love and what you want to spend. Bonvoyage builds the trip and ranks every
          hotel, restaurant, bar, game and sight for you.
        </p>
        <div className="row-gap">
          <Link className="btn" to="/community">Browse the community</Link>
          <Link className="btn ghost" to="/sign-in">Create an account</Link>
        </div>
      </section>
      <section className="panel">
        <h2>Trip planner</h2>
        <p className="muted">
          The seven-step trip wizard moves in here in Phase 5. For now it lives in <code>prototypes/</code>.
        </p>
      </section>
    </div>
  );
}
