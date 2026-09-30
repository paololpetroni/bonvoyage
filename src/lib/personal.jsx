import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { useAuth } from "./auth.jsx";
import { CATEGORY_KEYS } from "./categories.js";
import { EMPTY_TASTE, normalizeTaste } from "./taste.js";
import { blendWeights, learnFromRatings } from "./learning.js";

// Everything about the signed-in person that shapes their recommendations, loaded once and shared:
// profile, taste, their own ratings, what those ratings teach us, and the weights to rank with.
const PersonalContext = createContext(null);

export function PersonalProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loaded: false, profile: null, ratings: [] });

  const reload = useCallback(async () => {
    if (!user) { setState({ loaded: true, profile: null, ratings: [] }); return; }
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("display_name, handle, home_city, taste, weights, budgets, learn_from_ratings").eq("id", user.id).single(),
      supabase.from("ratings").select("place_id, overall, criteria, tags, updated_at, places(category, name, type, city, lat, lon)").eq("user_id", user.id),
    ]);
    setState({
      loaded: true,
      profile: p.data || null,
      ratings: (r.data || []).map((x) => ({ ...x, category: x.places?.category })),
    });
  }, [user]);

  useEffect(() => { setState((s) => ({ ...s, loaded: false })); reload(); }, [reload]);

  const value = useMemo(() => {
    const base = state.profile ? normalizeTaste(state.profile) : EMPTY_TASTE;
    const learned = state.ratings.length ? learnFromRatings(state.ratings) : null;
    const useLearning = base.learn && learned;
    const rankWeights = Object.fromEntries(CATEGORY_KEYS.map((c) => [
      c, useLearning ? blendWeights(base.weights[c], learned.byCategory[c]?.weights, learned.byCategory[c]?.detailed || 0) : base.weights[c],
    ]));
    return {
      ...base,
      loaded: state.loaded,
      signedIn: Boolean(user),
      displayName: state.profile?.display_name || "",
      handle: state.profile?.handle || "",
      homeCityName: state.profile?.home_city || "",
      ratings: state.ratings,
      myCount: state.ratings.length,
      learned,
      rankLearned: useLearning ? learned : null,
      rankWeights,
      onboarded: Boolean(base.taste.onboarded),
      reload,
    };
  }, [state, user, reload]);

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

export const usePersonal = () => useContext(PersonalContext);
