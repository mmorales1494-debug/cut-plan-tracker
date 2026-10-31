const ctx = require("./harness.js");
let pass = 0, fail = 0;
function eq(a, b, label) {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else { fail++; console.log(`FAIL ${label}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
}
function near(a, b, label) {
  if (Math.abs(a - b) < 0.01) pass++;
  else { fail++; console.log(`FAIL ${label}: expected ~${b}, got ${a}`); }
}

const S = ctx.state;
S.weightUnit = "lb";
S.days = {};
S.routines = [ctx.strongLiftsRoutine("A"), ctx.strongLiftsRoutine("B")];
S.routines[1].id = "routine_sl_b_x";
const A = S.routines[0];

function slSession(dateKey, weight, reps) {
  S.days[dateKey] = { workout: { type: "resistance", routineId: A.id, exercises: [
    { name: "Squat", barbell: true, sets: reps.map(r => ({ weight: ctx.toStorageWeight(weight), reps: r })) },
  ] } };
}

// A future day written on Monday, trained on Friday, with two sessions logged in between.
slSession("2026-06-01", 200, [5, 5, 5, 5, 5]);
const future = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Squat", barbell: true, sets: [] },
] } };
ctx.slFillPrescribedSets(future, "2026-06-08");
near(ctx.toDisplayWeight(future.workout.exercises[0].sets[0].weight), 205, "written ahead at 205");
eq(future.workout.exercises[0].sets.every(s => s.prescribed), true, "rows are flagged as prescribed");

slSession("2026-06-03", 205, [5, 5, 5, 5, 5]);
slSession("2026-06-05", 210, [5, 5, 5, 5, 5]);
ctx.slResyncPrescribedSets(future, "2026-06-08");
near(ctx.toDisplayWeight(future.workout.exercises[0].sets[0].weight), 215, "re-derived to 215 when the day is opened");

// A weight you set by hand is never re-derived.
future.workout.exercises[0].sets.forEach(s => { s.weight = ctx.toStorageWeight(185); delete s.prescribed; });
slSession("2026-06-07", 215, [5, 5, 5, 5, 5]);
ctx.slResyncPrescribedSets(future, "2026-06-08");
near(ctx.toDisplayWeight(future.workout.exercises[0].sets[0].weight), 185, "hand-entered weight is left alone");

// Neither is a session you have already started logging.
const started = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Squat", barbell: true, sets: [] },
] } };
ctx.slFillPrescribedSets(started, "2026-06-08");
started.workout.exercises[0].sets[0].reps = 5;
const before = started.workout.exercises[0].sets[0].weight;
slSession("2026-06-07", 300, [5, 5, 5, 5, 5]);
ctx.slResyncPrescribedSets(started, "2026-06-08");
eq(started.workout.exercises[0].sets[0].weight, before, "a session with reps logged is left alone");

// Switching units re-prescribes in loadable weights for that unit.
S.days = {};
slSession("2026-07-01", 100, [5, 5, 5, 5, 5]); // 100 lb
const unitDay = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Squat", barbell: true, sets: [] },
] } };
ctx.slFillPrescribedSets(unitDay, "2026-07-03");
near(ctx.toDisplayWeight(unitDay.workout.exercises[0].sets[0].weight), 105, "105 lb in lb mode");
S.weightUnit = "kg";
ctx.slResyncPrescribedSets(unitDay, "2026-07-03");
near(ctx.toDisplayWeight(unitDay.workout.exercises[0].sets[0].weight), 47.5, "45.4 kg + 2.5 -> a loadable 47.5 kg");
S.weightUnit = "lb";

// Freeform routines are untouched by the re-sync.
S.routines = [ctx.defaultRoutine()];
const freeform = { workout: { type: "resistance", routineId: "routine_1", exercises: [
  { name: "Goblet Squat", barbell: false, sets: [{ weight: ctx.toStorageWeight(70), reps: "" }] },
] } };
ctx.slResyncPrescribedSets(freeform, "2026-07-03");
near(ctx.toDisplayWeight(freeform.workout.exercises[0].sets[0].weight), 70, "freeform day untouched");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
