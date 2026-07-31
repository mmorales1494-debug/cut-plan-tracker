// Static plan data: meal items, exercises, weekly schedule, targets.
// No personal identifiers here by design — this file is served publicly.

// Anchor date for the "Day N" counter — an ongoing lifestyle app, no fixed end date.
const PLAN_START = "2026-07-17";

const DEFAULT_TARGETS = {
  calRest: 1900,
  calTrain: 2100,
  protein: 170,
  fat: 62,
  carbs: 190,
  fiber: 30,
  waterBottlesMin: 2,
  waterBottlesMax: 2,
};

const BOTTLE_OZ = 32;

// Goal-based calorie targeting (Mifflin-St Jeor BMR + a sedentary base activity multiplier;
// workouts and steps add their own bonus on top so more active days earn more calories,
// similar in spirit to MyFitnessPal's adaptive daily goal).
const KCAL_PER_LB = 3500; // standard approximation for 1 lb of body fat
const GOAL_ACTIVITY_MULTIPLIER = 1.2; // sedentary baseline — exercise/steps bonuses cover the rest

// MET (Metabolic Equivalent of Task) values — the standard exercise-science unit for
// activity energy cost (kcal/min = MET x 3.5 x bodyweight-kg / 200), same approach used
// under the hood by Apple Watch/Fitbit/MyFitnessPal. Values are 2011 Compendium of
// Physical Activities ballparks for "vigorous effort," not literal weight-moved.
const RESISTANCE_MET = 6.0; // resistance training, vigorous effort
const BOULDER_MET = 6.5; // bouldering session-average MET — high per-attempt intensity
// tempered by the rest between attempts (unlike sustained roped climbing)
const WALK_MET = 3.0; // casual walking pace, for the steps bonus
const STEPS_PER_MINUTE_WALKING = 100; // average cadence, to convert steps to minutes for the MET formula
const MINUTES_PER_SET_ESTIMATE = 3; // typical work+rest time per logged resistance set

// Quick-log grade buttons for the bouldering climb log — V7+ catches anything harder.
const CLIMBING_GRADES = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7+"];

// Minimum days since the last finger-intensive session (bouldering or hangboard) before
// suggesting extra pulling work on a resistance/run day — avoids stacking finger load.
// e.g. climb Monday: Tuesday (1 day since) stays quiet, Wednesday (2 days since) shows it.
const FINGER_RECOVERY_DAYS = 2;
// When a goal is set, protein/fat scale with bodyweight (standard cut guidance) and
// carbs fill whatever calories are left, instead of staying at fixed manual grams.
const PROTEIN_PER_LB_GOAL = 0.8;
const FAT_PER_LB_GOAL = 0.35;

// Bump suggested water target on bouldering days (long, high-sweat sessions).
function waterTargetFor(activity) {
  if (activity === "boulder") return { min: 3, max: 3 };
  return { min: DEFAULT_TARGETS.waterBottlesMin, max: DEFAULT_TARGETS.waterBottlesMax };
}

// Resistance training rep/set targets (progressive overload lever each week).
const REP_TARGET = { min: 8, max: 12 };
const SET_TARGET = { min: 3, max: 4 };
const WEIGHT_STEP_KG = 2.5;
const DEFAULT_REST_SECONDS = 120;
const CORE_REST_SECONDS = 45;
const KG_TO_LB = 2.20462;
const ML_PER_OZ = 29.5735;

