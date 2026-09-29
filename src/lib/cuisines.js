// Cuisines in two levels: a family (Italian) and optional regions or styles (Marchigiano (Southern)).
// Keys are stable ids stored with ratings, so never rename a key; change the label instead.
// osm: OpenStreetMap "cuisine" values that map to this cuisine, used to pre-fill the picker.
// To add a region: add { key: "family/region", label: "Name" } to the family's list.

const r = (family, slug, label, osm = []) => ({ key: `${family}/${slug}`, label, osm });

export const CUISINES = [
  { key: "italian", label: "Italian", osm: ["italian", "pasta", "italian_pizza"], regions: [
    r("italian", "abruzzese", "Abruzzese"), r("italian", "calabrese", "Calabrese"), r("italian", "campano", "Campano / Napoletano"),
    r("italian", "emiliano", "Emiliano-Romagnolo"), r("italian", "friulano", "Friulano"), r("italian", "laziale", "Laziale / Romano"),
    r("italian", "ligure", "Ligure"), r("italian", "lombardo", "Lombardo"), r("italian", "lucano", "Lucano"),
    r("italian", "marchigiano-north", "Marchigiano (Northern)"), r("italian", "marchigiano-south", "Marchigiano (Southern)"),
    r("italian", "molisano", "Molisano"), r("italian", "piemontese", "Piemontese"), r("italian", "pugliese", "Pugliese"),
    r("italian", "sardo", "Sardo"), r("italian", "siciliano", "Siciliano"), r("italian", "toscano", "Toscano"),
    r("italian", "trentino", "Trentino-Altoatesino"), r("italian", "umbro", "Umbro"), r("italian", "valdostano", "Valdostano"),
    r("italian", "veneto", "Veneto"),
  ] },
  { key: "pizza", label: "Pizza", osm: ["pizza"], regions: [
    r("pizza", "neapolitan", "Neapolitan pizza"), r("pizza", "roman", "Roman pizza / al taglio"), r("pizza", "new-york", "New York–style pizza"),
    r("pizza", "detroit", "Detroit-style pizza"), r("pizza", "montreal", "Montreal-Greek pizza"),
  ] },
  { key: "french", label: "French", osm: ["french"], regions: [
    r("french", "bistro", "Bistro / brasserie"), r("french", "provencal", "Provençal"), r("french", "lyonnais", "Lyonnais"),
    r("french", "alsatian", "Alsatian"), r("french", "breton", "Breton / crêperie", ["crepe", "crêpe"]), r("french", "basque", "Basque (French)"),
    r("french", "fine-dining", "French fine dining"),
  ] },
  { key: "quebecois", label: "Québécois & Canadian", osm: ["regional", "canadian", "poutine", "quebecois"], regions: [
    r("quebecois", "quebecois", "Québécois", ["poutine"]), r("quebecois", "cabane", "Cabane à sucre"), r("quebecois", "acadian", "Acadian"),
    r("quebecois", "west-coast", "West Coast Canadian"),
  ] },
  { key: "spanish", label: "Spanish", osm: ["spanish", "tapas"], regions: [
    r("spanish", "tapas", "Tapas", ["tapas"]), r("spanish", "basque", "Basque / pintxos"), r("spanish", "catalan", "Catalan"),
    r("spanish", "andalusian", "Andalusian"), r("spanish", "galician", "Galician"),
  ] },
  { key: "portuguese", label: "Portuguese", osm: ["portuguese"], regions: [
    r("portuguese", "mainland", "Mainland Portuguese"), r("portuguese", "azorean", "Azorean"), r("portuguese", "churrasqueira", "Churrasqueira / grilled chicken"),
  ] },
  { key: "greek", label: "Greek", osm: ["greek"], regions: [r("greek", "taverna", "Greek taverna"), r("greek", "cretan", "Cretan"), r("greek", "souvlaki", "Souvlaki / gyros", ["souvlaki", "gyros"])] },
  { key: "middle-eastern", label: "Middle Eastern", osm: ["middle_eastern", "kebab", "shawarma", "falafel"], regions: [
    r("middle-eastern", "lebanese", "Lebanese", ["lebanese"]), r("middle-eastern", "syrian", "Syrian", ["syrian"]),
    r("middle-eastern", "turkish", "Turkish", ["turkish"]), r("middle-eastern", "persian", "Persian", ["persian", "iranian"]),
    r("middle-eastern", "israeli", "Israeli", ["israeli"]), r("middle-eastern", "armenian", "Armenian", ["armenian"]),
    r("middle-eastern", "palestinian", "Palestinian"), r("middle-eastern", "shawarma", "Shawarma & falafel", ["shawarma", "falafel", "kebab"]),
  ] },
  { key: "north-african", label: "North African", osm: ["moroccan", "tunisian", "algerian", "north_african"], regions: [
    r("north-african", "moroccan", "Moroccan", ["moroccan"]), r("north-african", "tunisian", "Tunisian", ["tunisian"]), r("north-african", "algerian", "Algerian", ["algerian"]),
  ] },
  { key: "african", label: "African", osm: ["african", "ethiopian", "eritrean", "senegalese", "nigerian"], regions: [
    r("african", "ethiopian", "Ethiopian / Eritrean", ["ethiopian", "eritrean"]), r("african", "west-african", "West African", ["senegalese", "nigerian", "ghanaian"]),
    r("african", "south-african", "South African"),
  ] },
  { key: "caribbean", label: "Caribbean", osm: ["caribbean", "haitian", "jamaican", "cuban"], regions: [
    r("caribbean", "haitian", "Haitian", ["haitian"]), r("caribbean", "jamaican", "Jamaican", ["jamaican"]), r("caribbean", "cuban", "Cuban", ["cuban"]),
    r("caribbean", "trinidadian", "Trinidadian"),
  ] },
  { key: "mexican", label: "Mexican", osm: ["mexican", "tacos", "burrito"], regions: [
    r("mexican", "oaxacan", "Oaxacan"), r("mexican", "yucatecan", "Yucatecan"), r("mexican", "tacos", "Tacos / street food", ["tacos"]),
    r("mexican", "tex-mex", "Tex-Mex", ["tex-mex", "tex_mex"]),
  ] },
  { key: "latin-american", label: "Latin American", osm: ["latin_american", "peruvian", "brazilian", "argentinian", "colombian", "venezuelan", "salvadoran"], regions: [
    r("latin-american", "peruvian", "Peruvian", ["peruvian"]), r("latin-american", "brazilian", "Brazilian", ["brazilian"]),
    r("latin-american", "argentinian", "Argentinian", ["argentinian"]), r("latin-american", "colombian", "Colombian", ["colombian"]),
    r("latin-american", "venezuelan", "Venezuelan", ["venezuelan"]), r("latin-american", "salvadoran", "Salvadoran / pupusas", ["salvadoran"]),
  ] },
  { key: "american", label: "American", osm: ["american", "burger", "diner"], regions: [
    r("american", "southern", "Southern"), r("american", "cajun", "Cajun & Creole", ["cajun", "creole"]), r("american", "new-england", "New England"),
    r("american", "diner", "Diner", ["diner"]), r("american", "burgers", "Burgers", ["burger"]), r("american", "wings", "Wings & fried chicken", ["chicken", "wings"]),
  ] },
  { key: "bbq", label: "BBQ", osm: ["bbq", "barbecue", "smokehouse"], regions: [
    r("bbq", "texas", "Texas BBQ"), r("bbq", "carolina", "Carolina BBQ"), r("bbq", "kansas-city", "Kansas City BBQ"), r("bbq", "memphis", "Memphis BBQ"),
    { key: "korean/bbq", label: "Korean BBQ", osm: [], also: ["bbq"] }, r("bbq", "churrasco", "Brazilian churrasco"), r("bbq", "asado", "Argentine asado"),
    r("bbq", "jerk", "Jamaican jerk"),
  ] },
  { key: "steakhouse", label: "Steakhouse", osm: ["steak_house", "steakhouse"], regions: [] },
  { key: "seafood", label: "Seafood", osm: ["seafood", "fish", "fish_and_chips", "oyster"], regions: [
    r("seafood", "oyster-bar", "Oyster bar", ["oyster"]), r("seafood", "fish-and-chips", "Fish & chips", ["fish_and_chips"]), r("seafood", "lobster", "Lobster shack"),
  ] },
  { key: "chinese", label: "Chinese", osm: ["chinese", "dim_sum", "hot_pot", "dumpling", "noodle"], regions: [
    r("chinese", "cantonese", "Cantonese", ["cantonese"]), r("chinese", "sichuan", "Sichuan", ["sichuan", "szechuan"]), r("chinese", "hunan", "Hunan"),
    r("chinese", "shanghainese", "Shanghainese"), r("chinese", "dongbei", "Dongbei"), r("chinese", "taiwanese", "Taiwanese", ["taiwanese"]),
    r("chinese", "dim-sum", "Dim sum", ["dim_sum"]), r("chinese", "hot-pot", "Hot pot", ["hot_pot"]), r("chinese", "dumplings", "Dumplings & noodles", ["dumpling", "noodle"]),
  ] },
  { key: "japanese", label: "Japanese", osm: ["japanese", "sushi", "ramen", "izakaya"], regions: [
    r("japanese", "sushi", "Sushi", ["sushi"]), r("japanese", "ramen", "Ramen", ["ramen"]), r("japanese", "izakaya", "Izakaya", ["izakaya"]),
    r("japanese", "omakase", "Omakase"), r("japanese", "yakitori", "Yakitori"),
  ] },
  { key: "korean", label: "Korean", osm: ["korean"], regions: [{ key: "korean/bbq", label: "Korean BBQ", osm: [], also: ["bbq"] }, r("korean", "fried-chicken", "Korean fried chicken"), r("korean", "home-style", "Home-style Korean")] },
  { key: "thai", label: "Thai", osm: ["thai"], regions: [r("thai", "isan", "Isan"), r("thai", "northern", "Northern Thai"), r("thai", "street", "Thai street food")] },
  { key: "vietnamese", label: "Vietnamese", osm: ["vietnamese", "pho"], regions: [r("vietnamese", "pho", "Pho", ["pho"]), r("vietnamese", "banh-mi", "Banh mi")] },
  { key: "southeast-asian", label: "Southeast Asian", osm: ["filipino", "malaysian", "indonesian", "singaporean", "cambodian", "laotian", "burmese"], regions: [
    r("southeast-asian", "filipino", "Filipino", ["filipino"]), r("southeast-asian", "malaysian", "Malaysian", ["malaysian"]),
    r("southeast-asian", "indonesian", "Indonesian", ["indonesian"]), r("southeast-asian", "singaporean", "Singaporean"),
    r("southeast-asian", "cambodian", "Cambodian"), r("southeast-asian", "laotian", "Laotian"), r("southeast-asian", "burmese", "Burmese"),
  ] },
  { key: "indian", label: "Indian", osm: ["indian", "curry"], regions: [
    r("indian", "north", "North Indian"), r("indian", "south", "South Indian"), r("indian", "punjabi", "Punjabi"), r("indian", "gujarati", "Gujarati"),
    r("indian", "bengali", "Bengali"), r("indian", "goan", "Goan"), r("indian", "hyderabadi", "Hyderabadi"),
  ] },
  { key: "south-asian", label: "Other South Asian", osm: ["pakistani", "sri_lankan", "nepalese", "afghan", "bangladeshi", "tibetan"], regions: [
    r("south-asian", "pakistani", "Pakistani", ["pakistani"]), r("south-asian", "sri-lankan", "Sri Lankan", ["sri_lankan"]),
    r("south-asian", "nepalese", "Nepalese / Tibetan", ["nepalese", "tibetan"]), r("south-asian", "afghan", "Afghan", ["afghan"]),
    r("south-asian", "bangladeshi", "Bangladeshi", ["bangladeshi"]),
  ] },
  { key: "european", label: "Central & Eastern European", osm: ["german", "austrian", "polish", "ukrainian", "hungarian", "russian", "georgian", "czech"], regions: [
    r("european", "german", "German / Austrian", ["german", "austrian"]), r("european", "polish", "Polish", ["polish"]), r("european", "ukrainian", "Ukrainian", ["ukrainian"]),
    r("european", "hungarian", "Hungarian", ["hungarian"]), r("european", "russian", "Russian", ["russian"]), r("european", "georgian", "Georgian", ["georgian"]),
  ] },
  { key: "british", label: "British & Irish", osm: ["british", "irish", "english"], regions: [r("british", "pub", "Pub food"), r("british", "tea", "Afternoon tea")] },
  { key: "deli", label: "Deli & sandwiches", osm: ["deli", "sandwich", "bagel", "smoked_meat"], regions: [
    r("deli", "smoked-meat", "Montreal smoked meat", ["smoked_meat"]), r("deli", "jewish", "Jewish deli"), r("deli", "bagels", "Bagels", ["bagel"]),
    r("deli", "sandwiches", "Sandwiches", ["sandwich"]),
  ] },
  { key: "brunch", label: "Brunch & café", osm: ["breakfast", "brunch", "coffee_shop", "cafe"], regions: [] },
  { key: "bakery", label: "Bakery & pastry", osm: ["bakery", "pastry", "cake"], regions: [r("bakery", "french", "French pâtisserie"), r("bakery", "italian", "Italian pasticceria"), r("bakery", "portuguese", "Portuguese bakery")] },
  { key: "desserts", label: "Desserts & ice cream", osm: ["dessert", "ice_cream", "gelato", "frozen_yogurt"], regions: [r("desserts", "gelato", "Gelato", ["gelato"]), r("desserts", "ice-cream", "Ice cream", ["ice_cream"])] },
  { key: "vegetarian", label: "Vegetarian & vegan", osm: ["vegetarian", "vegan"], regions: [r("vegetarian", "vegan", "Vegan", ["vegan"])] },
  { key: "healthy", label: "Healthy & bowls", osm: ["salad", "poke", "juice"], regions: [r("healthy", "poke", "Poke", ["poke"])] },
  { key: "fusion", label: "Fusion", osm: ["fusion", "asian"], regions: [] },
];

