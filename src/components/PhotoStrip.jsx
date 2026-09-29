import { useEffect, useState } from "react";
import { photoUrl } from "../lib/photos.js";

// One tile per photo slot (Appetizer, Main, Room...), showing the newest photo and how many there are.
// Tapping a tile opens a full-size viewer for that slot with previous/next.
export default function PhotoStrip({ photos, slots, placeName }) {
  const [viewing, setViewing] = useState(null); // { list, index, label }

  useEffect(() => {
    if (!viewing) return;
    const step = (d) => setViewing((v) => ({ ...v, index: (v.index + d + v.list.length) % v.list.length }));
    const onKey = (e) => {
      if (e.key === "Escape") setViewing(null);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  const groups = slots
    .map(([slot, label]) => ({ slot, label, list: photos.filter((p) => p.slot === slot) }))
    .filter((g) => g.list.length);
  if (!groups.length) return null;

  const step = (d) => setViewing((v) => ({ ...v, index: (v.index + d + v.list.length) % v.list.length }));
  const current = viewing && viewing.list[viewing.index];

  return (
    <>
      <div className="photo-strip">
        {groups.map((g) => (
          <button key={g.slot} type="button" className="thumb" onClick={() => setViewing({ list: g.list, index: 0, label: g.label })}
            aria-label={`${g.label} photos of ${placeName} (${g.list.length})`}>
            <img src={photoUrl(g.list[0].path)} alt="" loading="lazy" />
            <span className="thumb-label">{g.label}{g.list.length > 1 ? ` · ${g.list.length}` : ""}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label={`${viewing.label} photos of ${placeName}`} onClick={() => setViewing(null)}>
          <img src={photoUrl(current.path)} alt={`${viewing.label} at ${placeName}`} onClick={(e) => e.stopPropagation()} />
          <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
            {viewing.list.length > 1 && <button type="button" onClick={() => step(-1)}>‹ Previous</button>}
            <span>{viewing.label} · {viewing.index + 1} of {viewing.list.length}</span>
            {viewing.list.length > 1 && <button type="button" onClick={() => step(1)}>Next ›</button>}
            <button type="button" onClick={() => setViewing(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
