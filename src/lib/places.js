import { useState } from "react";
import { supabase } from "./supabase.js";
import { DEFAULT_CITY, RADIUS_KM, distanceKm, radiusBounds } from "./photon.js";

// The city you're exploring, remembered in this browser and shared by every page
const CITY_KEY = "bonvoyage-city";
function readCity() {
  try { return JSON.parse(localStorage.getItem(CITY_KEY)) || null; } catch { return null; }
}
export function useCity() {
  const [city, setCityState] = useState(readCity);
  const setCity = (c) => {
    setCityState(c);
    try { localStorage.setItem(CITY_KEY, JSON.stringify(c)); } catch { /* private window */ }
  };
  return [city, setCity];
}
export const cityOrDefault = (c) => c || DEFAULT_CITY;

// Occasions on the home page, mapped to each category's own "Good for" tag
export const OCCASIONS = [
  { key: "date", label: "Date night", map: { restaurants: "g:date", bars: "g:date", hotels: "g:couples", sports: "g:date", sights: "g:couples" } },
  { key: "friends", label: "Friends night out", map: { restaurants: "g:friends", bars: "g:friends", hotels: "g:groups", sports: "g:friends", sights: "g:friends" } },
  { key: "family", label: "Family", map: { restaurants: "g:family", hotels: "g:families", sports: "g:family", sights: "g:kids" } },
  { key: "business", label: "Business", map: { restaurants: "g:business", bars: "g:after-work", hotels: "g:business", sports: "g:clients" } },
  { key: "solo", label: "Solo", map: { restaurants: "g:solo", bars: "g:solo", hotels: "g:solo", sights: "g:solo" } },
];

// Places within RADIUS_KM of a city, with distance
export async function fetchAreaPlaces(city, category) {
  const b = radiusBounds(city);
  const { data, error } = await supabase.rpc("get_area_places", {
    p_min_lat: b.minLat, p_max_lat: b.maxLat, p_min_lon: b.minLon, p_max_lon: b.maxLon, p_category: category,
  });
  if (error) throw new Error(error.message);
  return (data || []).map((p) => ({ ...p, km: distanceKm(city, p) })).filter((p) => p.km <= RADIUS_KM);
}

// Photos for many places at once: Map(place id -> photos, newest first)
export async function fetchPhotos(ids) {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("place_photos").select("id, place_id, user_id, slot, path, width, height, created_at")
    .in("place_id", ids).order("created_at", { ascending: false }).limit(1500);
  const byPlace = new Map();
  for (const x of data || []) byPlace.set(x.place_id, [...(byPlace.get(x.place_id) || []), x]);
  return byPlace;
}

// Travelers-like-you predictions: Map(place id -> { predicted, neighbours, neighbour_avg })
export async function fetchMatches(ids, myCount) {
  if (!ids.length || myCount < 3) return new Map();
  const { data, error } = await supabase.rpc("get_taste_matches", { p_place_ids: ids });
  if (error) return new Map(); // matching is a bonus; the list still works without it
  return new Map((data || []).map((m) => [m.place_id, m]));
}

// Best photo to show on a card: the slot order in categories.js "cover"
export function coverPhoto(photos, order) {
  if (!photos?.length) return null;
  for (const slot of order) {
    const hit = photos.find((p) => p.slot === slot);
    if (hit) return hit;
  }
  return photos[0];
}

export const sameTown = (a, b) => (a || "").localeCompare(b || "", undefined, { sensitivity: "base" }) === 0;
