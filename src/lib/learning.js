// Learns from your own ratings: which cuisines and kinds of places you rate above your usual score,
// and which Voyage-Meter details move your overall score. Recent ratings count more than old ones.
// Results are suggestions and a gentle nudge to the ranking; they never override what you set yourself
// and never touch dietary needs.

import { CATEGORIES, CATEGORY_KEYS } from "./categories.js";
import { cuisineFamilies, cuisineInfo } from "./cuisines.js";

const HALF_LIFE_DAYS = 365;
const MIN_TIMES = 2;       // a tag or cuisine needs at least this many of your ratings
const LIKE_GAP = 0.35;     // stars above your usual score to suggest "you like this"
const AVOID_GAP = -0.6;    // stars below your usual score to suggest "you avoid this"
const MIN_DETAILED = 5;    // ratings with Voyage-Meter scores before we learn what matters

const recency = (date) => {
  const days = date ? (Date.now() - new Date(date).getTime()) / 86400000 : 0;
  return Math.pow(0.5, Math.max(0, days) / HALF_LIFE_DAYS);
};

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// Weighted average gap between your score for places with a feature and your usual score
function gaps(rows, featuresOf) {
  const acc = new Map();
  for (const r of rows) {
    for (const f of featuresOf(r)) {
      const a = acc.get(f) || { sum: 0, w: 0, n: 0 };
      a.sum += r.w * r.gap; a.w += r.w; a.n += 1;
      acc.set(f, a);
    }
  }
  return [...acc.entries()].map(([key, a]) => ({ key, gap: a.sum / a.w, n: a.n }));
}

// ratings: [{ overall, criteria, tags, updated_at, category }]
export function learnFromRatings(ratings) {
  const out = { total: ratings.length, byCategory: {}, cuisines: { love: [], avoid: [] } };

  for (const cat of CATEGORY_KEYS) {
    const list = ratings.filter((r) => r.category === cat).map((r) => ({ ...r, overall: Number(r.overall), w: recency(r.updated_at) }));
    const entry = { count: list.length, likes: [], weights: null, detailed: 0 };
    out.byCategory[cat] = entry;
    if (list.length < MIN_TIMES) continue;

    const wSum = list.reduce((s, r) => s + r.w, 0);
    const usual = list.reduce((s, r) => s + r.w * r.overall, 0) / wSum;
    for (const r of list) r.gap = r.overall - usual;

    // Ambiance, drinks, style and type you rate above your usual (not occasions or dietary tags)
    const likeable = new Set(CATEGORIES[cat].tagGroups.filter((g) => !g.occasion && g.key !== "dietary").map((g) => g.prefix));
    entry.likes = gaps(list, (r) => (r.tags || []).filter((t) => likeable.has(t.split(":")[0])))
      .filter((x) => x.n >= MIN_TIMES && x.gap >= LIKE_GAP)
      .sort((a, b) => b.gap - a.gap)
      .map((x) => ({ tag: x.key, gap: x.gap, n: x.n, strength: Math.min(1, (x.gap / 1.2) * Math.min(1, x.n / 4)) }));

    // Cuisines: each region counts for itself and for its family (Molisano also counts toward Italian)
    if (cat === "restaurants") {
      const cuisineKeys = (r) => {
        const keys = new Set();
        for (const t of r.tags || []) {
          if (!t.startsWith("c:")) continue;
          const k = t.slice(2);
          if (!cuisineInfo(k)) continue;
          keys.add(k);
          for (const f of cuisineFamilies(k)) keys.add(f);
        }
        return [...keys];
      };
      const all = gaps(list, cuisineKeys).filter((x) => x.n >= MIN_TIMES);
      const strength = (x) => Math.min(1, (Math.abs(x.gap) / 1.2) * Math.min(1, x.n / 4));
      out.cuisines.love = all.filter((x) => x.gap >= LIKE_GAP).sort((a, b) => b.gap - a.gap).map((x) => ({ ...x, strength: strength(x) }));
      out.cuisines.avoid = all.filter((x) => x.gap <= AVOID_GAP).sort((a, b) => a.gap - b.gap).map((x) => ({ ...x, strength: strength(x) }));
    }

    // What matters: how closely each Voyage-Meter detail tracks your overall score
    const detailed = list.filter((r) => r.criteria && Object.values(r.criteria).some((v) => typeof v === "number"));
    entry.detailed = detailed.length;
    if (detailed.length >= MIN_DETAILED) {
      const w = {};
      for (const [k] of CATEGORIES[cat].criteria) {
        const pairs = detailed.filter((r) => typeof r.criteria[k] === "number");
        const c = pairs.length >= MIN_DETAILED ? pearson(pairs.map((r) => r.criteria[k]), pairs.map((r) => r.overall)) : null;
        w[k] = c == null ? null : Math.max(0, c);
      }
      if (Object.values(w).some((v) => v != null)) entry.weights = w;
    }
  }
  return out;
}

// Your sliders, nudged by what your ratings show matters. Your own setting always keeps at least half the say.
export function blendWeights(stated, learned, detailedCount) {
  if (!learned) return stated;
  const share = Math.min(0.5, detailedCount / 20);
  const keys = Object.keys(stated);
  const sTot = keys.reduce((s, k) => s + (stated[k] || 0), 0) || 1;
  const lVals = keys.map((k) => learned[k]).filter((v) => v != null);
  const lTot = lVals.reduce((a, b) => a + b, 0);
  if (!lTot) return stated;
  const out = {};
  for (const k of keys) {
    const s = (stated[k] || 0) / sTot;
    const l = learned[k] == null ? s : learned[k] / lTot;
    out[k] = 10 * ((1 - share) * s + share * l);
  }
  return out;
}

// Suggestions to show on the profile, skipping anything already set or dismissed
export function suggestionsFor(learned, taste) {
  if (!learned) return [];
  const dismissed = new Set(taste.dismissed || []);
  const out = [];
  for (const x of learned.cuisines.love) {
    const id = `love:${x.key}`;
    if (dismissed.has(id) || taste.cuisines.love.includes(x.key) || taste.cuisines.avoid.includes(x.key)) continue;
    // Suggest a whole family (Italian) only if it's backed by more than the regions you already love (Pugliese)
    if (!x.key.includes("/")) {
      const fromLoved = learned.cuisines.love
        .filter((y) => y.key.startsWith(x.key + "/") && taste.cuisines.love.includes(y.key))
        .reduce((s, y) => s + y.n, 0);
      if (x.n <= fromLoved) continue;
    }
    out.push({ id, kind: "love", key: x.key, gap: x.gap, n: x.n });
  }
  for (const x of learned.cuisines.avoid) {
    const id = `avoid:${x.key}`;
    if (dismissed.has(id) || taste.cuisines.avoid.includes(x.key) || taste.cuisines.love.includes(x.key)) continue;
    out.push({ id, kind: "avoid", key: x.key, gap: x.gap, n: x.n });
  }
  for (const cat of CATEGORY_KEYS) {
    for (const x of learned.byCategory[cat]?.likes || []) {
      const id = `like:${cat}:${x.tag}`;
      if (dismissed.has(id) || (taste.likes[cat] || []).includes(x.tag)) continue;
      out.push({ id, kind: "like", category: cat, key: x.tag, gap: x.gap, n: x.n });
    }
  }
  return out.slice(0, 8);
}
