import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { CATEGORIES, CATEGORY_KEYS } from "./categories.js";

// Budget slider ranges per category (the top of the range means "any budget")
export const BUDGET_MAX = { restaurants: 200, bars: 150, hotels: 800, sports: 400, sights: 150 };

export const defaultWeights = (category) => Object.fromEntries(CATEGORIES[category].criteria.map(([k, , w]) => [k, w]));

// Fill in anything missing so the rest of the app can rely on the shape
export function normalizeTaste(profile) {
  const t = profile?.taste || {};
  const taste = {
    cuisines: { love: t.cuisines?.love || [], avoid: t.cuisines?.avoid || [] },
    likes: Object.fromEntries(CATEGORY_KEYS.map((c) => [c, t.likes?.[c] || []])),
    dietary: t.dietary || [],
  };
  const weights = Object.fromEntries(CATEGORY_KEYS.map((c) => [c, { ...defaultWeights(c), ...(profile?.weights?.[c] || {}) }]));
  const budgets = Object.fromEntries(CATEGORY_KEYS.map((c) => [c, profile?.budgets?.[c] ?? null]));
  return { taste, weights, budgets, learn: profile?.learn_from_ratings ?? true };
}

export const EMPTY_TASTE = normalizeTaste(null);

// Loads the signed-in person's taste profile; signed-out visitors get the neutral defaults
export function useTasteProfile(user) {
  const [state, setState] = useState({ loaded: !user, ...EMPTY_TASTE });
  useEffect(() => {
    if (!user) { setState({ loaded: true, ...EMPTY_TASTE }); return; }
    let cancelled = false;
    supabase.from("profiles").select("taste, weights, budgets, learn_from_ratings").eq("id", user.id).single().then(({ data }) => {
      if (!cancelled) setState({ loaded: true, ...normalizeTaste(data) });
    });
    return () => { cancelled = true; };
  }, [user]);
  return state;
}
