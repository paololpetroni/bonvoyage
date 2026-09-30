// "Best for you": turns community data, your taste profile, what your ratings have taught us, travelers like you
// and tonight's occasion into a personal score (1-5) plus the reasons behind it.

import { CATEGORIES, DIETARY_NEEDS, tagLabel } from "./categories.js";
import { cuisineFamilies, cuisineFromOsm, cuisineInfo, cuisineLabel } from "./cuisines.js";

const PRIOR = 5; // ratings a place needs before its own average outweighs the local average

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The average score of rated places in the list, used for places with few or no ratings
export function localMean(places) {
  const rated = places.filter((p) => p.n > 0);
  return rated.length ? rated.reduce((s, p) => s + Number(p.avg_overall), 0) / rated.length : 3.8;
}

// Cuisines people tagged (at least a quarter of raters), or OpenStreetMap's guess if nobody has yet
export function placeCuisines(p) {
  const n = p.n || 0;
  const tagged = Object.entries(p.tags || {})
    .filter(([k, c]) => k.startsWith("c:") && n > 0 && c / n >= 0.25 && cuisineInfo(k.slice(2)))
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k.slice(2));
  if (tagged.length) return tagged.slice(0, 2);
  const guess = cuisineFromOsm(p.type);
  return guess ? [guess] : [];
}

function cuisineScore(placeKeys, love, avoid) {
  let bonus = 0, penalty = 0, hit = null, miss = null, text = null;
  for (const pc of placeKeys) {
    const fams = cuisineFamilies(pc);
    for (const l of love) {
      let b = 0;
      if (l === pc) b = 0.45; // exact region or exact family
      else if (fams.includes(l)) b = 0.25; // you love Italian, this is Molisano
      else if (cuisineFamilies(l).includes(pc)) b = 0.12; // you love Molisano, this is just "Italian"
      if (b > bonus) {
        bonus = b;
        hit = l;
        // "You love BBQ" for a Texas BBQ place; "Italian · you love Molisano" when the place is only known as Italian
        text = b === 0.12 ? `${cuisineLabel(pc)} · you love ${cuisineLabel(l)}` : `You love ${cuisineLabel(l)}`;
      }
    }
    for (const a of avoid) {
      if (a === pc || fams.includes(a)) { penalty = 0.8; miss = a; } // name what YOU said you avoid
    }
  }
  return { delta: bonus - penalty, hit, miss, text };
}

