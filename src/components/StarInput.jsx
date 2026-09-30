import { useRef, useState } from "react";

// Tap-to-rate stars in half steps. Tap the left half of a star for a half star.
// Keyboard: arrow keys change by half a star.
export default function StarInput({ value, onChange, label = "Rating", size = "md", id }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const shown = hover ?? value ?? 0;

  const fromPointer = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - r.left, 0), r.width);
    return Math.max(1, Math.ceil((x / r.width) * 10) / 2);
  };

  function onKey(e) {
    const v = value ?? 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, (v || 0.5) + 0.5)); }
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(1, v - 0.5)); }
    if (e.key === "Home") { e.preventDefault(); onChange(1); }
    if (e.key === "End") { e.preventDefault(); onChange(5); }
  }

  return (
    <div className={`star-input ${size}`}>
      <div ref={ref} id={id} className="stars-track" role="slider" tabIndex={0} aria-label={label}
        aria-valuemin={1} aria-valuemax={5} aria-valuenow={value ?? undefined} aria-valuetext={value ? `${value} out of 5 stars` : "Not rated"}
        onClick={(e) => onChange(fromPointer(e.clientX))}
        onMouseMove={(e) => setHover(fromPointer(e.clientX))} onMouseLeave={() => setHover(null)}
        onKeyDown={onKey}>
        <span className="stars-bg" aria-hidden="true">★★★★★</span>
        <span className="stars-fg" aria-hidden="true" style={{ width: `${(shown / 5) * 100}%` }}>★★★★★</span>
      </div>
      <span className="star-value">{value ? `${(value * 2).toFixed(0)}/10` : "Tap to rate"}</span>
    </div>
  );
}
