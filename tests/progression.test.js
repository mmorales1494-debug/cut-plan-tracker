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

const S = ctx.state;
S.weightUnit = "lb";
S.days = {};
S.routines = [ctx.strongLiftsRoutine("A"), ctx.strongLiftsRoutine("B")];
S.routines[1].id = "routine_sl_b_x"; // ids are Date.now()-stamped; keep them distinct in-test
S.nextRoutineIndex = 0;
const [A, B] = S.routines;

// ---- template shape ----
eq(A.exercises.map(e => e.name), ["Squat", "Bench Press", "Barbell Row"], "A lifts");
eq(B.exercises.map(e => e.name), ["Squat", "Overhead Press", "Deadlift"], "B lifts");
eq(B.exercises[2].scheme, { sets: 1, reps: 5 }, "deadlift is 1x5");
eq(A.exercises[0].scheme, { sets: 5, reps: 5 }, "squat is 5x5");
eq(ctx.isStrongLifts(A), true, "A is a program routine");

// ---- helpers ----
function logSession(dateKey, lifts) {
  S.days[dateKey] = {
    workout: { type: "resistance", routineId: A.id, exercises: Object.entries(lifts).map(([name, reps]) => ({
      name, barbell: true,
      sets: reps.map(r => ({ weight: ctx.toStorageWeight(r.w), reps: r.reps })),
    })) },
  };
}
function fives(w, reps = [5, 5, 5, 5, 5]) { return reps.map(r => ({ w, reps: r })); }
const squat = A.exercises[0];
const row = A.exercises[2];
const dl = B.exercises[2];

// ---- no history: program starting weights ----
let p = ctx.slPrescription(squat, "2026-01-01");
eq(p.status, "start", "squat starts");
near(ctx.toDisplayWeight(p.weightKg), 45, "squat starts at the empty bar");
near(ctx.toDisplayWeight(ctx.slPrescription(row, "2026-01-01").weightKg), 65, "row starts at 65 lb");
near(ctx.toDisplayWeight(ctx.slPrescription(dl, "2026-01-01").weightKg), 95, "deadlift starts at 95 lb");

// ---- clean session adds weight ----
logSession("2026-01-05", { Squat: fives(185) });
p = ctx.slPrescription(squat, "2026-01-07");
eq(p.status, "up", "all reps -> add weight");
near(ctx.toDisplayWeight(p.weightKg), 190, "185 + 5 = 190");

// ---- a missed rep repeats the weight ----
logSession("2026-01-07", { Squat: fives(190, [5, 5, 5, 5, 3]) });
p = ctx.slPrescription(squat, "2026-01-09");
eq(p.status, "repeat", "missed reps -> repeat");
near(ctx.toDisplayWeight(p.weightKg), 190, "repeat 190");
eq(p.failStreak, 1, "one stall so far");

// ---- three stalls in a row -> 10% deload ----
logSession("2026-01-09", { Squat: fives(190, [5, 5, 4, 3, 3]) });
p = ctx.slPrescription(squat, "2026-01-11");
eq(p.failStreak, 2, "two stalls");
eq(p.status, "repeat", "still repeating at two stalls");
logSession("2026-01-11", { Squat: fives(190, [5, 4, 3, 3, 2]) });
p = ctx.slPrescription(squat, "2026-01-13");
eq(p.status, "deload", "third stall -> deload");
near(ctx.toDisplayWeight(p.weightKg), 170, "190 * 0.9 = 171 -> rounds down to a loadable 170");

// ---- clearing the stall resets the streak ----
logSession("2026-01-13", { Squat: fives(170) });
p = ctx.slPrescription(squat, "2026-01-15");
eq(p.status, "up", "clean session after a deload climbs again");
eq(p.failStreak, 0, "streak reset");
near(ctx.toDisplayWeight(p.weightKg), 175, "170 + 5");

// ---- a stall at a NEW weight starts a fresh count ----
logSession("2026-01-15", { Squat: fives(175, [5, 5, 5, 5, 4]) });
p = ctx.slPrescription(squat, "2026-01-17");
eq(p.failStreak, 1, "first miss at a new weight counts as one, not four");

// ---- deadlift: 1x5, +10 ----
S.days["2026-02-01"] = { workout: { type: "resistance", routineId: B.id, exercises: [
  { name: "Deadlift", barbell: true, sets: [{ weight: ctx.toStorageWeight(225), reps: 5 }] },
] } };
p = ctx.slPrescription(dl, "2026-02-02");
eq(p.status, "up", "one set of 5 completes the deadlift");
near(ctx.toDisplayWeight(p.weightKg), 235, "deadlift climbs 10 lb");
S.days["2026-02-03"] = { workout: { type: "resistance", routineId: B.id, exercises: [
  { name: "Deadlift", barbell: true, sets: [{ weight: ctx.toStorageWeight(235), reps: 4 }] },
] } };
p = ctx.slPrescription(dl, "2026-02-04");
eq(p.status, "repeat", "4 reps is a miss on 1x5");

