import { useState } from "react";
import CitySearch from "./CitySearch.jsx";

// City heading with a Change button that opens the city search
export default function CityPicker({ city, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="city-picker">
      <div className="city-line">
        <h1>{city.name}</h1>
        {city.region && <span className="muted">{city.region}</span>}
        <button className="linkbtn" type="button" onClick={() => setOpen(!open)}>{open ? "Cancel" : "Change city"}</button>
      </div>
      {open && <CitySearch autoFocus onPick={(c) => { onChange(c); setOpen(false); }} />}
    </div>
  );
}
