// Venues with a drawn seating map. These are our own simplified drawings of the seating bowl,
// not official seating charts. Sections run around the bowl in order, starting at the bottom centre.
// To add a venue: its names, rough location, and each level's section numbers in order around the bowl.

import { distanceKm } from "./photon.js";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

export const VENUES = [
  {
    key: "bell-centre",
    name: "Bell Centre",
    names: ["bell centre", "centre bell", "bell center", "centre molson"],
    at: { lat: 45.4961, lon: -73.5693 },
    kinds: ["hockey", "concert", "basketball", "other"],
    confidence: "Section order from public seating guides. Drawing is simplified.",
    bottomLabel: "Benches",
    topLabel: "Penalty box",
    levels: [
      { key: "100", label: "100s · Rouge", sections: range(101, 124) },
      { key: "200", label: "200s · Club Desjardins", sections: range(201, 224) },
      { key: "300", label: "300s", sections: range(301, 336) },
      { key: "400", label: "400s", sections: range(401, 436) },
    ],
    notes: {
      101: "Centre ice, between the benches",
      113: "Centre ice, penalty box side",
      318: "Behind the press gondola, with its own scoreboard",
      319: "Behind the press gondola, with its own scoreboard",
      320: "Behind the press gondola, with its own scoreboard",
    },
  },
  {
    key: "place-bell",
    name: "Place Bell",
    names: ["place bell"],
    at: { lat: 45.5575, lon: -73.7204 },
    kinds: ["hockey", "concert", "other"],
    confidence: "Section numbers from public seating guides. Which way the numbers run is approximate.",
    levels: [
      { key: "100", label: "100s · lower", sections: range(101, 116) },
      { key: "200", label: "200s · upper", sections: range(201, 218) },
    ],
    notes: {},
  },
];

const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// The drawn venue for a place: a matching name, or a sports place within 1.5 km of the venue
export function venueFor(place) {
  if (!place) return null;
  const n = norm(place.name);
  return VENUES.find((v) =>
    v.names.some((x) => n.includes(x)) ||
    (place.lat != null && distanceKm(v.at, place) < 1.5 && v.names.some((x) => x.split(" ").every((w) => n.includes(w))))
  ) || null;
}

export function levelOf(venue, section) {
  if (venue) return venue.levels.find((l) => l.sections.includes(section)) || null;
  return null;
}

// "sec 312" -> "312"
export const cleanSection = (s) => (s || "").trim().replace(/^sec(tion)?\.?\s*/i, "").toUpperCase();

export const EVENT_KINDS = [
  ["hockey", "Hockey"], ["basketball", "Basketball"], ["soccer", "Soccer"], ["baseball", "Baseball"],
  ["football", "Football"], ["concert", "Concert"], ["other", "Other"],
];

// ---------- Geometry for the drawn bowl ----------
// A point on a rounded rectangle centred at (cx, cy), measured as a fraction t of the way around,
// starting at the bottom centre and going clockwise on screen.
function perimeterPoint(t, hw, hh, r, cx, cy) {
  const sx = 2 * (hw - r), sy = 2 * (hh - r), arc = (Math.PI * r) / 2;
  const P = 2 * sx + 2 * sy + 4 * arc;
  let d = (((t % 1) + 1) % 1) * P;
  const segs = [
    [sx / 2, (u) => [cx - u, cy + hh]],
    [arc, (u) => { const a = Math.PI / 2 + u / r; return [cx - (hw - r) + r * Math.cos(a), cy + (hh - r) + r * Math.sin(a)]; }],
    [sy, (u) => [cx - hw, cy + (hh - r) - u]],
    [arc, (u) => { const a = Math.PI + u / r; return [cx - (hw - r) + r * Math.cos(a), cy - (hh - r) + r * Math.sin(a)]; }],
    [sx, (u) => [cx - (hw - r) + u, cy - hh]],
    [arc, (u) => { const a = -Math.PI / 2 + u / r; return [cx + (hw - r) + r * Math.cos(a), cy - (hh - r) + r * Math.sin(a)]; }],
    [sy, (u) => [cx + hw, cy - (hh - r) + u]],
    [arc, (u) => { const a = u / r; return [cx + (hw - r) + r * Math.cos(a), cy + (hh - r) + r * Math.sin(a)]; }],
    [sx / 2, (u) => [cx + (hw - r) - u, cy + hh]],
  ];
  for (const [len, f] of segs) {
    if (d <= len) return f(d);
    d -= len;
  }
  return [cx, cy + hh];
}

// Ring sizes (half width, half height, corner radius) from the rink outward
const RINGS = {
  4: [[88, 50, 34, 116, 72, 48], [120, 76, 50, 138, 90, 58], [142, 94, 60, 170, 118, 76], [174, 122, 78, 194, 140, 88]],
  2: [[88, 50, 34, 128, 86, 54], [134, 92, 58, 176, 128, 80]],
};

// Every section as an SVG path plus a label position, for a 400 x 300 drawing
export function venueShapes(venue) {
  const cx = 200, cy = 150, steps = 8;
  const rings = RINGS[venue.levels.length] || RINGS[4];
  const out = [];
  venue.levels.forEach((level, li) => {
    const [ihw, ihh, ir, ohw, ohh, or] = rings[li];
    const N = level.sections.length;
    level.sections.forEach((section, i) => {
      const t0 = (i - 0.5) / N + 0.004, t1 = (i + 0.5) / N - 0.004;
      const outer = [], inner = [];
      for (let k = 0; k <= steps; k++) {
        const t = t0 + ((t1 - t0) * k) / steps;
        outer.push(perimeterPoint(t, ohw - 1, ohh - 1, or, cx, cy));
        inner.push(perimeterPoint(t, ihw + 1, ihh + 1, ir, cx, cy));
      }
      const pts = [...outer, ...inner.reverse()];
      const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z";
      const [lx, ly] = perimeterPoint(i / N, (ihw + ohw) / 2, (ihh + ohh) / 2, (ir + or) / 2, cx, cy);
      out.push({ section, level: level.key, d, lx, ly, labelEvery: N > 30 ? 3 : 1, index: i });
    });
  });
  return out;
}