// ---- warm-up rows typed into a set row don't read as missed work sets ----
S.days["2026-03-01"] = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Squat", barbell: true, sets: [
    { weight: ctx.toStorageWeight(45), reps: 5 },
    { weight: ctx.toStorageWeight(135), reps: 3 },
    ...fives(225).map(x => ({ weight: ctx.toStorageWeight(x.w), reps: x.reps })),
  ] },
] } };
p = ctx.slPrescription(squat, "2026-03-02");
eq(p.status, "up", "lighter rows are treated as warm-ups, not failed work sets");
near(ctx.toDisplayWeight(p.weightKg), 230, "225 + 5");

// ---- warm-up ramp ----
eq(ctx.slWarmupSets(ctx.toStorageWeight(225), squat).map(r => `${r.weight}x${r.reps}`),
   ["45x5", "45x5", "115x5", "160x3", "205x2"], "squat ramp to 225");
eq(ctx.slWarmupSets(ctx.toStorageWeight(45), squat), [], "no ramp for an empty-bar work weight");
eq(ctx.slWarmupSets(ctx.toStorageWeight(315), dl).map(r => `${r.weight}x${r.reps}`),
   ["160x5", "220x3", "285x2"], "deadlift ramp skips the empty-bar sets");

// ---- rest length follows the set ----
eq(ctx.slRestSeconds(5, 5), 90, "clean set -> 90s");
eq(ctx.slRestSeconds(4, 5), 180, "one short -> 3 min");
eq(ctx.slRestSeconds(2, 5), 300, "missed -> 5 min");

// ---- prefill lays out the work sets ----
const day = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Squat", barbell: true, sets: [] },
  { name: "Bench Press", barbell: true, sets: [] },
  { name: "Barbell Row", barbell: true, sets: [] },
] } };
ctx.slFillPrescribedSets(day, "2026-03-02");
eq(day.workout.exercises.map(e => e.sets.length), [5, 5, 5], "five rows per lift");
near(ctx.toDisplayWeight(day.workout.exercises[0].sets[0].weight), 230, "prefilled at the prescribed weight");
eq(day.workout.exercises[0].sets.every(s => s.reps === ""), true, "reps left blank to fill in");

// ---- kg mode uses kg-native increments and plate steps ----
S.weightUnit = "kg";
S.days = {};
logSession("2026-04-01", { Squat: fives(100) });
p = ctx.slPrescription(squat, "2026-04-02");
near(ctx.toDisplayWeight(p.weightKg), 102.5, "kg mode climbs 2.5 kg");
S.days = {};
logSession("2026-04-01", { Squat: fives(100, [5, 5, 4, 4, 4]) });
logSession("2026-04-03", { Squat: fives(100, [5, 4, 4, 3, 3]) });
logSession("2026-04-05", { Squat: fives(100, [4, 4, 3, 3, 2]) });
p = ctx.slPrescription(squat, "2026-04-07");
eq(p.status, "deload", "kg deload after three stalls");
near(ctx.toDisplayWeight(p.weightKg), 90, "100 kg * 0.9 = 90 kg");
S.weightUnit = "lb";

// ---- legacy routines migrate to the real protocol ----
const legacy = {
  meta: {}, targets: {}, days: {}, customItems: {}, checklistItems: [],
  routines: [{
    id: "routine_sl_a_1", name: "StrongLifts A", active: false,
    exercises: [{ name: "Squat", barbell: true }, { name: "Bench Press", barbell: true }, { name: "Barbell Row", barbell: true }],
    setTarget: { min: 5, max: 5 }, repTarget: { min: 5, max: 5 }, weightStepKg: 2.5,
  }, {
    id: "routine_sl_b_1", name: "StrongLifts B", active: false,
    exercises: [{ name: "Squat", barbell: true }, { name: "Overhead Press", barbell: true }, { name: "Deadlift", barbell: true }],
    setTarget: { min: 5, max: 5 }, repTarget: { min: 5, max: 5 }, weightStepKg: 2.5,
  }],
};
ctx.localStorage.setItem("cutPlanState", JSON.stringify(legacy));
const migrated = ctx.loadState();
eq(migrated.routines.map(r => r.program), ["stronglifts", "stronglifts"], "legacy routines pick up the program");
eq(migrated.routines[1].exercises[2].scheme, { sets: 1, reps: 5 }, "legacy 5x5 deadlift becomes 1x5");
eq(migrated.routines[0].exercises.some(e => e.name === "Band External Rotation"), false,
   "accessory auto-add leaves StrongLifts routines alone");
eq(migrated.routines[0].restSeconds, 90, "rest defaults to the program's 90s");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
