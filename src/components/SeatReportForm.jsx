import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { EVENT_KINDS, cleanSection } from "../lib/venues.js";
import { photoUrl, removeFile, uploadSeatPhoto } from "../lib/photos.js";
import StarInput from "./StarInput.jsx";
import VenueMap from "./VenueMap.jsx";

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Where you sat at one game or show: the event, the date, your section/row/seat, how the view was,
// what you paid, and a photo of the view. One report per game, so you can add one every time you go.
export default function SeatReportForm({ place, venue, existing, scores, onDone, onCancel }) {
  const { user } = useAuth();
  const [kind, setKind] = useState(existing?.event_kind || venue?.kinds?.[0] || "hockey");
  const [eventName, setEventName] = useState(existing?.event_name || "");
  const [date, setDate] = useState(existing?.event_date || today());
  const [section, setSection] = useState(existing?.section || "");
  const [row, setRow] = useState(existing?.row_label || "");
  const [seat, setSeat] = useState(existing?.seat_label || "");
  const [view, setView] = useState(existing?.view ? Number(existing.view) : null);
  const [value, setValue] = useState(existing?.value ? Number(existing.value) : null);
  const [price, setPrice] = useState(existing?.price != null ? String(Number(existing.price)) : "");
  const [photo, setPhoto] = useState(null); // { file, preview }
  const [keepPhoto, setKeepPhoto] = useState(Boolean(existing?.photo_path));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const photoRef = useRef(photo);
  photoRef.current = photo;
  useEffect(() => () => { if (photoRef.current) URL.revokeObjectURL(photoRef.current.preview); }, []);

  const knownSections = venue ? new Set(venue.levels.flatMap((l) => l.sections)) : null;
  const sec = cleanSection(section);

  async function save(e) {
    e.preventDefault();
    setErr("");
    if (!sec) return setErr(venue ? "Tap your section on the map, or type it." : "Type your section.");
    if (!view) return setErr("Tap the stars to rate the view from your seat.");
    if (date > today()) return setErr("That date is in the future. Add your seat after the game.");
    setBusy(true);
    try {
      let photo_path = keepPhoto ? existing?.photo_path || null : null;
      if (photo) photo_path = await uploadSeatPhoto({ placeId: place.id, userId: user.id, file: photo.file });
      const row_ = {
        place_id: place.id, user_id: user.id, section: sec, row_label: row || null, seat_label: seat || null,
        event_kind: kind, event_name: eventName || null, event_date: date, view, value, price: price === "" ? null : Number(price), photo_path,
      };
      const q = existing
        ? supabase.from("seat_reports").update(row_).eq("id", existing.id)
        : supabase.from("seat_reports").insert(row_);
      const { error } = await q;
      if (error) {
        if (photo) await removeFile(photo_path);
        throw new Error(error.message.includes("duplicate key") ? "You already added a seat for this venue on that date. Edit that one instead." : error.message);
      }
      if (existing?.photo_path && existing.photo_path !== photo_path) await removeFile(existing.photo_path);
      onDone(`Section ${sec} is in the seat guide. Thanks!`);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <form className="seat-form stack" onSubmit={save}>
      <div className="field">
        <span>What did you see?</span>
        <div className="tagpick">
          {EVENT_KINDS.map(([k, label]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>)}
        </div>
      </div>
      <div className="two-col">
        <label className="field">Event <span className="muted small">optional</span>
          <input id="seatEvent" maxLength={80} value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder={kind === "concert" ? "e.g. Charlotte Cardin" : "e.g. Canadiens vs Bruins"} />
        </label>
        <label className="field">Date
          <input id="seatDate" type="date" max={today()} required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span>Where did you sit?</span>
        {venue && <VenueMap venue={venue} scores={scores} selected={sec} onSelect={setSection} compact />}
        <div className="seat-inputs">
          <label className="field">Section
            <input id="seatSection" maxLength={16} required value={section} onChange={(e) => setSection(e.target.value)} placeholder="312" />
          </label>
          <label className="field">Row <span className="muted small">optional</span>
            <input id="seatRow" maxLength={8} value={row} onChange={(e) => setRow(e.target.value)} placeholder="K" />
          </label>
          <label className="field">Seat <span className="muted small">optional</span>
            <input id="seatSeat" maxLength={8} value={seat} onChange={(e) => setSeat(e.target.value)} placeholder="7" />
          </label>
        </div>
        {venue && sec && !knownSections.has(sec) && <span className="muted small">Section {sec} isn't on our drawing. That's fine for suites or special areas; it'll still be saved.</span>}
      </div>

      <div className="field"><span className="field-title">View from your seat</span>
        <StarInput value={view} onChange={setView} label="View from your seat" size="lg" />
      </div>
      <div className="two-col">
        <div className="field"><span>Worth the price? <span className="muted small">optional</span></span>
          <StarInput value={value} onChange={setValue} label="Value for the price" />
        </div>
        <label className="field">Price per ticket <span className="muted small">optional</span>
          <input id="seatPrice" type="number" min="0" step="1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" />
        </label>
      </div>

      <div className="field">
        <span>Photo of your view <span className="muted small">optional, the most useful thing for others</span></span>
        <div className="slot-grid">
          <div className={`slot${photo || keepPhoto ? " filled" : ""}${photo ? " new" : ""}`}>
            {photo ? <img src={photo.preview} alt="Your view" /> : keepPhoto ? <img src={photoUrl(existing.photo_path)} alt="Your view" /> : <span className="slot-plus" aria-hidden="true">+</span>}
            <span className="slot-label">View from {sec ? `section ${sec}` : "your seat"}</span>
            <label className="slot-pick">
              <span className="visually-hidden">Add a photo of your view</span>
              <input id="seatPhoto" type="file" accept="image/jpeg,image/png,image/webp,image/*" disabled={busy}
                onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) { if (photo) URL.revokeObjectURL(photo.preview); setPhoto({ file: f, preview: URL.createObjectURL(f) }); } }} />
            </label>
            {(photo || keepPhoto) && <button type="button" className="slot-x" aria-label="Remove photo" onClick={() => { if (photo) { URL.revokeObjectURL(photo.preview); setPhoto(null); } else setKeepPhoto(false); }}>×</button>}
          </div>
        </div>
      </div>

      {err && <p className="msg error" role="alert">{err}</p>}
      <div className="row-gap">
        <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : existing ? "Update my seat" : "Add my seat"}</button>
        <button className="linkbtn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
