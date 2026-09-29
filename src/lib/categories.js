// Categories and their rating scales. Same scales as the Community prototype (prototypes/community.html),
// kept here so the rating form (Phase 3) and recommendations (Phase 4) share one source of truth.
// Criterion: [key, label, default importance 0-10, hint, isOptionalAmenity]
// tagGroups: what raters tick. Stored on ratings as "<prefix>:<option>", e.g. "a:cozy", "g:date".
//   The group marked occasion: true feeds the "What's the occasion?" picker.
// Restaurants also carry cuisines ("c:italian/molisano"), see cuisines.js.
// photos: labelled photo slots, one photo per slot per person. Keep in sync with supabase/004_photos.sql

export const CATEGORIES = {
  restaurants: {
    photos: [["app", "Appetizer"], ["main", "Main"], ["dessert", "Dessert"], ["vibe", "Vibe"]],
    one: "Restaurant",
    label: "Restaurants",
    unit: "per person",
    tagGroups: [
      { key: "ambiance", prefix: "a", label: "Ambiance", options: [["cozy", "Cozy"], ["lively", "Lively"], ["upscale", "Upscale"], ["casual", "Casual"], ["romantic", "Romantic"], ["quiet", "Quiet"], ["patio", "Patio / terrace"], ["view", "Great view"]] },
      { key: "goodfor", prefix: "g", label: "Good for", occasion: true, options: [["date", "Date night"], ["friends", "Friends night out"], ["family", "Family"], ["business", "Business meal"], ["solo", "Solo"], ["groups", "Big groups"]] },
      { key: "dietary", prefix: "d", label: "Dietary options", options: [["vegetarian", "Vegetarian options"], ["vegan", "Vegan options"], ["gluten-free", "Gluten-free options"], ["halal", "Halal"], ["kosher", "Kosher"]] },
    ],
    criteria: [
      ["food", "Food quality", 10, "Taste, execution, freshness"],
      ["value", "Value for money", 7, "Portions and quality for the price"],
      ["local", "Local character", 6, "Authentic to the city or cuisine"],
      ["service", "Service", 6, "Attentive, knowledgeable, friendly"],
      ["atmos", "Atmosphere", 5, "Decor, lighting, energy"],
      ["clean", "Cleanliness", 5, "Dining room and washrooms"],
      ["wait", "Wait & reservations", 3, "Ease of getting a table"],
      ["diet", "Dietary options", 3, "Vegetarian, gluten-free, allergies"],
    ],
  },
  bars: {
    photos: [["drinks", "Drinks"], ["vibe", "Vibe"]],
    one: "Bar",
    label: "Bars & breweries",
    unit: "per evening",
    tagGroups: [
      { key: "knownfor", prefix: "k", label: "Known for", options: [["cocktails", "Cocktails"], ["craft-beer", "Craft beer"], ["wine", "Wine"], ["spirits", "Whisky & spirits"], ["zero-proof", "Non-alcoholic options"]] },
      { key: "ambiance", prefix: "a", label: "Ambiance", options: [["cozy", "Cozy"], ["lively", "Lively"], ["upscale", "Upscale"], ["dive", "Dive bar"], ["live-music", "Live music"], ["dancing", "Dancing"], ["patio", "Patio / terrace"], ["sports-tv", "Sports on TV"]] },
      { key: "goodfor", prefix: "g", label: "Good for", occasion: true, options: [["date", "Date night"], ["friends", "Friends night out"], ["after-work", "After work"], ["groups", "Big groups"], ["solo", "Solo"]] },
    ],
    criteria: [
      ["drinks", "Drink quality", 9, "Beer, cocktails, wine done well"],
      ["vibe", "Atmosphere & vibe", 8, "Energy, music, look and feel"],
      ["selection", "Selection", 7, "Range of taps, spirits, house specials"],
      ["service", "Service speed", 6, "How fast you get a drink when busy"],
      ["value", "Value for money", 6, "Price per drink for the quality"],
      ["talk", "Can you talk?", 4, "Noise level for conversation"],
      ["food", "Food", 3, "Bar snacks or kitchen quality"],
      ["crowd", "Crowd fit", 3, "Welcoming to visitors and groups"],
    ],
  },
  hotels: {
    photos: [["room", "Room"], ["bathroom", "Bathroom"], ["view", "View"], ["common", "Common areas"]],
    one: "Hotel",
    label: "Hotels",
    unit: "per night",
    tagGroups: [
      { key: "style", prefix: "s", label: "Style", options: [["boutique", "Boutique"], ["luxury", "Luxury"], ["business", "Business"], ["budget", "Budget"], ["resort", "Resort"], ["bnb", "B&B / hostel"]] },
      { key: "ambiance", prefix: "a", label: "Ambiance", options: [["quiet", "Quiet"], ["social", "Social"], ["design", "Design-forward"], ["historic", "Historic"]] },
      { key: "goodfor", prefix: "g", label: "Good for", occasion: true, options: [["couples", "Couples"], ["families", "Families"], ["business", "Business trips"], ["solo", "Solo"], ["groups", "Groups"]] },
    ],
    criteria: [
      ["comfort", "Room comfort & bed", 9, "Mattress, pillows, room size"],
      ["clean", "Cleanliness", 8, "Room, bathroom, common areas"],
      ["noise", "Noise insulation", 7, "Street, hallway and neighbour noise"],
      ["service", "Customer service", 7, "Front desk, housekeeping, problem solving"],
      ["sights", "Proximity to sights", 6, "Walkable to what you came to see"],
      ["transit", "Proximity to transit", 5, "Subway, train, airport access"],
      ["breakfast", "Breakfast quality", 5, "Free or paid, judged on quality", true],
      ["value", "Value for money", 5, "Worth what you paid"],
      ["wifi", "Wi-Fi & workspace", 2, "Speed, a desk you can work at"],
      ["pool", "Pool", 2, "Cleanliness, hours, size", true],
      ["gym", "Gym", 2, "Equipment and hours", true],
    ],
  },
  sports: {
    photos: [["seat", "View from your seat"], ["atmos", "Atmosphere"], ["food", "Food & drink"]],
    one: "Sports venue",
    label: "Sports events",
    unit: "per ticket",
    tagGroups: [
      { key: "ambiance", prefix: "a", label: "Ambiance", options: [["rowdy", "Rowdy"], ["family-friendly", "Family-friendly"], ["premium", "Premium"], ["local", "Local & niche"], ["outdoors", "Outdoors"]] },
      { key: "goodfor", prefix: "g", label: "Good for", occasion: true, options: [["friends", "Friends"], ["family", "Family"], ["date", "Date"], ["clients", "Hosting clients"]] },
    ],
    criteria: [
      ["sight", "Sightlines", 9, "How well you see the play from typical seats"],
      ["atmos", "Crowd atmosphere", 9, "Energy, chants, game-day feel"],
      ["value", "Ticket value", 6, "Experience for the ticket price"],
      ["transit", "Getting there", 5, "Transit, parking, getting home"],
      ["conc", "Food & drink", 4, "Concession quality and prices"],
      ["entry", "Entry & lines", 3, "Security, gates, washroom lines"],
      ["fac", "Facilities", 3, "Washrooms, concourses, accessibility"],
      ["seats", "Seat comfort", 2, "Legroom, backs, shade"],
    ],
  },
  sights: {
    photos: [["highlight", "Highlight"], ["view", "View"], ["crowds", "Crowds"]],
    one: "Sight",
    label: "Tourist attractions",
    unit: "per person",
    tagGroups: [
      { key: "type", prefix: "t", label: "Type", options: [["history", "History"], ["art", "Art"], ["nature", "Nature"], ["science", "Science"], ["food", "Food"], ["adventure", "Adventure"], ["views", "Views"]] },
      { key: "goodfor", prefix: "g", label: "Good for", occasion: true, options: [["kids", "Kids"], ["couples", "Couples"], ["friends", "Friends"], ["solo", "Solo"], ["rainy-day", "Rainy day"]] },
    ],
    criteria: [
      ["exp", "The experience itself", 10, "Did it live up to the hype?"],
      ["time", "Time well spent", 6, "Worth the hours it takes"],
      ["value", "Value for money", 6, "Entry price for what you get"],
      ["crowds", "Crowds & wait", 5, "Lines, crowding, booking ahead"],
      ["guide", "Guides & information", 4, "Staff, signage, audio guide"],
      ["transit", "Proximity to transit", 4, "Easy to reach without a car"],
      ["access", "Accessibility", 4, "Strollers, wheelchairs, stairs"],
      ["kids", "Group & kid friendly", 3, "Works for mixed groups"],
      ["fac", "Facilities", 2, "Washrooms, café, lockers"],
    ],
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Every tag for a category as [fullKey, label, group], e.g. ["a:cozy", "Cozy", group]
export const allTags = (category) =>
  CATEGORIES[category].tagGroups.flatMap((g) => g.options.map(([k, label]) => [`${g.prefix}:${k}`, label, g]));

export const tagLabel = (category, fullKey) => allTags(category).find(([k]) => k === fullKey)?.[1] || fullKey;

export const occasionGroup = (category) => CATEGORIES[category].tagGroups.find((g) => g.occasion);

// Dietary needs a person can set on their profile, matched to restaurants' "d:" tags
export const DIETARY_NEEDS = [["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["gluten-free", "Gluten-free"], ["halal", "Halal"], ["kosher", "Kosher"]];