// Flat lookups
const BY_KEY = new Map();
for (const f of CUISINES) {
  BY_KEY.set(f.key, { key: f.key, label: f.label, family: f.key, familyLabel: f.label, families: [f.key] });
  for (const reg of f.regions) {
    if (!BY_KEY.has(reg.key)) {
      const family = reg.key.split("/")[0];
      BY_KEY.set(reg.key, { key: reg.key, label: reg.label, family, familyLabel: CUISINES.find((x) => x.key === family)?.label || f.label, families: [family, ...(reg.also || [])] });
    }
  }
}
export const cuisineInfo = (key) => BY_KEY.get(key) || null;
export const cuisineLabel = (key) => BY_KEY.get(key)?.label || key;
// Families a cuisine belongs to (Korean BBQ counts as both Korean and BBQ)
export const cuisineFamilies = (key) => BY_KEY.get(key)?.families || [(key || "").split("/")[0]];

// Every option for the picker: families first, then their regions
export const CUISINE_OPTIONS = CUISINES.flatMap((f) => [
  { key: f.key, label: f.label, group: f.label, isFamily: true },
  ...f.regions.map((reg) => ({ key: reg.key, label: reg.label, group: f.label, isFamily: false })),
]);

// Best guess from OpenStreetMap's cuisine value(s), e.g. "italian;pizza" -> italian
const OSM_MAP = new Map();
for (const f of CUISINES) {
  for (const reg of f.regions) for (const o of reg.osm || []) if (!OSM_MAP.has(o)) OSM_MAP.set(o, reg.key);
  for (const o of f.osm || []) if (!OSM_MAP.has(o)) OSM_MAP.set(o, f.key);
}
export function cuisineFromOsm(text) {
  if (!text) return null;
  for (const part of String(text).toLowerCase().split(/[;,]/)) {
    const k = part.trim().replace(/[\s-]+/g, "_");
    if (OSM_MAP.has(k)) return OSM_MAP.get(k);
  }
  return null;
}
