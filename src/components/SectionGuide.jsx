import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { EVENT_KINDS, levelOf, venueFor } from "../lib/venues.js";
import { photoUrl } from "../lib/photos.js";
import VenueMap from "./VenueMap.jsx";
import SeatReportForm from "./SeatReportForm.jsx";
import { ScoreBars } from "./Charts.jsx";
import { useToast } from "./Toast.jsx";

const kindLabel = (k) => EVENT_KINDS.find(([x]) => x === k)?.[1] || k;
const fmtDate = (d) => new Date(d + "T12:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// Seat guide for a sports venue: a drawn map shaded by how good the view is, the best sections ranked,
// photos from each section, and your own seat reports.
export default function SectionGuide({ place }) {
  const { user } = useAuth();
  const toast = useToast();
  const venue = useMemo(() => venueFor(place), [place]);
  const [guide, setGuide] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null); // null | "new" | report being edited

  const load = useCallback(async () => {
    const [g, m] = await Promise.all([
      supabase.rpc("get_section_guide", { p_place_id: place.id }),
      user ? supabase.from("seat_reports").select("*").eq("user_id", user.id).eq("place_id", place.id).order("event_date", { ascending: false }) : { data: [] },
    ]);
    setGuide(g.data || []);
    setMine(m.data || []);
    setLoading(false);
  }, [place.id, user]);

  useEffect(() => { load(); }, [load]);

  const scores = useMemo(() => Object.fromEntries(guide.map((s) => [s.section, s])), [guide]);
  const ranked = useMemo(() => [...guide].sort((a, b) => b.avg_view - a.avg_view || b.n - a.n), [guide]);
  const sel = selected ? scores[selected] : null;

  async function remove(r) {
    const { error } = await supabase.from("seat_reports").delete().eq("id", r.id);
    if (error) return toast("Couldn't remove it: " + error.message, "error");
    if (r.photo_path) await supabase.storage.from("place-photos").remove([r.photo_path]);
    toast("Seat removed.");
    load();
  }

  if (form) {
    return (
      <div className="seat-guide">
        <h3>{form === "new" ? "Add where you sat" : `Edit your seat, ${fmtDate(form.event_date)}`}</h3>
        <SeatReportForm place={place} venue={venue} existing={form === "new" ? null : form} scores={scores}
          onCancel={() => setForm(null)} onDone={(t) => { toast(t); setForm(null); load(); }} />
      </div>
    );
  }

  return (
    <div className="seat-guide">
      <div className="sg-head">
        <div>
          <h3>Seat guide</h3>
          <p className="muted small">{guide.length ? `${guide.reduce((a, s) => a + s.n, 0)} seat reports across ${guide.length} sections.` : "No seat reports yet. Be the first to say how the view was."}</p>
        </div>
        {user ? <button type="button" className="btn small" onClick={() => setForm("new")}>Add my seat</button>
          : <Link to="/sign-in" className="btn ghost small">Sign in to add your seat</Link>}
      </div>

      {loading && <p className="muted small">Loading seats…</p>}

      {venue && (
        <>
          <VenueMap venue={venue} scores={scores} selected={selected} onSelect={(s) => setSelected(s === selected ? null : s)} />
          <p className="muted tiny">Our own simplified drawing, not an official seating chart. {venue.confidence}</p>
        </>
      )}

      {selected && (
        <div className="sg-detail">
          <div className="sg-detail-head">
            <strong>Section {selected}</strong>
            {venue && levelOf(venue, selected) && <span className="muted small">{levelOf(venue, selected).label}</span>}
            <button type="button" className="linkbtn" onClick={() => setSelected(null)}>Close</button>
          </div>
          {venue?.notes?.[selected] && <p className="small">{venue.notes[selected]}</p>}
          {sel ? (
            <>
              <div className="chips">
                <span className="chip good">View {(sel.avg_view * 2).toFixed(1)}/10</span>
                {sel.avg_value != null && <span className="chip">Worth it {(sel.avg_value * 2).toFixed(1)}/10</span>}
                {sel.avg_price != null && <span className="chip">About ${Number(sel.avg_price)} a ticket</span>}
                <span className="chip">{sel.n} report{sel.n > 1 ? "s" : ""}</span>
                {Object.entries(sel.kinds || {}).map(([k, c]) => <span key={k} className="chip tag">{kindLabel(k)} {c}</span>)}
              </div>
              {sel.photos?.length > 0 && (
                <div className="photo-strip">
                  {sel.photos.map((p) => (
                    <a key={p} className="thumb" href={photoUrl(p)} target="_blank" rel="noreferrer"><img src={photoUrl(p)} alt={`View from section ${selected}`} loading="lazy" /></a>
                  ))}
                </div>
              )}
            </>
          ) : <p className="muted small">No one has reported this section yet.</p>}
        </div>
      )}

      {ranked.length > 0 && (
        <div className="stack">
          <h4 className="sub-head">Best views</h4>
          <ScoreBars items={ranked.slice(0, 10).map((s) => ({
            id: s.section, label: `Section ${s.section}`, score: Number(s.avg_view) * 2,
            sub: [venue && levelOf(venue, s.section)?.label, `${s.n} report${s.n > 1 ? "s" : ""}`, s.avg_price != null ? `~$${Number(s.avg_price)}` : null].filter(Boolean).join(" · "),
            highlight: s.section === selected,
            tip: `View ${(s.avg_view * 2).toFixed(1)}/10${s.avg_value != null ? ` · worth it ${(s.avg_value * 2).toFixed(1)}/10` : ""}`,
          }))} />
        </div>
      )}

      {mine.length > 0 && (
        <div className="stack">
          <h4 className="sub-head">Your seats here</h4>
          <ul className="my-seats">
            {mine.map((r) => (
              <li key={r.id}>
                <span><strong>Section {r.section}</strong>{r.row_label && `, row ${r.row_label}`}{r.seat_label && `, seat ${r.seat_label}`}</span>
                <span className="muted small">{[kindLabel(r.event_kind), r.event_name, fmtDate(r.event_date)].filter(Boolean).join(" · ")} · view {(r.view * 2).toFixed(0)}/10</span>
                <span className="row-gap">
                  <button type="button" className="linkbtn" onClick={() => setForm(r)}>Edit</button>
                  <button type="button" className="linkbtn danger-link" onClick={() => remove(r)}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted tiny">Only you see your dates and seats. Others see section averages and photos.</p>
        </div>
      )}
    </div>
  );
}
