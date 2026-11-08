// "Have extra time?": ranks add-ons by what's furthest behind over two weeks, owned gear only.
const ctx = require("./harness.js");
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`); }
}
const S = ctx.state;
S.weightUnit = "lb";
S.routines = [ctx.strongLiftsRoutine("A"), ctx.strongLiftsRoutine("B")];
S.equipment = { dumbbells: true, ezBar: true, cable: true, pullupBar: true, bands: false };
const today = "2026-11-08";
const lb = w => ctx.toStorageWeight(w);
const sets = (n, w, r) => Array.from({ length: n }, () => ({ weight: lb(w), reps: r }));
function lift(k, exercises) {
  S.days[k] = { workout: { type: "resistance", routineId: S.routines[0].id, exercises, core: [] } };
}

// two weeks of short sessions: squat, bench/press, pull-ups, curls — no face pulls, triceps or core
S.days = {};
for (const k of ["2026-10-27", "2026-10-30", "2026-11-03", "2026-11-06"]) {
  lift(k, [
    { name: "Squat", sets: sets(5, 225, 5) },
    { name: "Bench Press", sets: sets(5, 170, 5) },
    { name: "Pull-Up", sets: sets(3, 0, 8) },
    { name: "Bicep Curl (Dumbbell)", sets: sets(3, 25, 10) },
  ]);
}
lift("2026-10-01", [{ name: "Face Pull", sets: sets(3, 30, 15) }]); // outside the window

const vol = ctx.recentMuscleVolume(today);
eq(vol.rearDelts || 0, 0, "face pulls from October don't count");
eq(vol.triceps, 10, "bench sets count half toward triceps (20 sets -> 10)");
eq(vol.biceps, 12 + 6, "curls 12 + pull-ups 12 * 0.5");

const day = { workout: { type: "resistance", exercises: [{ name: "Squat", sets: [] }] } };
let picks = ctx.extraSuggestions(day, today);
eq(picks.map(p => p.group), ["rearDelts", "core", "sideDelts"], "furthest-behind groups first, one each");
eq(picks[0].name, "Face Pull", "face pulls lead");
eq(picks.every(p => p.done < p.target), true, "only groups below target");

// owned equipment only: no cable -> no face pulls / pallof / crunches
S.equipment.cable = false;
picks = ctx.extraSuggestions(day, today);
eq(picks.some(p => ["Face Pull", "Pallof Press", "Cable Crunch", "Tricep Pushdown", "Seated Cable Row"].includes(p.name)), false, "no cable exercises without a cable");
S.equipment.cable = true;

// already on the day -> not suggested; the group's next option takes its place only if it has one
day.workout.exercises.push({ name: "Face Pull", extra: true, sets: [] });
picks = ctx.extraSuggestions(day, today);
eq(picks.some(p => p.name === "Face Pull"), false, "an extra already added isn't suggested again");

// rotation inside a group: the less recently done triceps option comes first
S.days = {};
lift("2026-11-05", [{ name: "Skull Crusher (EZ Bar)", sets: sets(1, 50, 10) }]);
const tri = ctx.extraCandidatesByGroup({ workout: { exercises: [] } }, today).find(p => p.group === "triceps");
eq(tri && tri.name !== "Skull Crusher (EZ Bar)", true, "skull crushers were just done, so another triceps option leads");

// an added extra opens like an accessory: last time's weights, reps as the target
S.days = {};
lift("2026-11-01", [{ name: "Face Pull", extra: true, sets: [{ weight: lb(30), reps: 15 }, { weight: lb(30), reps: 12 }] }]);
const rows = ctx.slAccessoryRows(ctx.extraConfig("Face Pull"), today);
eq(rows.map(r => [Math.round(ctx.toDisplayWeight(r.weight)), r.reps, r.target]), [[30, "", 15], [30, "", 12], [30, "", 12]], "prefilled from last time, topped up to 3 sets");
eq(ctx.accessoryConfigFor(S.routines[0], { name: "Face Pull", extra: true }).extra, true, "extras resolve to their own config");
eq(ctx.accessoryConfigFor(S.routines[0], { name: "Face Pull", quickAdd: true }), null, "one-time quick adds stay plain");

// covered everywhere -> nothing to suggest
S.days = {};
lift("2026-11-07", [
  "Face Pull", "Band External Rotation", "Skull Crusher (EZ Bar)", "Pallof Press", "Seated Cable Row",
  "Hammer Curl", "Lateral Raise", "Pull-Up",
].map(name => ({ name, sets: sets(20, 20, 10) })));
eq(ctx.extraSuggestions({ workout: { exercises: [] } }, today), [], "nothing behind -> no suggestions");

ctx.localStorage.setItem("cutPlanState", JSON.stringify({ meta: {}, targets: {}, days: {}, customItems: {}, checklistItems: [], routines: [] }));
eq(ctx.loadState().equipment.cable, true, "equipment added on load");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
