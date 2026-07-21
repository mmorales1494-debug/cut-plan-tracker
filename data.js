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
  waterBottlesMin: 2,
  waterBottlesMax: 2,
};

const BOTTLE_OZ = 32;

// Goal-based calorie targeting (Mifflin-St Jeor BMR + a sedentary base activity multiplier;
// workouts and steps add their own bonus on top so more active days earn more calories,
// similar in spirit to MyFitnessPal's adaptive daily goal).
const KCAL_PER_LB = 3500; // standard approximation for 1 lb of body fat
const GOAL_ACTIVITY_MULTIPLIER = 1.2; // sedentary baseline — exercise/steps bonuses cover the rest
const STEP_KCAL_PER_STEP = 0.04;
const WORKOUT_KCAL_BONUS = { rest: 0, resistance: 150, run: 250, boulder: 300 };

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

// Ring colors for the Nutrition macro rings on the Today tab.
const MACRO_RING_COLORS = { cal: "#4fd1c5", protein: "#378add", carbs: "#ef9f27", fat: "#d4537e" };

// Item catalog: per-unit calories/protein/fat/carbs. Meal totals recompute live from qty * unit values.
const ITEM_CATALOG = {
  egg:               { label: "Egg (hard-cooked)",      cal: 70,  protein: 6,  fat: 5,   carbs: 0.5 },
  rice_scoop:        { label: "Rice (scoop)",            cal: 220, protein: 4,  fat: 0,   carbs: 45 },
  watermelon_juice:  { label: "Watermelon juice",        cal: 120, protein: 1,  fat: 0,   carbs: 30 },
  fruit:             { label: "Fruit (piece)",           cal: 90,  protein: 1,  fat: 0,   carbs: 23 },
  espresso:          { label: "Espresso",                cal: 5,   protein: 1,  fat: 0,   carbs: 1 },
  whey_scoop:        { label: "Whey protein (scoop)",    cal: 120, protein: 24, fat: 2,   carbs: 3 },
  pb2_scoop:         { label: "PB2 powder (scoop)",      cal: 60,  protein: 6,  fat: 1.5, carbs: 5 },
  redbull_sf:        { label: "Sugar-free energy drink", cal: 10,  protein: 0,  fat: 0,   carbs: 2 },
  greens:            { label: "Greens",                  cal: 20,  protein: 2,  fat: 0,   carbs: 3 },
  tuna_spicy_scoop:  { label: "Spicy tuna (scoop)",       cal: 60,  protein: 5,  fat: 4,   carbs: 1 },
  tuna_raw_scoop:    { label: "Raw tuna (scoop)",         cal: 40,  protein: 10, fat: 0.5, carbs: 0 },
  boiled_egg:        { label: "Boiled egg (store)",       cal: 70,  protein: 6,  fat: 5,   carbs: 0.5 },
  tofu_pack:         { label: "Tofu pack (store)",        cal: 80,  protein: 8,  fat: 4,   carbs: 2 },
  added_fat:         { label: "Added oil/sauce/dressing", cal: 90,  protein: 0,  fat: 10,  carbs: 2 },
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

const RESISTANCE_EXERCISES = [
  "Goblet Squat",
  "Romanian Deadlift (Dumbbell)",
  "Dumbbell Bench / Floor Press",
  "Dumbbell Row",
  "Push-Up",
  "Walking Lunge",
  "Band External Rotation",
];

// Boulder session modes — matches the standard power/limit vs volume vs power-endurance
// training split so session type is tracked alongside minutes and the climb log.
const BOULDER_SESSION_TYPES = ["Power/Limit", "Volume/Mileage", "Power-Endurance"];

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
