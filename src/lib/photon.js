// Place search powered by Photon (https://photon.komoot.io), a free search-as-you-type service built on
// OpenStreetMap data. The public server is shared: keep requests light (we debounce typing and cap results).
// If Bonvoyage grows, run our own Photon server and change PHOTON_URL.

const PHOTON_URL = "https://photon.komoot.io/api/";
const LANG = "en";

// OpenStreetMap tag -> Bonvoyage category and a readable type
const CLASSIFY = {
  amenity: {
    restaurant: ["restaurants", "Restaurant"], fast_food: ["restaurants", "Fast food"], cafe: ["restaurants", "Café"],
    food_court: ["restaurants", "Food court"], ice_cream: ["restaurants", "Ice cream"],
    bar: ["bars", "Bar"], pub: ["bars", "Pub"], biergarten: ["bars", "Beer garden"], nightclub: ["bars", "Nightclub"],
    theatre: ["sights", "Theatre"], arts_centre: ["sights", "Arts centre"], place_of_worship: ["sights", "Place of worship"],
    marketplace: ["sights", "Market"],
  },
  shop: { bakery: ["restaurants", "Bakery"], pastry: ["restaurants", "Pastry shop"], deli: ["restaurants", "Deli"] },
  craft: { brewery: ["bars", "Brewery"], distillery: ["bars", "Distillery"], winery: ["bars", "Winery"] },
  tourism: {
    hotel: ["hotels", "Hotel"], hostel: ["hotels", "Hostel"], motel: ["hotels", "Motel"], guest_house: ["hotels", "Guest house"],
    apartment: ["hotels", "Apartment hotel"], chalet: ["hotels", "Chalet"],
    attraction: ["sights", "Attraction"], museum: ["sights", "Museum"], gallery: ["sights", "Gallery"], zoo: ["sights", "Zoo"],
    aquarium: ["sights", "Aquarium"], theme_park: ["sights", "Theme park"], viewpoint: ["sights", "Viewpoint"],
  },
  leisure: {
    stadium: ["sports", "Stadium"], ice_rink: ["sports", "Arena"], sports_centre: ["sports", "Sports centre"],
    track: ["sports", "Track"], park: ["sights", "Park"], garden: ["sights", "Garden"], nature_reserve: ["sights", "Nature reserve"],
  },
  historic: { "*": ["sights", "Historic site"] },
};

const ADDRESS_KEYS = new Set(["place", "highway", "building", "boundary"]);
const OSM_TYPES = { N: "node", W: "way", R: "relation" };

const titleCase = (s) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// Turn one Photon result into what the app needs. kind is "place" (rateable), "address" (can add a place there)
// or "other" (a shop or service we don't rate).
export function toResult(feature) {
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [];
  const rule = CLASSIFY[p.osm_key]?.[p.osm_value] || CLASSIFY[p.osm_key]?.["*"];
  const cuisine = p.extra?.cuisine ? titleCase(String(p.extra.cuisine).split(";")[0]) : null;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const city = p.city || p.town || p.village || p.county || p.state || null;
  const base = {
    osm_type: OSM_TYPES[p.osm_type] || null,
    osm_id: p.osm_id ?? null,
    name: p.name || street || null,
    address: [street, p.postcode].filter(Boolean).join(", ") || null,
    neighbourhood: p.district || p.locality || null,
    city,
    country: p.country || null,
    lat, lon,
  };
  if (rule) return { ...base, kind: "place", category: rule[0], type: cuisine && rule[0] === "restaurants" ? cuisine : rule[1] };
  if (ADDRESS_KEYS.has(p.osm_key) || p.type === "house" || p.type === "street") return { ...base, kind: "address", category: null, type: null };
  return { ...base, kind: "other", category: null, type: titleCase(p.osm_value || "Place") };
}

async function photon(params, signal) {
  const url = new URL(PHOTON_URL);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.append(k, v);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(res.status === 429 ? "The place search is busy. Wait a few seconds and try again." : "Place search failed (" + res.status + ").");
  return (await res.json()).features || [];
}

// How far from the chosen city search and the Community list reach
export const RADIUS_KM = 50;

// Straight-line distance in km between two points
export function distanceKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Box around a point that contains the whole circle of radiusKm
export function radiusBounds(center, radiusKm = RADIUS_KM) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLon: center.lon - dLon, maxLon: center.lon + dLon };
}

// Places and addresses within RADIUS_KM of the chosen city. Each result keeps its own town (a Pergola
// restaurant found while viewing Frontone is saved as Pergola) and carries its distance from the city.
export async function searchPlaces(q, { near, signal } = {}) {
  const b = near ? radiusBounds(near) : null;
  const features = await photon({
    q, limit: 15, lang: LANG,
    lat: near?.lat, lon: near?.lon, zoom: near ? 11 : null, location_bias_scale: near ? 0.2 : null,
    bbox: b ? [b.minLon, b.minLat, b.maxLon, b.maxLat].map((v) => v.toFixed(5)).join(",") : null,
  }, signal);
  const seen = new Set();
  return features.map(toResult).map((r) => ({ ...r, km: near && r.lat != null ? distanceKm(near, r) : null })).filter((r) => {
    const key = r.osm_type + r.osm_id;
    if (!r.name || seen.has(key)) return false;
    if (r.km != null && r.km > RADIUS_KM) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

// Cities, for the city picker. extent is [minLon, maxLat, maxLon, minLat].
export async function searchCities(q, { signal } = {}) {
  const features = await photon({ q, limit: 6, lang: LANG, layer: "city" }, signal);
  return features.map((f) => {
    const p = f.properties || {};
    const [lon, lat] = f.geometry?.coordinates || [];
    return { name: p.name, region: [p.state, p.country].filter(Boolean).join(", "), lat, lon, extent: p.extent || null };
  }).filter((c) => c.name && c.lat != null);
}

export const DEFAULT_CITY = { name: "Montreal", region: "Quebec, Canada", lat: 45.5019, lon: -73.5674, extent: [-73.98, 45.71, -73.47, 45.41] };
