import { Link } from "react-router-dom";
import { CATEGORIES } from "../lib/categories.js";
import { cuisineLabel } from "../lib/cuisines.js";
import { placeCuisines } from "../lib/ranking.js";
import { coverPhoto, sameTown } from "../lib/places.js";
import Cover from "./Cover.jsx";

// A compact place card for the home page rows
export default function PlaceTile({ p, category, city, photos, personal }) {
  const cat = CATEGORIES[category];
  const cuisine = category === "restaurants" ? placeCuisines(p).map(cuisineLabel).join(" / ") : "";
  const town = p.city && p.city !== "Unknown" && !sameTown(p.city, city.name) ? p.city : null;
  const meta = [cuisine || p.type, town || (p.km >= 1 ? `${Math.round(p.km)} km` : null)].filter(Boolean).join(" · ");
  const topReason = personal ? p.s.reasons.find((r) => r.kind === "good") : null;
  const score = personal ? p.s.final : p.n ? Number(p.avg_overall) : null;

  return (
    <Link className={`tile${p.s.over ? " over" : ""}`} to={`/explore?cat=${category}&place=${p.id}`}>
      <div className="tile-cover">
        <Cover photo={coverPhoto(photos, cat.cover)} category={category} name={p.name} />
        <span className={`score-badge${personal ? " personal" : ""}`}>
          {score != null ? (score * 2).toFixed(1) : "New"}
          {personal && <small>for you</small>}
        </span>
      </div>
      <div className="tile-body">
        <strong className="tile-name">{p.name}</strong>
        <span className="muted small tile-meta">{meta}</span>
        {topReason
          ? <span className="tile-reason">{topReason.text}</span>
          : <span className="muted tiny">{p.n ? `${p.n} rating${p.n > 1 ? "s" : ""}` : "Not yet rated"}</span>}
      </div>
    </Link>
  );
}
