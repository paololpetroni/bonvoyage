import { Link } from "react-router-dom";

// Ranked score bars (Beli-style): one row per item, bar length = score out of 10.
// Single series, so one hue; the value is printed at the end of each bar in text ink.
export function ScoreBars({ items, max = 10, empty = "Nothing rated yet.", showRank = true, unit = "/10" }) {
  if (!items.length) return <p className="muted small">{empty}</p>;
  return (
    <ol className={`score-bars${showRank ? "" : " no-rank"}`}>
      {items.map((it, i) => {
        const pct = Math.max(2, Math.min(100, (it.score / max) * 100));
        const body = (
          <>
            {showRank && <span className="sb-rank">{i + 1}</span>}
            <span className="sb-text">
              <span className="sb-label">{it.label}</span>
              {it.sub && <span className="sb-sub">{it.sub}</span>}
            </span>
            <span className="sb-track" aria-hidden="true"><span className="sb-fill" style={{ width: `${pct}%` }} /></span>
            <span className="sb-value">{it.score.toFixed(1)}<small>{unit}</small></span>
            {it.tip && <span className="sb-tip" role="tooltip">{it.tip}</span>}
          </>
        );
        return (
          <li key={it.id ?? it.label} className={it.highlight ? "hl" : ""}>
            {it.href ? <Link className="sb-row" to={it.href}>{body}</Link>
              : it.onClick ? <button type="button" className="sb-row" onClick={it.onClick}>{body}</button>
              : <div className="sb-row" tabIndex={0}>{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// How many ratings landed on each score from 2 to 10 (half stars x 2).
// Counts are labelled only where a bar has ratings, so the chart stays quiet.
export function ScoreHistogram({ dist, label = "ratings", mine }) {
  const bins = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => ({ s, c: Number(dist?.[s] || dist?.[String(s)] || 0) }));
  const top = Math.max(1, ...bins.map((b) => b.c));
  const total = bins.reduce((a, b) => a + b.c, 0);
  if (!total) return null;
  return (
    <figure className="histo">
      <div className="histo-bars" role="img" aria-label={`How ${total} ${label} are spread from 2 to 10`}>
        {bins.map((b) => (
          <div key={b.s} className={`hb${mine === b.s ? " mine" : ""}`} tabIndex={0}>
            <span className="hb-count">{b.c > 0 ? b.c : ""}</span>
            <span className="hb-bar" style={{ height: `${b.c ? Math.max(6, (b.c / top) * 100) : 0}%` }} />
            <span className="hb-x">{b.s}</span>
            <span className="sb-tip" role="tooltip">{b.c} {b.c === 1 ? label.replace(/s$/, "") : label} at {b.s}/10{mine === b.s ? " (yours)" : ""}</span>
          </div>
        ))}
      </div>
      <figcaption className="muted tiny">{total} {label}{mine ? " · yours is highlighted" : ""}</figcaption>
    </figure>
  );
}