// Standard barbell + plate assumptions for the plate-loading calculator.
const BAR_WEIGHT = { kg: 20, lb: 45 };
const PLATE_DENOMS = {
  kg: [20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

// Greedy plate breakdown for one side of the bar. Returns null if the target is
// lighter than an empty bar (nothing to load).
function plateBreakdown(totalWeight, unit) {
  const bar = BAR_WEIGHT[unit];
  let perSide = (totalWeight - bar) / 2;
  if (perSide <= 0) return null;
  const plates = [];
  for (const denom of PLATE_DENOMS[unit]) {
    while (perSide >= denom - 0.05) {
      plates.push(denom);
      perSide -= denom;
    }
  }
  return { plates, bar };
}

// Core work targets — spec just says "10-15 min, progressive," so these are reasonable
// bodyweight/ab-work defaults: higher rep range than resistance work, same set count.
const CORE_REP_TARGET = { min: 12, max: 20 };
const CORE_DURATION_TARGET = { min: 30, max: 60 }; // seconds, for planks

// Daily checklist seed items. recurring:true resets fresh every day (meds/supplements);
// one-time items (added in-app) carry over unfinished and vanish for good once checked off.
const SUPPLEMENTS = [
  { id: "creatine", label: "Creatine (5g)", recurring: true },
  { id: "zyrtec", label: "Zyrtec", recurring: true },
];

// Daily step target — not in the original spec, added as general NEAT support for a cut.
// 8-10k/day is the standard range for boosting non-exercise activity without adding the
// recovery cost of more structured cardio, on top of the existing run/boulder/resistance days.
const STEP_TARGET = { min: 8000, max: 10000 };

// Status colors for the Nutrition macro rings on the Today tab — green/amber/red
// based on progress toward target rather than a fixed per-macro hue.
const MACRO_STATUS_COLORS = { good: "#3ecf8e", warn: "#e0a940", over: "#e0605a" };

// Item catalog: per-unit calories/protein/fat/carbs/fiber. Meal totals recompute live from qty * unit values.
const ITEM_CATALOG = {
  egg:               { label: "Egg (hard-cooked)",      cal: 70,  protein: 6,  fat: 5,   carbs: 0.5, fiber: 0 },
  rice_scoop:        { label: "Rice (scoop)",            cal: 220, protein: 4,  fat: 0,   carbs: 45,  fiber: 0.6 },
  watermelon_juice:  { label: "Watermelon juice",        cal: 120, protein: 1,  fat: 0,   carbs: 30,  fiber: 0 },
  fruit:             { label: "Fruit (piece)",           cal: 90,  protein: 1,  fat: 0,   carbs: 23,  fiber: 3 },
  espresso:          { label: "Espresso",                cal: 5,   protein: 1,  fat: 0,   carbs: 1,   fiber: 0 },
  whey_scoop:        { label: "Whey protein (scoop)",    cal: 120, protein: 24, fat: 2,   carbs: 3,   fiber: 0 },
  pb2_scoop:         { label: "PB2 powder (scoop)",      cal: 60,  protein: 6,  fat: 1.5, carbs: 5,   fiber: 2 },
  redbull_sf:        { label: "Sugar-free energy drink", cal: 10,  protein: 0,  fat: 0,   carbs: 2,   fiber: 0 },
  greens:            { label: "Greens",                  cal: 20,  protein: 2,  fat: 0,   carbs: 3,   fiber: 1 },
  tuna_spicy_scoop:  { label: "Spicy tuna (scoop)",       cal: 60,  protein: 5,  fat: 4,   carbs: 1,   fiber: 0 },
  tuna_raw_scoop:    { label: "Raw tuna (scoop)",         cal: 40,  protein: 10, fat: 0.5, carbs: 0,   fiber: 0 },
  boiled_egg:        { label: "Boiled egg (store)",       cal: 70,  protein: 6,  fat: 5,   carbs: 0.5, fiber: 0 },
  tofu_pack:         { label: "Tofu pack (store)",        cal: 80,  protein: 8,  fat: 4,   carbs: 2,   fiber: 1 },
  added_fat:         { label: "Added oil/sauce/dressing", cal: 90,  protein: 0,  fat: 10,  carbs: 2,   fiber: 0 },
  chicken_breast:    { label: "Chicken breast (cooked)",  cal: 165, protein: 31, fat: 3.6, carbs: 0,   fiber: 0 },
  greek_yogurt:      { label: "Greek yogurt (nonfat cup)", cal: 100, protein: 18, fat: 0,  carbs: 6,   fiber: 0 },
  oatmeal:           { label: "Oatmeal (1/2 cup dry)",    cal: 150, protein: 5,  fat: 3,   carbs: 27,  fiber: 4 },
  banana:            { label: "Banana",                   cal: 105, protein: 1.3, fat: 0.4, carbs: 27, fiber: 3 },
  almonds:           { label: "Almonds (1oz)",             cal: 164, protein: 6,  fat: 14,  carbs: 6,   fiber: 3.5 },
  peanut_butter:     { label: "Peanut butter (1 tbsp)",    cal: 95,  protein: 4,  fat: 8,   carbs: 3,   fiber: 1 },
  milk_2pct:         { label: "Milk, 2% (1 cup)",          cal: 122, protein: 8,  fat: 5,   carbs: 12,  fiber: 0 },
  white_bread:       { label: "White bread (1 slice)",     cal: 75,  protein: 2.5, fat: 1,  carbs: 13,  fiber: 0.6 },
  sweet_potato:      { label: "Sweet potato (medium)",     cal: 100, protein: 2,  fat: 0,   carbs: 24,  fiber: 4 },
  avocado_half:      { label: "Avocado (half)",            cal: 120, protein: 1.5, fat: 11, carbs: 6,   fiber: 5 },

  // --- Meats, poultry, fish ---
  chicken_thigh:     { label: "Chicken thigh (cooked)",       cal: 209, protein: 26,  fat: 11,  carbs: 0,    fiber: 0 },
  turkey_breast:     { label: "Turkey breast (cooked)",       cal: 135, protein: 30,  fat: 1,   carbs: 0,    fiber: 0 },
  ground_beef_80:    { label: "Ground beef 80/20 (cooked)",   cal: 254, protein: 25,  fat: 17,  carbs: 0,    fiber: 0 },
  ground_beef_93:    { label: "Ground beef 93/7 (cooked)",    cal: 173, protein: 25,  fat: 7,   carbs: 0,    fiber: 0 },
  pork_chop:         { label: "Pork chop (cooked)",           cal: 231, protein: 25,  fat: 14,  carbs: 0,    fiber: 0 },
  bacon_slice:       { label: "Bacon (1 slice)",              cal: 43,  protein: 3,   fat: 3.3, carbs: 0.1,  fiber: 0 },
  bacon_turkey:      { label: "Turkey bacon (1 slice)",       cal: 30,  protein: 2.5, fat: 2.3, carbs: 0.1,  fiber: 0 },
  salmon:            { label: "Salmon (cooked)",              cal: 208, protein: 22,  fat: 13,  carbs: 0,    fiber: 0 },
  shrimp:            { label: "Shrimp (cooked)",              cal: 99,  protein: 24,  fat: 0.3, carbs: 0.2,  fiber: 0 },
  tilapia:           { label: "Tilapia (cooked)",             cal: 128, protein: 26,  fat: 2.7, carbs: 0,    fiber: 0 },
  cod:               { label: "Cod (cooked)",                 cal: 105, protein: 23,  fat: 0.9, carbs: 0,    fiber: 0 },
  canned_tuna_water: { label: "Canned tuna in water (drained)", cal: 99, protein: 22, fat: 0.7, carbs: 0,    fiber: 0 },
  clams:             { label: "Clams, cooked (3 oz)",         cal: 126, protein: 22,  fat: 1.7, carbs: 4.4,  fiber: 0 },
  crab:              { label: "Crab meat, cooked (3 oz)",     cal: 87,  protein: 17,  fat: 1.5, carbs: 0,    fiber: 0 },
  lobster:           { label: "Lobster, cooked (3 oz)",       cal: 76,  protein: 16,  fat: 0.8, carbs: 0,    fiber: 0 },
  scallops:          { label: "Scallops, cooked (3 oz)",      cal: 94,  protein: 17.4,fat: 0.8, carbs: 4.5,  fiber: 0 },
  duck_breast:       { label: "Duck breast, cooked (3 oz)",   cal: 171, protein: 19,  fat: 9.5, carbs: 0,    fiber: 0 },
  lamb_chop:         { label: "Lamb chop, cooked (3 oz)",     cal: 250, protein: 21,  fat: 18,  carbs: 0,    fiber: 0 },
  venison:           { label: "Venison, cooked (3 oz)",       cal: 134, protein: 26,  fat: 2.7, carbs: 0,    fiber: 0 },
  beef_jerky:        { label: "Beef jerky (1 oz)",            cal: 116, protein: 9.4, fat: 7.3, carbs: 3.1,  fiber: 0.5 },
  deli_turkey:       { label: "Deli turkey (2 oz)",           cal: 60,  protein: 10,  fat: 1,   carbs: 2,    fiber: 0 },
  deli_ham:          { label: "Deli ham (2 oz)",              cal: 60,  protein: 10,  fat: 2,   carbs: 1,    fiber: 0 },
  deli_roast_beef:   { label: "Deli roast beef (2 oz)",       cal: 70,  protein: 12,  fat: 2,   carbs: 1,    fiber: 0 },
  bologna:           { label: "Bologna (1 slice)",            cal: 87,  protein: 3.3, fat: 8,   carbs: 0.6,  fiber: 0 },
  salami:            { label: "Salami (1 oz)",                cal: 100, protein: 6,   fat: 8.5, carbs: 0.5,  fiber: 0 },
  hot_dog:           { label: "Hot dog (beef)",               cal: 150, protein: 5,   fat: 13,  carbs: 2,    fiber: 0 },
  sausage_link:      { label: "Sausage link (pork)",          cal: 92,  protein: 5,   fat: 8,   carbs: 0.6,  fiber: 0 },
  sausage_patty:     { label: "Sausage patty (breakfast)",    cal: 100, protein: 5,   fat: 8.5, carbs: 0.6,  fiber: 0 },

  // --- Plant proteins ---
  tofu_firm:         { label: "Tofu, firm (1/2 cup)",         cal: 94,  protein: 10,  fat: 6,   carbs: 2,    fiber: 1 },
  tempeh:            { label: "Tempeh (1/2 cup)",             cal: 160, protein: 15,  fat: 9,   carbs: 8,    fiber: 5 },
  edamame:           { label: "Edamame (1/2 cup)",            cal: 95,  protein: 8,   fat: 4,   carbs: 8,    fiber: 4 },
  black_beans:       { label: "Black beans (1/2 cup)",        cal: 114, protein: 7.6, fat: 0.5, carbs: 20,   fiber: 7.5 },
  chickpeas:         { label: "Chickpeas (1/2 cup)",          cal: 134, protein: 7.3, fat: 2.1, carbs: 22.5, fiber: 6.2 },
  lentils:           { label: "Lentils (1/2 cup cooked)",     cal: 115, protein: 9,   fat: 0.4, carbs: 20,   fiber: 8 },
  kidney_beans:      { label: "Kidney beans (1/2 cup)",       cal: 112, protein: 7.7, fat: 0.4, carbs: 20,   fiber: 6.8 },
  bean_burrito:      { label: "Bean burrito",                 cal: 380, protein: 14,  fat: 10,  carbs: 58,   fiber: 10 },
  hummus:            { label: "Hummus (2 tbsp)",              cal: 70,  protein: 2,   fat: 5,   carbs: 6,    fiber: 2 },

  // --- Dairy & eggs ---
  milk_whole:        { label: "Milk, whole (1 cup)",          cal: 149, protein: 8,   fat: 8,   carbs: 12,   fiber: 0 },
  milk_skim:         { label: "Milk, skim (1 cup)",           cal: 83,  protein: 8,   fat: 0.2, carbs: 12,   fiber: 0 },
  almond_milk:       { label: "Almond milk, unsweetened (1 cup)", cal: 30, protein: 1, fat: 2.5, carbs: 1,   fiber: 0.5 },
  oat_milk:          { label: "Oat milk (1 cup)",             cal: 120, protein: 3,   fat: 5,   carbs: 16,   fiber: 2 },
  cheddar_cheese:    { label: "Cheddar cheese (1 oz)",        cal: 113, protein: 7,   fat: 9,   carbs: 0.4,  fiber: 0 },
  mozzarella:        { label: "Mozzarella (1 oz)",            cal: 85,  protein: 6,   fat: 6,   carbs: 1,    fiber: 0 },
  parmesan:          { label: "Parmesan (1 tbsp grated)",     cal: 22,  protein: 2,   fat: 1.5, carbs: 0.2,  fiber: 0 },
  string_cheese:     { label: "String cheese (1 stick)",      cal: 80,  protein: 7,   fat: 6,   carbs: 1,    fiber: 0 },
  cream_cheese:      { label: "Cream cheese (1 tbsp)",        cal: 51,  protein: 1,   fat: 5,   carbs: 0.8,  fiber: 0 },
  cottage_cheese:    { label: "Cottage cheese (1/2 cup)",     cal: 90,  protein: 12,  fat: 2.5, carbs: 5,    fiber: 0 },
  sour_cream:        { label: "Sour cream (2 tbsp)",          cal: 60,  protein: 1,   fat: 5,   carbs: 1,    fiber: 0 },
  butter:            { label: "Butter (1 tbsp)",              cal: 102, protein: 0.1, fat: 11.5,carbs: 0,    fiber: 0 },
  egg_white:         { label: "Egg white (1 large)",          cal: 17,  protein: 3.6, fat: 0.1, carbs: 0.2,  fiber: 0 },
  scrambled_eggs_2:  { label: "Scrambled eggs (2, w/ butter)",cal: 180, protein: 12,  fat: 14,  carbs: 2,    fiber: 0 },
  yogurt_flavored:   { label: "Yogurt, flavored (1 cup)",     cal: 232, protein: 10,  fat: 2.6, carbs: 43,   fiber: 0 },

  // --- Grains & starches ---
  brown_rice:        { label: "Brown rice (cooked, 1 cup)",   cal: 216, protein: 5,   fat: 1.8, carbs: 45,   fiber: 3.5 },
  quinoa:            { label: "Quinoa (cooked, 1 cup)",       cal: 222, protein: 8,   fat: 3.6, carbs: 39,   fiber: 5 },
  pasta:             { label: "Pasta (cooked, 1 cup)",        cal: 220, protein: 8,   fat: 1.3, carbs: 43,   fiber: 2.5 },
  couscous:          { label: "Couscous, cooked (1 cup)",     cal: 176, protein: 6,   fat: 0.3, carbs: 36.5, fiber: 2.2 },
  barley:            { label: "Barley, cooked (1 cup)",       cal: 193, protein: 3.5, fat: 0.7, carbs: 44,   fiber: 6 },
  whole_wheat_bread: { label: "Whole wheat bread (1 slice)",  cal: 80,  protein: 4,   fat: 1,   carbs: 14,   fiber: 2 },
  rye_bread:         { label: "Rye bread (1 slice)",          cal: 83,  protein: 2.7, fat: 1.1, carbs: 15.5, fiber: 1.9 },
  bagel:             { label: "Bagel, plain (1 medium)",      cal: 245, protein: 10,  fat: 1.5, carbs: 48,   fiber: 2 },
  tortilla_flour:    { label: "Flour tortilla (1 medium)",    cal: 140, protein: 4,   fat: 3.5, carbs: 24,   fiber: 1 },
  tortilla_corn:     { label: "Corn tortilla (1 small)",      cal: 52,  protein: 1.4, fat: 0.7, carbs: 10.7, fiber: 1.5 },
  pita_bread:        { label: "Pita bread (1 medium)",        cal: 165, protein: 5.5, fat: 0.7, carbs: 33,   fiber: 1.3 },
  naan:              { label: "Naan bread (1 piece)",         cal: 260, protein: 9,   fat: 5,   carbs: 45,   fiber: 2 },
  croissant:         { label: "Croissant (1 medium)",         cal: 231, protein: 5,   fat: 12,  carbs: 26,   fiber: 1.5 },
  english_muffin:    { label: "English muffin",               cal: 134, protein: 5,   fat: 1,   carbs: 26,   fiber: 1.5 },
  cereal_generic:    { label: "Cereal, generic (1 cup)",      cal: 120, protein: 2,   fat: 1,   carbs: 26,   fiber: 2 },
  bran_flakes:       { label: "Bran flakes (1 cup)",          cal: 127, protein: 4,   fat: 0.8, carbs: 31,   fiber: 5.5 },
  granola:           { label: "Granola (1/2 cup)",            cal: 300, protein: 7,   fat: 12,  carbs: 40,   fiber: 4 },
  oatmeal_packet:    { label: "Oatmeal, instant (1 packet)",  cal: 100, protein: 2.5, fat: 1.5, carbs: 19,   fiber: 3 },
  cream_of_wheat:    { label: "Cream of wheat, cooked (1 cup)", cal: 133, protein: 3.8, fat: 0.5, carbs: 28, fiber: 1.4 },
  pancake:           { label: "Pancake (1, 6in)",             cal: 90,  protein: 2.5, fat: 3,   carbs: 13,   fiber: 0.5 },
  waffle:            { label: "Waffle (1, frozen)",           cal: 100, protein: 2.5, fat: 3,   carbs: 16,   fiber: 0.7 },
  potato_baked:      { label: "Potato, baked (medium)",       cal: 161, protein: 4.3, fat: 0.2, carbs: 37,   fiber: 3.8 },
  mashed_potato:     { label: "Mashed potatoes (1 cup)",      cal: 237, protein: 4,   fat: 9,   carbs: 35,   fiber: 3 },
  french_fries:      { label: "French fries (medium, fast food)", cal: 365, protein: 4, fat: 17, carbs: 48, fiber: 4 },
  corn_kernels:      { label: "Corn (1/2 cup)",               cal: 66,  protein: 2.5, fat: 0.8, carbs: 15,   fiber: 1.8 },
  sweet_corn_ear:    { label: "Corn on the cob (1 ear)",      cal: 99,  protein: 3.5, fat: 1.5, carbs: 22,   fiber: 2.4 },
  crackers:          { label: "Crackers (5 saltines)",        cal: 65,  protein: 1.4, fat: 1.7, carbs: 11,   fiber: 0.5 },

  // --- Fruits ---
  apple:             { label: "Apple (medium)",               cal: 95,  protein: 0.5, fat: 0.3, carbs: 25,   fiber: 4.4 },
  orange:            { label: "Orange (medium)",              cal: 62,  protein: 1.2, fat: 0.2, carbs: 15.4, fiber: 3.1 },
  grapes:            { label: "Grapes (1 cup)",               cal: 104, protein: 1.1, fat: 0.2, carbs: 27,   fiber: 1.4 },
  strawberries:      { label: "Strawberries (1 cup)",         cal: 49,  protein: 1,   fat: 0.5, carbs: 11.7, fiber: 3 },
  blueberries:       { label: "Blueberries (1 cup)",          cal: 84,  protein: 1.1, fat: 0.5, carbs: 21,   fiber: 3.6 },
  blackberries:      { label: "Blackberries (1 cup)",         cal: 62,  protein: 2,   fat: 0.7, carbs: 14,   fiber: 7.6 },
  raspberries:       { label: "Raspberries (1 cup)",          cal: 64,  protein: 1.5, fat: 0.8, carbs: 14.7, fiber: 8 },
  mango:             { label: "Mango (1 cup)",                cal: 99,  protein: 1.4, fat: 0.6, carbs: 25,   fiber: 2.6 },
  pineapple:         { label: "Pineapple (1 cup)",            cal: 82,  protein: 0.9, fat: 0.2, carbs: 21.6, fiber: 2.3 },
  watermelon_cup:    { label: "Watermelon (1 cup diced)",     cal: 46,  protein: 0.9, fat: 0.2, carbs: 11.5, fiber: 0.6 },
  cantaloupe:        { label: "Cantaloupe (1 cup)",           cal: 54,  protein: 1.3, fat: 0.3, carbs: 13,   fiber: 1.4 },
  papaya:            { label: "Papaya (1 cup)",               cal: 62,  protein: 0.7, fat: 0.4, carbs: 16,   fiber: 2.5 },
  peach:             { label: "Peach (medium)",               cal: 58,  protein: 1.4, fat: 0.4, carbs: 14,   fiber: 2.2 },
  pear:              { label: "Pear (medium)",                cal: 101, protein: 0.6, fat: 0.2, carbs: 27,   fiber: 5.5 },
  plum:              { label: "Plum (medium)",                cal: 30,  protein: 0.5, fat: 0.2, carbs: 7.5,  fiber: 0.9 },
  kiwi:              { label: "Kiwi (1 medium)",              cal: 42,  protein: 0.8, fat: 0.4, carbs: 10,   fiber: 2.1 },
  guava:             { label: "Guava (1 medium)",             cal: 37,  protein: 1.4, fat: 0.5, carbs: 7.9,  fiber: 3 },
  passion_fruit:     { label: "Passion fruit (1 piece)",      cal: 18,  protein: 0.4, fat: 0.1, carbs: 4.2,  fiber: 1.9 },
  cherries:          { label: "Cherries (1 cup)",             cal: 87,  protein: 1.5, fat: 0.3, carbs: 22,   fiber: 2.9 },
  grapefruit:        { label: "Grapefruit (half)",            cal: 52,  protein: 1,   fat: 0.2, carbs: 13,   fiber: 2 },
  raisins:           { label: "Raisins (1/4 cup)",            cal: 123, protein: 1.3, fat: 0.2, carbs: 33,   fiber: 1.6 },
  dates:             { label: "Dates, medjool (2)",           cal: 133, protein: 0.9, fat: 0.1, carbs: 36,   fiber: 3.2 },

  // --- Vegetables ---
  broccoli:          { label: "Broccoli (1 cup cooked)",      cal: 55,  protein: 3.7, fat: 0.6, carbs: 11,   fiber: 5.1 },
  spinach_raw:       { label: "Spinach, raw (2 cups)",        cal: 14,  protein: 1.7, fat: 0.2, carbs: 2.2,  fiber: 1.3 },
  spinach_cooked:    { label: "Spinach, cooked (1 cup)",      cal: 41,  protein: 5.3, fat: 0.5, carbs: 6.8,  fiber: 4.3 },
  kale:              { label: "Kale, raw (1 cup)",            cal: 33,  protein: 2.9, fat: 0.6, carbs: 6,    fiber: 1.3 },
  carrots:           { label: "Carrots (1 cup)",              cal: 52,  protein: 1.2, fat: 0.3, carbs: 12,   fiber: 3.6 },
  tomato:            { label: "Tomato (medium)",              cal: 22,  protein: 1.1, fat: 0.2, carbs: 4.8,  fiber: 1.5 },
  cucumber:          { label: "Cucumber (1 cup sliced)",      cal: 16,  protein: 0.7, fat: 0.1, carbs: 3.8,  fiber: 0.5 },
  bell_pepper:       { label: "Bell pepper (1 cup)",          cal: 30,  protein: 1,   fat: 0.3, carbs: 7,    fiber: 2.5 },
  onion:             { label: "Onion (1/2 cup chopped)",      cal: 32,  protein: 0.9, fat: 0.1, carbs: 7.5,  fiber: 1.4 },
  green_beans:       { label: "Green beans (1 cup)",          cal: 31,  protein: 1.8, fat: 0.1, carbs: 7,    fiber: 3.4 },
  asparagus:         { label: "Asparagus (1 cup)",            cal: 27,  protein: 3,   fat: 0.2, carbs: 5.2,  fiber: 2.8 },
  zucchini:          { label: "Zucchini (1 cup)",             cal: 20,  protein: 1.5, fat: 0.4, carbs: 4,    fiber: 1.3 },
  mushrooms:         { label: "Mushrooms (1 cup)",            cal: 15,  protein: 2.2, fat: 0.2, carbs: 2.3,  fiber: 0.7 },
  cauliflower:       { label: "Cauliflower (1 cup)",          cal: 27,  protein: 2,   fat: 0.3, carbs: 5.3,  fiber: 2.5 },
  brussels_sprouts:  { label: "Brussels sprouts (1 cup)",     cal: 38,  protein: 3,   fat: 0.3, carbs: 8,    fiber: 3.3 },
  lettuce:           { label: "Lettuce (2 cups)",             cal: 10,  protein: 0.9, fat: 0.1, carbs: 1.9,  fiber: 1 },
  celery:            { label: "Celery (1 cup)",               cal: 16,  protein: 0.7, fat: 0.2, carbs: 3,    fiber: 1.6 },
  beets:             { label: "Beets, cooked (1 cup)",        cal: 58,  protein: 2.2, fat: 0.2, carbs: 13,   fiber: 3.8 },
  squash_butternut:  { label: "Butternut squash (1 cup)",     cal: 82,  protein: 1.8, fat: 0.2, carbs: 22,   fiber: 6.6 },
  eggplant:          { label: "Eggplant, cooked (1 cup)",     cal: 35,  protein: 0.8, fat: 0.2, carbs: 8.6,  fiber: 2.5 },

  // --- Nuts & seeds ---
  walnuts:           { label: "Walnuts (1 oz)",               cal: 185, protein: 4.3, fat: 18.5, carbs: 3.9, fiber: 1.9 },
  cashews:           { label: "Cashews (1 oz)",               cal: 157, protein: 5.2, fat: 12.4, carbs: 8.6, fiber: 0.9 },
  pistachios:        { label: "Pistachios (1 oz)",            cal: 159, protein: 5.7, fat: 12.9, carbs: 7.7, fiber: 2.9 },
  peanuts:           { label: "Peanuts (1 oz)",               cal: 161, protein: 7.3, fat: 14,  carbs: 4.6,  fiber: 2.4 },
  chia_seeds:        { label: "Chia seeds (1 tbsp)",          cal: 58,  protein: 2,   fat: 3.7, carbs: 5,    fiber: 4.1 },
  flax_seeds:        { label: "Flax seeds, ground (1 tbsp)",  cal: 37,  protein: 1.3, fat: 3,   carbs: 2,    fiber: 1.9 },
  trail_mix:         { label: "Trail mix (1/4 cup)",          cal: 173, protein: 5,   fat: 11,  carbs: 17,   fiber: 2.5 },

  // --- Snacks ---
  protein_bar:       { label: "Protein bar (generic)",        cal: 200, protein: 20,  fat: 7,   carbs: 22,   fiber: 3 },
  granola_bar:       { label: "Granola bar (1 bar)",          cal: 120, protein: 2,   fat: 4,   carbs: 20,   fiber: 1.5 },
  potato_chips:      { label: "Potato chips (1 oz)",          cal: 152, protein: 2,   fat: 10,  carbs: 15,   fiber: 1 },
  tortilla_chips:    { label: "Tortilla chips (1 oz)",        cal: 140, protein: 2,   fat: 7,   carbs: 18,   fiber: 1.5 },
  popcorn:           { label: "Popcorn, air-popped (3 cups)", cal: 93,  protein: 3,   fat: 1,   carbs: 19,   fiber: 3.5 },
  pretzels:          { label: "Pretzels (1 oz)",              cal: 108, protein: 2.6, fat: 0.8, carbs: 23,   fiber: 0.9 },
  rice_cake:         { label: "Rice cake (1)",                cal: 35,  protein: 0.7, fat: 0.3, carbs: 7.3,  fiber: 0.4 },
  casein_scoop:      { label: "Casein protein (scoop)",       cal: 120, protein: 24,  fat: 1,   carbs: 3,    fiber: 0 },
  protein_shake_rtd: { label: "Protein shake, ready-to-drink (bottle)", cal: 160, protein: 30, fat: 2.5, carbs: 5, fiber: 1 },

  // --- Desserts & baked goods ---
  chocolate_chip_cookie: { label: "Chocolate chip cookie (1 medium)", cal: 160, protein: 1.6, fat: 8, carbs: 20, fiber: 0.6 },
  brownie:           { label: "Brownie (1 square)",           cal: 240, protein: 3,   fat: 10,  carbs: 36,   fiber: 1.5 },
  donut_glazed:      { label: "Donut, glazed",                cal: 260, protein: 3,   fat: 14,  carbs: 31,   fiber: 0.7 },
  muffin_blueberry:  { label: "Blueberry muffin",             cal: 340, protein: 5,   fat: 13,  carbs: 51,   fiber: 1.5 },
  ice_cream_scoop:   { label: "Ice cream, vanilla (1/2 cup)", cal: 137, protein: 2.3, fat: 7.3, carbs: 16,   fiber: 0.5 },
  dark_chocolate:    { label: "Dark chocolate (1 oz)",        cal: 170, protein: 2.2, fat: 12,  carbs: 13,   fiber: 3.1 },
  milk_chocolate:    { label: "Milk chocolate (1 oz)",        cal: 152, protein: 2.1, fat: 8.5, carbs: 17,   fiber: 0.9 },

  // --- Beverages ---
  orange_juice:      { label: "Orange juice (1 cup)",         cal: 112, protein: 1.7, fat: 0.5, carbs: 26,   fiber: 0.5 },
  apple_juice:       { label: "Apple juice (1 cup)",          cal: 114, protein: 0.2, fat: 0.3, carbs: 28,   fiber: 0.2 },
  soda_regular:      { label: "Soda, regular (12 oz can)",    cal: 140, protein: 0,   fat: 0,   carbs: 39,   fiber: 0 },
  beer:              { label: "Beer, regular (12 oz)",        cal: 153, protein: 1.6, fat: 0,   carbs: 13,   fiber: 0 },
  wine_glass:        { label: "Wine, red or white (5 oz)",    cal: 125, protein: 0.1, fat: 0,   carbs: 4,    fiber: 0 },
  latte:             { label: "Latte, whole milk (12 oz)",    cal: 150, protein: 8,   fat: 8,   carbs: 12,   fiber: 0 },
  cappuccino:        { label: "Cappuccino, whole milk (12 oz)", cal: 110, protein: 6, fat: 6,   carbs: 9,    fiber: 0 },
  sports_drink:      { label: "Sports drink (20 oz)",         cal: 130, protein: 0,   fat: 0,   carbs: 34,   fiber: 0 },

  // --- Condiments & sauces ---
  ketchup:           { label: "Ketchup (1 tbsp)",             cal: 19,  protein: 0.2, fat: 0,   carbs: 4.7,  fiber: 0.1 },
  mayo:              { label: "Mayonnaise (1 tbsp)",          cal: 94,  protein: 0.1, fat: 10.3,carbs: 0.1,  fiber: 0 },
  mustard:           { label: "Mustard (1 tbsp)",             cal: 9,   protein: 0.6, fat: 0.5, carbs: 0.9,  fiber: 0.3 },
  soy_sauce:         { label: "Soy sauce (1 tbsp)",           cal: 8,   protein: 1.3, fat: 0,   carbs: 0.8,  fiber: 0.1 },
  honey:             { label: "Honey (1 tbsp)",               cal: 64,  protein: 0.1, fat: 0,   carbs: 17,   fiber: 0 },
  maple_syrup:       { label: "Maple syrup (1 tbsp)",         cal: 52,  protein: 0,   fat: 0,   carbs: 13,   fiber: 0 },
  olive_oil:         { label: "Olive oil (1 tbsp)",           cal: 119, protein: 0,   fat: 13.5,carbs: 0,    fiber: 0 },
  ranch_dressing:    { label: "Ranch dressing (2 tbsp)",      cal: 146, protein: 0.3, fat: 16,  carbs: 1.5,  fiber: 0 },
  salsa:             { label: "Salsa (2 tbsp)",               cal: 10,  protein: 0.4, fat: 0.1, carbs: 2.1,  fiber: 0.5 },
  bbq_sauce:         { label: "BBQ sauce (2 tbsp)",           cal: 60,  protein: 0.3, fat: 0.2, carbs: 15,   fiber: 0.2 },
  teriyaki_sauce:    { label: "Teriyaki sauce (2 tbsp)",      cal: 30,  protein: 1,   fat: 0,   carbs: 6,    fiber: 0 },
  hot_sauce:         { label: "Hot sauce (1 tsp)",            cal: 1,   protein: 0.1, fat: 0,   carbs: 0.2,  fiber: 0 },
  balsamic_vinegar:  { label: "Balsamic vinegar (1 tbsp)",    cal: 14,  protein: 0.1, fat: 0,   carbs: 2.7,  fiber: 0 },

  // --- Fast food & prepared meals ---
  cheeseburger:      { label: "Cheeseburger, fast food",      cal: 300, protein: 15,  fat: 14,  carbs: 30,   fiber: 1.5 },
  pizza_slice:       { label: "Pizza, cheese (1 slice)",      cal: 285, protein: 12,  fat: 10,  carbs: 36,   fiber: 2.5 },
  chicken_nuggets_6: { label: "Chicken nuggets (6 pc)",       cal: 280, protein: 14,  fat: 18,  carbs: 16,   fiber: 1 },
  burrito_chicken:   { label: "Chicken burrito (fast casual)", cal: 550, protein: 30, fat: 20,  carbs: 65,   fiber: 8 },
  taco:              { label: "Taco, beef (hard shell)",      cal: 170, protein: 8,   fat: 10,  carbs: 13,   fiber: 2 },
  sushi_roll_california: { label: "California roll (8 pc)",  cal: 255, protein: 9,   fat: 7,   carbs: 38,   fiber: 3 },
  fried_rice:        { label: "Fried rice (1 cup)",           cal: 333, protein: 8,   fat: 12,  carbs: 48,   fiber: 2 },
  pad_thai:          { label: "Pad Thai (1 cup)",             cal: 350, protein: 15,  fat: 14,  carbs: 42,   fiber: 2 },
  ramen_bowl:        { label: "Ramen (1 bowl)",               cal: 450, protein: 18,  fat: 15,  carbs: 60,   fiber: 3 },
  caesar_salad:      { label: "Caesar salad (with dressing, no chicken)", cal: 180, protein: 4, fat: 15, carbs: 8, fiber: 2 },
  grilled_chicken_salad: { label: "Grilled chicken salad (no dressing)", cal: 220, protein: 30, fat: 6, carbs: 10, fiber: 3 },
  chicken_caesar_wrap: { label: "Chicken caesar wrap",        cal: 500, protein: 30,  fat: 24,  carbs: 40,   fiber: 3 },
  turkey_sandwich:   { label: "Turkey sandwich (deli, wheat bread)", cal: 320, protein: 22, fat: 6, carbs: 42, fiber: 4 },
  pb_sandwich:       { label: "Peanut butter sandwich",       cal: 350, protein: 12,  fat: 16,  carbs: 42,   fiber: 3 },
};

// Planned quantities per meal (item id -> planned qty). Days start with these items at 0
// (nothing pre-logged) — the planned qty is shown as a target and can be applied in one tap
// via "Log as planned", or built up manually with the steppers.
const MEAL_TEMPLATES = {
  breakfast: { egg: 3, rice_scoop: 1, watermelon_juice: 1, fruit: 1, espresso: 2 },
  lunch: { whey_scoop: 3, pb2_scoop: 1, fruit: 1, redbull_sf: 1 },
  dinner: { egg: 2, rice_scoop: 1, greens: 1, tuna_spicy_scoop: 2, tuna_raw_scoop: 2 },
  extra: {},
};

// Weekly training split. JS Date.getDay(): 0=Sun..6=Sat.
const WEEKLY_SCHEDULE = {
  0: null,          // Sunday — make-up / manual day
  1: "resistance",  // Monday
  2: "run",         // Tuesday (+ core)
  3: "boulder",     // Wednesday
  4: "resistance",  // Thursday
  5: "run",         // Friday (+ core)
  6: "boulder",     // Saturday
};

// Movement-pattern category per exercise — used to suggest a same-category alternative
// when swapping an exercise out of a day's workout (e.g. no cable machine today).
const EXERCISE_CATEGORIES = {
  "Goblet Squat": "squat",
  "Front Squat": "squat",
  "Bulgarian Split Squat": "squat",
  "Leg Press": "squat",
  "Hack Squat": "squat",
  "Romanian Deadlift (Dumbbell)": "hinge",
  "Conventional Deadlift": "hinge",
  "Kettlebell Swing": "hinge",
  "Good Morning": "hinge",
  "Hip Thrust": "hinge",
  "Dumbbell Bench / Floor Press": "push",
  "Push-Up": "push",
  "Overhead Press (Dumbbell)": "push",
  "Incline Dumbbell Press": "push",
  "Dip": "push",
  "Cable Chest Fly": "push",
  "Dumbbell Row": "pull",
  "Pull-Up": "pull",
  "Chin-Up": "pull",
  "Lat Pulldown": "pull",
  "Seated Cable Row": "pull",
  "Face Pull": "pull",
  "Inverted Row": "pull",
  "Walking Lunge": "lunge",
  "Reverse Lunge": "lunge",
  "Step-Up": "lunge",
  "Band External Rotation": "shoulder",
  "Lateral Raise": "shoulder",
  "Cable Y-Raise": "shoulder",
  "Bicep Curl (Dumbbell)": "arms",
  "Hammer Curl": "arms",
  "Tricep Pushdown": "arms",
  "Overhead Tricep Extension": "arms",
  "Calf Raise": "legs",
};

const RESISTANCE_EXERCISES = Object.keys(EXERCISE_CATEGORIES);

// Outcome tag for each logged climb (Volume/Mileage's grade-tally log) — tap a logged
// entry to cycle through these in order.
const CLIMB_OUTCOMES = ["Send", "Flash", "Attempt"];

// Boulder session modes — matches the standard power/limit vs volume vs power-endurance
// training split so session type is tracked alongside minutes and the climb log.
const BOULDER_SESSION_TYPES = ["Power/Limit", "Volume/Mileage", "Power-Endurance"];

// Periodization cycle keyed to actual climbing SESSION COUNT rather than calendar weeks —
// deliberately, since climbing days can't be scheduled far in advance for everyone. The
// phase advances only when a session is actually logged, so an irregular week (or month)
// just doesn't move the cycle forward instead of falling "behind" or needing to be reset.
// sessionType null (Deload) has no forced type — the least-done-in-4-weeks balancer takes
// over as a tiebreaker for what to climb that day.
const CLIMBING_PHASE_PLAN = [
  { phase: "Base", sessions: 4, sessionType: "Volume/Mileage",
    note: "Volume and movement — lots of moderate climbs, build the base back up." },
  { phase: "Strength", sessions: 3, sessionType: "Power/Limit",
    note: "Fewer, harder attempts — full rest between tries, quality over quantity." },
  { phase: "Power-Endurance", sessions: 2, sessionType: "Power-Endurance",
    note: "Strings of hard moves back to back — sustaining power, not just raw strength." },
  { phase: "Deload", sessions: 1, sessionType: null,
    note: "Lighter session — easy volume, enjoy the movement, let the tank refill." },
];
const CLIMBING_CYCLE_LENGTH = CLIMBING_PHASE_PLAN.reduce((sum, p) => sum + p.sessions, 0);

// Grid trackers for the two structured session types (Volume/Mileage just uses the plain
// climb log already built). restTrigger "cell" = rest after every marked box (Power/Limit —
// full recovery needed between every near-limit attempt); "row" = rest only once a whole row
// is filled (Power-Endurance/4x4s — minimal rest within a round, real rest between rounds).
const BOULDER_GRID_CONFIG = {
  "Power/Limit": { rows: 8, cols: 5, restSeconds: 240, restTrigger: "cell", rowLabel: "Problem" },
  "Power-Endurance": { rows: 3, cols: 4, restSeconds: 240, restTrigger: "row", rowLabel: "Round" },
};

// Standard progressive climbing warm-up: general mobility, then a "4 up 4 down" style
// easy-to-moderate pyramid. restAfter is the rest (seconds) to take once that step is
// checked off, before starting the next one — 0 means move straight on (or that's the last step).
const CLIMBING_WARMUP_STEPS = [
  { label: "Light cardio — jog in place, jumping jacks, easy bike (~5 min)", restAfter: 0 },
  { label: "Dynamic mobility — arm circles, shoulder rolls, wrist circles, hip openers/lunges (~3 min)", restAfter: 0 },
  { label: "Easy hangs — 3-4× 10s hangs on a jug/big edge to wake up fingers", restAfter: 60 },
  { label: "3-4 easy problems (VB-V0)", restAfter: 120 },
  { label: "2 problems (V1)", restAfter: 120 },
  { label: "2 problems (V2)", restAfter: 150 },
  { label: "1 problem (V3, or one grade below today's target)", restAfter: 0 },
];

// Written for a full 1.5-2hr session, not just the core protocol — warm-up plus enough
// rounds/volume to actually fill that time (the long rests in Power/Limit and Power-Endurance
// do most of that work; Volume/Mileage fills it with total problem count instead).
const BOULDER_SESSION_GUIDANCE = {
  "Power/Limit": "Warm up 15-20 min, then work 6-8 problems at or just below your limit — 3-5 attempts each, full rest (3-5 min) between attempts and between problems. The long rests are what fill the 1.5-2hr session; quality over quantity, not pump.",
  "Volume/Mileage": "Warm up 10-15 min, then climb continuously well below your limit for the rest of the session — aim for 30-50+ problems total, resting only long enough to catch your breath (~1 min) between climbs. This is about total mileage and movement quality, not max effort.",
  "Power-Endurance": "Warm up 15-20 min, then run 2-3 full 4x4 circuits: 4 problems ~3 grades below your limit, each climbed 4x back-to-back with minimal rest, then ~4 min rest before the next round. Use a different set of 4 problems per circuit, with ~8-10 min rest between circuits. Favor steep, pumpy problems — avoid rest jugs.",
};

// Core work, paired with run days. Each has its own input type since they're logged differently:
// reps = bodyweight sets x reps, duration = timed hold (seconds), weighted-reps = weight + reps.
const CORE_EXERCISES = [
  { name: "Leg Raise (hanging or lying)", type: "reps" },
  { name: "Plank (timed)", type: "duration" },
  { name: "Weighted Dumbbell Twist", type: "weighted-reps" },
];

// Named hangboard protocols — load their config into the shared timer, all fields
// stay adjustable afterward. sets/reps/work/rest/restBetweenSets are all in seconds
// except sets/reps (counts).
const HANGBOARD_PRESETS = [
  { name: "Max Hangs", description: "Heavy near-max hangs, long rest — builds max finger strength.", sets: 4, reps: 1, work: 10, rest: 5, restBetweenSets: 180 },
  { name: "Repeaters (7:3)", description: "Classic 7s on / 3s off endurance protocol.", sets: 4, reps: 6, work: 7, rest: 3, restBetweenSets: 180 },
  { name: "Density Hangs", description: "Longer submaximal hangs for aerobic capacity.", sets: 3, reps: 6, work: 20, rest: 10, restBetweenSets: 120 },
];
