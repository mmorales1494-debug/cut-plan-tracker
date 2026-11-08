// "Have extra time?": a fixed finisher plan per workout (A, B, other), in priority order,
// rotating options within a slot, owned gear only.
const ctx = require("./harness.js");
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`); }
}
const S = ctx.state;
S.weightUnit = "lb";
S.routines = [ctx.strongLiftsRoutine("A"), ctx.strongLiftsRoutine("B")];
S.routines[1].id = "routine_sl_b_x";
const [A, B] = S.routines;
S.equipment = { dumbbells: true, ezBar: true, cable: true, pullupBar: true, bands: false };
S.days = {};
const today = "2026-11-08";
const lb = w => ctx.toStorageWeight(w);
const dayOf = (routine, names = ["Squat"]) => ({ workout: { type: "resistance", routineId: routine.id, exercises: names.map(name => ({ name, sets: [] })) } });
const names = picks => picks.map(p => p.name);

// ---- the plan follows the workout, not history ----
eq(names(ctx.extraSuggestions(dayOf(A), today)), ["Skull Crusher (EZ Bar)", "Face Pull", "Pallof Press"], "A day: triceps, face pulls, core");
eq(names(ctx.extraSuggestions(dayOf(B), today)), ["Face Pull", "Cable Crunch", "Hammer Curl"], "B day: face pulls, core, grip");
eq(names(ctx.extraSuggestions({ workout: { type: "resistance", routineId: "routine_1", exercises: [] } }, today)),
   ["Face Pull", "Tricep Pushdown", "Pallof Press"], "other routines get the default finisher");
eq(ctx.extraSuggestions(dayOf(A), today).every(p => p.reason && p.label), true, "every pick explains itself");

// ---- options rotate: the least recently done one in a slot comes up ----
S.days["2026-11-04"] = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Skull Crusher (EZ Bar)", extra: true, sets: [{ weight: lb(50), reps: 10 }] },
] } };
eq(ctx.extraSuggestions(dayOf(A), today)[0].name, "Tricep Pushdown", "skull crushers last time -> pushdowns now");
S.days["2026-11-06"] = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Tricep Pushdown", extra: true, sets: [{ weight: lb(40), reps: 12 }] },
] } };
eq(ctx.extraSuggestions(dayOf(A), today)[0].name, "Tricep Kickback (Dumbbell)", "then kickbacks");
S.days["2026-11-07"] = { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Tricep Kickback (Dumbbell)", extra: true, sets: [{ weight: lb(15), reps: 12 }] },
] } };
eq(ctx.extraSuggestions(dayOf(A), today)[0].name, "Skull Crusher (EZ Bar)", "and back around");

// ---- a slot already on the day shows as added, not a second pick ----
const withFacePull = dayOf(A, ["Squat", "Face Pull"]);
const picks = ctx.extraSuggestions(withFacePull, today);
eq(picks.map(p => [p.label, p.done]), [["Triceps", false], ["Shoulder health", true], ["Core", false]], "face pulls on the day -> slot done");

// ---- gear you don't own is skipped; a slot with nothing you own drops out ----
S.equipment.cable = false;
eq(names(ctx.extraSuggestions(dayOf(B), today)), ["Hammer Curl"], "no cable, no bands: only the grip slot is left on B");
eq(ctx.extraSuggestions(dayOf(A), today).find(p => p.label === "Triceps").name !== "Tricep Pushdown", true, "no cable -> no pushdowns");
S.equipment.bands = true;
eq(ctx.extraSuggestions(dayOf(B), today)[0].name, "Band External Rotation", "bands stand in for face pulls");
S.equipment = { dumbbells: true, ezBar: true, cable: true, pullupBar: true, bands: false };

// ---- added extras open pre-filled and resolve to their own config ----
S.days = { "2026-11-01": { workout: { type: "resistance", routineId: A.id, exercises: [
  { name: "Face Pull", extra: true, sets: [{ weight: lb(30), reps: 15 }, { weight: lb(30), reps: 12 }] },
] } } };
const rows = ctx.slAccessoryRows(ctx.extraConfig("Face Pull"), today);
eq(rows.map(r => [Math.round(ctx.toDisplayWeight(r.weight)), r.reps, r.target]), [[30, "", 15], [30, "", 12], [30, "", 12]], "prefilled from last time, topped up to 3 sets");
eq(ctx.accessoryConfigFor(A, { name: "Face Pull", extra: true }).extra, true, "extras resolve to their own config");
eq(ctx.accessoryConfigFor(A, { name: "Face Pull", quickAdd: true }), null, "one-time quick adds stay plain");

// ---- every planned option exists in the catalog ----
for (const plan of ["A", "B"]) {
  const r = plan === "A" ? A : B;
  S.equipment = { dumbbells: true, ezBar: true, cable: true, pullupBar: true, bands: true };
  for (const p of ctx.extraSuggestions(dayOf(r), today)) eq(!!ctx.extraConfig(p.name), true, `${p.name} is in the catalog`);
}
ctx.localStorage.setItem("cutPlanState", JSON.stringify({ meta: {}, targets: {}, days: {}, customItems: {}, checklistItems: [], routines: [] }));
eq(ctx.loadState().equipment.cable, true, "equipment added on load");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