export function scorePlace(p, { category, taste, weights, budget, occasion, mean, learned, match, myCount = 0 }) {
  const cat = CATEGORIES[category];
  const n = p.n || 0;
  const freq = (tag) => (n ? (p.tags?.[tag] || 0) / n : 0);
  const reasons = [];

  // 1. Community baseline: overall stars blended with detail scores weighted by what matters to you,
  //    pulled toward the local average until the place has enough ratings
  let base;
  if (n) {
    let cs = 0, cw = 0;
    for (const [k, , , , amenity] of cat.criteria) {
      const w = weights?.[k] ?? 0;
      if (!w) continue;
      const v = p.criteria?.[k];
      const lacks = amenity && v == null && (p.missing?.[k] || 0) > 0;
      if (v == null && !lacks) continue;
      cs += w * (lacks ? 1 : Number(v));
      cw += w;
    }
    const comm = cw ? 0.5 * Number(p.avg_overall) + 0.5 * (cs / cw) : Number(p.avg_overall);
    base = (n * comm + PRIOR * mean) / (n + PRIOR);
  } else {
    base = mean - 0.3; // unknown places start a little below the local average
  }
  let score = base;

  // 2. Cuisine you love or avoid (restaurants)
  if (category === "restaurants") {
    const cs = cuisineScore(placeCuisines(p), taste.cuisines.love, taste.cuisines.avoid);
    score += cs.delta;
    if (cs.hit) reasons.push({ kind: "good", text: cs.text });
    if (cs.miss) reasons.push({ kind: "weak", text: `${cuisineLabel(cs.miss)}, which you avoid` });

    // Cuisines your ratings suggest you love or avoid count for half, and only when you haven't said otherwise
    if (learned && !cs.hit && !cs.miss) {
      const stated = new Set([...taste.cuisines.love, ...taste.cuisines.avoid]);
      const lLove = learned.cuisines.love.filter((x) => !stated.has(x.key));
      const lAvoid = learned.cuisines.avoid.filter((x) => !stated.has(x.key));
      const ls = cuisineScore(placeCuisines(p), lLove.map((x) => x.key), lAvoid.map((x) => x.key));
      const source = ls.hit
        ? lLove.find((x) => x.key === ls.hit)
        : ls.miss ? lAvoid.find((x) => x.key === ls.miss) : null;
      score += 0.5 * (source?.strength ?? 0.5) * ls.delta;
      if (ls.hit) reasons.push({ kind: "good", text: `You rate ${cuisineLabel(ls.hit)} highly` });
      if (ls.miss) reasons.push({ kind: "weak", text: `You usually rate ${cuisineLabel(ls.miss)} lower` });
    }
  }

  // 3. Ambiance and style you usually like
  const likes = taste.likes?.[category] || [];
  if (likes.length && n) {
    const matched = likes.filter((t) => freq(t) >= 0.4);
    score += 0.35 * (likes.reduce((s, t) => s + freq(t), 0) / likes.length) + 0.1 * Math.min(matched.length, 2);
    if (matched.length) reasons.push({ kind: "good", text: matched.slice(0, 2).map((t) => tagLabel(category, t)).join(" · ") });
  }
  if (learned && n) {
    const lLikes = (learned.byCategory[category]?.likes || []).filter((x) => !likes.includes(x.tag));
    const hit = lLikes.filter((x) => freq(x.tag) >= 0.4);
    score += lLikes.reduce((s, x) => s + 0.25 * x.strength * freq(x.tag), 0);
    if (hit.length) reasons.push({ kind: "good", text: `You tend to love ${tagLabel(category, hit[0].tag).toLowerCase()} places` });
  }

  // 4. Tonight's occasion
  if (occasion) {
    const f = freq(occasion);
    if (n) {
      score += 0.7 * f - (n >= 3 && f === 0 ? 0.25 : 0);
      if (f >= 0.4) reasons.push({ kind: "good", text: `${tagLabel(category, occasion)} · ${Math.round(f * 100)}% say so` });
    }
  }

  // 5. Dietary needs (restaurants): confirmed by diners, or a warning
  if (category === "restaurants") {
    for (const need of taste.dietary || []) {
      const label = DIETARY_NEEDS.find(([k]) => k === need)?.[1] || need;
      const f = freq(`d:${need}`);
      // A missing tag doesn't prove there are no options, so confirmed places get a small lift instead of others being punished
      if (f > 0) { score += 0.15; reasons.push({ kind: "good", text: `${label} options confirmed` }); }
    }
  }

  // 6. Budget
  const spend = p.avg_spend != null ? Number(p.avg_spend) : null;
  const over = budget != null && spend != null && spend > budget;
  if (over) reasons.push({ kind: "budget", text: "Over your budget" });

  if (!n) reasons.push({ kind: "flag", text: "Not yet rated · scored from what we know" });
  else if (n < PRIOR) reasons.push({ kind: "flag", text: `Only ${n} rating${n > 1 ? "s" : ""} so far` });

  // 7. Travelers like you: the more you've rated, the more their scores count (up to 60%)
  if (match && match.neighbours >= 2) {
    const alpha = Math.min(0.6, (myCount / 15) * 0.6) * Math.min(1, match.neighbours / 4);
    score = alpha * Number(match.predicted) + (1 - alpha) * score;
    const avg = Number(match.neighbour_avg);
    reasons.push({ kind: avg >= 3.9 ? "good" : avg < 3.2 ? "weak" : "info", text: `${match.neighbours} travelers like you: ${(avg * 2).toFixed(1)}/10` });
  }

  // Ease scores into the top of the scale so great matches still stay in order instead of all hitting 10
  const eased = score > 4.3 ? 4.3 + 0.7 * Math.tanh((score - 4.3) / 0.7) : score;
  return { final: clamp(eased, 1, 5), base, over, reasons };
}

// Sort helpers for the Community list
export const SORTS = {
  you: (a, b) => (a.s.over - b.s.over) || (b.s.final - a.s.final),
  top: (a, b) => ((b.n > 0) - (a.n > 0)) || (b.s.base - a.s.base),
  most: (a, b) => (b.n - a.n) || (b.s.base - a.s.base),
  near: (a, b) => a.km - b.km,
};
