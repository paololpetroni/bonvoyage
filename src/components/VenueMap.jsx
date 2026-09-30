import { useMemo } from "react";
import { venueShapes } from "../lib/venues.js";

// View score (1-5) -> one of five steps of a single teal ramp. Light = weaker view, dark = better.
const STEPS = [
  { min: 0, label: "under 5" },
  { min: 2.5, label: "5–6" },
  { min: 3.25, label: "6.5–7.5" },
  { min: 3.75, label: "7.5–8.5" },
  { min: 4.25, label: "8.5+" },
];
export const stepOf = (v) => (v == null ? -1 : STEPS.reduce((acc, s, i) => (v >= s.min ? i : acc), 0));

// Our own simplified drawing of a venue's seating bowl. Sections with reports are shaded by their
// average view score; tap one to see it. Used both to browse and to pick your seat.
export default function VenueMap({ venue, scores = {}, selected, onSelect, compact = false }) {
  const shapes = useMemo(() => venueShapes(venue), [venue]);
  return (
    <figure className={`venue-map${compact ? " compact" : ""}`}>
      <svg viewBox="0 0 400 300" role="group" aria-label={`${venue.name} seating map`}>
        <rect x="126" y="112" width="148" height="76" rx="30" className="rink" />
        <line x1="200" y1="112" x2="200" y2="188" className="rink-line" />
        <circle cx="200" cy="150" r="10" className="rink-line" fill="none" />
        {venue.bottomLabel && <text x="200" y="183" className="rink-label">{venue.bottomLabel}</text>}
        {venue.topLabel && <text x="200" y="123" className="rink-label">{venue.topLabel}</text>}
        {shapes.map((s) => {
          const sc = scores[s.section];
          const step = stepOf(sc?.avg_view != null ? Number(sc.avg_view) : null);
          const isSel = selected === s.section;
          const title = sc ? `Section ${s.section}: view ${(Number(sc.avg_view) * 2).toFixed(1)}/10 from ${sc.n} report${sc.n > 1 ? "s" : ""}` : `Section ${s.section}: no reports yet`;
          return (
            <g key={s.section} className={`sec step-${step}${isSel ? " selected" : ""}`}
              role="button" tabIndex={0} aria-label={title} aria-pressed={isSel}
              onClick={() => onSelect?.(s.section)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(s.section); } }}>
              <title>{title}</title>
              <path d={s.d} />
              {(s.index % s.labelEvery === 0 || isSel) && <text x={s.lx} y={s.ly + 2.2}>{s.section}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="map-legend">
        <span className="muted tiny">View from the seat</span>
        {STEPS.map((s, i) => <span key={s.label} className="leg"><i className={`sw step-${i}`} />{s.label}</span>)}
        <span className="leg"><i className="sw step--1" />no reports</span>
      </figcaption>
    </figure>
  );
}
