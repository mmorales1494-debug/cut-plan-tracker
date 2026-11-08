// Short sessions, A/B rotation by logged session, accessories, step-down stages, plate
// inventory and lifting-only mode.
const ctx = require("./harness.js");
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`); }
}
function near(actual, expected, label, tol = 0.01) {
  const ok = Math.abs(actual - expected) < tol;
  if (ok) { pass++; } else { fail++; console.log(`FAIL ${label}: expected ~${expected}, got ${actual}`); }
}
const lb = w => ctx.toStorageWeight(w);
const show = kg => ctx.toDisplayWeight(kg);

// ---- migration of hand-built A/B routines (names only, Band ER tacked on) ----
const legacy = {
  meta: {}, targets: {}, days: {}, customItems: {}, checklistItems: [], weightUnit: "lb",
  routines: [
    { id: "routine_1", name: "Full Body", active: false, exercises: [{ name: "Goblet Squat", barbell: false }],
      setTarget: { min: 3, max: 4 }, repTarget: { min: 8, max: 12 }, weightStepKg: 2.5, restSeconds: 120 },
    { id: "routine_sl_a_1", name: "StrongLifts A", active: true,
      exercises: [{ name: "Squat", barbell: false }, { name: "Bench Press", barbell: false }, { name: "Barbell Row", barbell: false }, { name: "Band External Rotation", barbell: false }],
      setTarget: { min: 5, max: 5 }, repTarget: { min: 5, max: 5 }, weightStepKg: 2.5, restSeconds: 300 },
    { id: "routine_sl_b_1", name: "StrongLifts B", active: true,
      exercises: [{ name: "Squat", barbell: false }, { name: "Overhead Press", barbell: false }, { name: "Deadlift", barbell: false }, { name: "Band External Rotation", barbell: false }],
      setTarget: { min: 5, max: 5 }, repTarget: { min: 5, max: 5 }, weightStepKg: 2.5, restSeconds: 300 },
  ],
};
ctx.localStorage.setItem("cutPlanState", JSON.stringify(legacy));
ctx.state = ctx.loadState();
const S = ctx.state;
const [, A, B] = S.routines;
eq(A.exercises.map(e => e.name), ["Squat", "Bench Press", "Barbell Row", "Pull-Up", "Bicep Curl (Dumbbell)", "Band External Rotation"], "A migrated in template order, extra kept");
eq(B.exercises.map(e => e.name), ["Squat", "Overhead Press", "Deadlift", "Bench Press (light)", "Pull-Up", "Bicep Curl (Dumbbell)", "Band External Rotation"], "B migrated");
eq([A.slLetter, B.slLetter], ["A", "B"], "letters recorded");
eq(A.exercises[0].barbell, true, "program lifts get the plate calculator");
eq(S.slShortSessions, true, "short sessions on by default");
eq(S.slLayoutVersion, 3, "layout version stamped");
eq(S.platePairs.lb[45], 1, "default plate inventory");
ctx.localStorage.setItem("cutPlanState", JSON.stringify(S));
eq(ctx.loadState().routines[2].exercises.length, 7, "migration is idempotent");

// ---- short sessions lay out only squat + press + accessories ----
const today = ctx.formatDateKey(new Date());
const day = k => ctx.state.days[k];
const names = k => day(k).workout.exercises.map(e => e.name);
S.days = {};
S.weeklySchedule = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
function newLiftDay(k) {
  S.days[k] = { workout: { type: "resistance", exercises: [], routineId: null, core: [], run: {}, boulder: {} } };
  ctx.populateResistanceExercises(S.days[k], k);
  return S.days[k];
}
function logAll(k) { // do every work set and accessory as prescribed
  for (const ex of day(k).workout.exercises) {
    for (const s of ex.sets) s.reps = s.target || 5;
  }
}
const d1 = ctx.addDays(today, -10);
newLiftDay(d1);
eq(names(d1), ["Squat", "Bench Press", "Pull-Up", "Bicep Curl (Dumbbell)"], "short A");
S.slShortSessions = false;
const dFull = ctx.addDays(today, -9);
newLiftDay(dFull);
// nothing logged yet, so the stored index decides — it moved on to B when d1 was laid out
eq(names(dFull), ["Squat", "Overhead Press", "Deadlift", "Bench Press (light)", "Pull-Up", "Bicep Curl (Dumbbell)", "Band External Rotation"], "full B when short sessions are off");
delete S.days[dFull];
S.slShortSessions = true;

// ---- rotation follows logged sessions, not laid-out days ----
logAll(d1);
const d2 = ctx.addDays(today, -8);
newLiftDay(d2);
eq(day(d2).workout.routineId, B.id, "after a logged A comes B");
eq(names(d2), ["Squat", "Overhead Press", "Deadlift", "Bench Press (light)", "Pull-Up", "Bicep Curl (Dumbbell)"], "short B keeps the deadlift");
const dlRows = day(d2).workout.exercises.find(e => e.name === "Deadlift").sets;
eq([dlRows.length, show(dlRows[0].weight)], [3, 135], "deadlift opens at 3x135");
// d2 is skipped (nothing logged) — the next day should still be B, not A
const d3 = ctx.addDays(today, -6);
newLiftDay(d3);
eq(day(d3).workout.routineId, B.id, "a skipped B doesn't advance the rotation");
logAll(d3);
const d4 = ctx.addDays(today, -4);
newLiftDay(d4);
eq(day(d4).workout.routineId, A.id, "logged B -> A");

// ---- prescriptions + prefill ----
// squat is on both days: 45 (d1, A) -> 50 (d3, B) -> 55 today
const squatSets = day(d4).workout.exercises[0].sets;
near(show(squatSets[0].weight), 55, "squat climbs across A and B");
eq(squatSets.map(s => s.reps), ["", "", "", "", ""], "work sets left blank");
// accessories on d4 come from d1's logged pull-ups/curls (weights blank, 8 / 10 reps)
const pull = day(d4).workout.exercises.find(e => e.name === "Pull-Up");
eq(pull.sets.map(s => [s.reps, s.target]), [["", 8], ["", 8], ["", 8]], "pull-ups prefilled from last time, reps as target");
// light bench on a B day is 80% of the bench prescription, rounded down to 5
S.days[ctx.addDays(today, -3)] = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Bench Press", barbell: true, sets: [150, 150, 150, 150, 150].map(w => ({ weight: lb(w), reps: 5 })) },
] } };
const lightRows = ctx.slAccessoryRows(B.exercises.find(e => e.name === "Bench Press (light)"), today);
eq(lightRows.map(r => show(r.weight)), [120, 120], "light bench = 80% of 155, floored to 120");

// ---- unlogged prescribed rows don't count as training ----
const untouched = { workout: { type: "resistance", exercises: [{ name: "Squat", sets: [{ weight: lb(200), reps: "", prescribed: true }] }] } };
eq(ctx.loggedResistanceSetCount(untouched), 0, "prescribed-but-empty rows aren't logged sets");
eq(ctx.collectExerciseHistory("Squat").every(r => r.reps > 0), true, "history only reads sets with reps");

// ---- bench swapped onto a B day still runs as the program ----
eq(!!ctx.strongLiftsConfig(B, "Bench Press"), true, "bench on B uses A's program config");
eq(ctx.strongLiftsConfig(B, "Bench Press (light)"), null, "the light bench is not a program lift");

// ---- a day laid out ahead re-syncs to the rotation until it's touched ----
S.days = {};
const past = ctx.addDays(today, -2);
S.days[past] = { workout: { type: "resistance", routineId: A.id, exercises: [{ name: "Squat", sets: [{ weight: lb(100), reps: 5 }] }] } };
S.days[today] = { workout: { type: "resistance", routineId: A.id, exercises: [{ name: "Squat", sets: [] }] } };
eq(ctx.slResyncDayRoutine(day(today), today), true, "untouched today switches to B after a logged A");
eq(day(today).workout.routineId, B.id, "today is now B");
eq(ctx.slResyncDayRoutine(day(today), today), false, "and stays put once it matches");
day(today).workout.routineId = A.id;
day(today).workout.routinePinned = true;
eq(ctx.slResyncDayRoutine(day(today), today), false, "a day you picked yourself is left alone");
eq(ctx.slResyncDayRoutine(day(past), past), false, "past days are never rewritten");

// ---- step-down stages: 5x5 -> (deload) 5x5 -> (deload) 3x5 -> (deload) 3x3 ----
S.days = {};
const squat = A.exercises[0];
let k = "2026-01-01";
function session(weight, reps) {
  S.days[k] = { workout: { type: "resistance", routineId: A.id, exercises: [
    { name: "Squat", barbell: true, sets: reps.map(r => ({ weight: lb(weight), reps: r })) },
  ] } };
  k = ctx.addDays(k, 2);
}
const miss5 = [5, 5, 5, 4, 3];
session(200, miss5); session(200, miss5); session(200, miss5);
let p = ctx.slPrescription(squat, k);
eq([p.status, p.deloads, p.scheme, !!p.stepDown], ["deload", 1, { sets: 5, reps: 5 }, false], "first deload stays 5x5");
near(show(p.weightKg), 180, "200 * 0.9");
session(180, [5, 5, 5, 5, 5]);
p = ctx.slPrescription(squat, k);
eq([p.status, p.scheme.sets], ["up", 5], "climbing back on 5x5");
session(185, miss5); session(185, miss5); session(185, miss5);
p = ctx.slPrescription(squat, k);
eq([p.status, p.deloads, p.scheme, p.stepDown], ["deload", 2, { sets: 3, reps: 5 }, true], "second deload steps down to 3x5");
eq(/Switching to 3×5/.test(ctx.slProgressionNote(p, squat)), true, "note explains the step-down");
session(165, [5, 5, 5]);
p = ctx.slPrescription(squat, k);
eq([p.status, p.scheme], ["up", { sets: 3, reps: 5 }], "a full 3x5 counts as a hit");
near(show(p.weightKg), 170, "165 + 5");
const miss3 = [5, 5, 3];
session(170, miss3); session(170, miss3); session(170, miss3);
p = ctx.slPrescription(squat, k);
eq([p.status, p.deloads, p.scheme], ["deload", 3, { sets: 3, reps: 3 }], "third deload steps down to 3x3");
eq(ctx.slStageScheme({ sets: 1, reps: 5 }, 3), { sets: 1, reps: 3 }, "a 1x5 lift only drops reps");

// ---- plate breakdown against what's owned ----
const pairs = { 45: 1, 35: 1, 25: 1, 15: 1, 10: 1, 5: 1, 2.5: 1 };
eq(ctx.plateBreakdown(225, "lb", pairs).plates, [45, 35, 10], "225 from one pair of each");
eq(ctx.plateBreakdown(220, "lb", pairs).plates, [45, 35, 5, 2.5], "220");
eq(ctx.plateBreakdown(165, "lb", pairs).plates, [45, 15], "165: 45+15, not 35+25");
eq(ctx.plateBreakdown(320, "lb", pairs).short, 0, "320 is the max with one pair each");
eq(ctx.plateBreakdown(325, "lb", pairs).short, 2.5, "325 comes up 2.5 short per side");
eq(ctx.plateBreakdown(405, "lb", { ...pairs, 45: 2 }).plates, [45, 45, 35, 25, 15, 10, 5], "405 with a second pair of 45s");
eq(ctx.plateBreakdown(45, "lb", pairs), null, "empty bar");
S.platePairs = { lb: pairs, kg: {} };
eq(ctx.maxLoadable(), 320, "max loadable");
eq(ctx.plateSummary(185), "45·25", "warm-up plate summary");

// ---- lifting only ----
S.weeklySchedule = { 0: "rest", 1: "boulder", 2: "run", 3: "resistance", 4: "run", 5: "boulder", 6: null };
S.liftingOnly = true;
eq(ctx.suggestedWorkoutType("2026-11-03", null), null, "Tuesday run comes up open");
eq(ctx.suggestedWorkoutType("2026-11-04", null), "resistance", "lifting days unchanged");
S.days = {};
S.days[today] = { scheduledActivity: "run", workout: { type: "run", exercises: [], core: [{ name: "Plank", sets: [] }], run: { miles: "", minutes: "" }, boulder: { minutes: "", climbs: [], grid: [], warmupDone: [] }, startedAt: null, durationMinutes: null } };
S.days[past] = { scheduledActivity: "run", workout: { type: "run", exercises: [], core: [], run: { miles: "", minutes: "" }, boulder: {}, startedAt: null, durationMinutes: null } };
ctx.clearUntouchedCardioDays();
eq(day(today).workout.type, null, "today's untouched run cleared");
eq(day(past).workout.type, "run", "past days untouched");
S.liftingOnly = false;
eq(ctx.suggestedWorkoutType("2026-11-03", null), "run", "switching it off brings the schedule back");

// ---- v3: an already-migrated 1x5/95 deadlift becomes 3x5/135; a customized one is left alone ----
const v2 = JSON.parse(JSON.stringify(legacy));
v2.slLayoutVersion = 2;
v2.routines[2] = Object.assign(ctx.strongLiftsRoutine("B"), { id: "routine_sl_b_1" });
const v2dl = v2.routines[2].exercises.find(e => e.name === "Deadlift");
v2dl.scheme = { sets: 1, reps: 5 }; v2dl.start = { lb: 95, kg: 40 };
ctx.localStorage.setItem("cutPlanState", JSON.stringify(v2));
let m = ctx.loadState().routines[2].exercises.find(e => e.name === "Deadlift");
eq([m.scheme, m.start.lb], [{ sets: 3, reps: 5 }, 135], "v2 deadlift upgraded");
v2dl.scheme = { sets: 2, reps: 3 }; v2dl.start = { lb: 155, kg: 70 };
ctx.localStorage.setItem("cutPlanState", JSON.stringify(v2));
m = ctx.loadState().routines[2].exercises.find(e => e.name === "Deadlift");
eq([m.scheme, m.start.lb], [{ sets: 2, reps: 3 }, 155], "a deadlift you set yourself is kept");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
