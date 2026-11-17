// Accessory Day: an optional routine picked by hand, outside the A/B rotation.
const ctx = require("./harness.js");
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; } else { fail++; console.log(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`); }
}
const lb = w => ctx.toStorageWeight(w);

// ---- migration: added once for program users, not for anyone else ----
const base = { meta: {}, targets: {}, days: {}, customItems: {}, checklistItems: [], weightUnit: "lb", slLayoutVersion: 3 };
ctx.localStorage.setItem("cutPlanState", JSON.stringify({ ...base, routines: [ctx.strongLiftsRoutine("A"), { ...ctx.strongLiftsRoutine("B"), id: "routine_sl_b_x" }] }));
ctx.state = ctx.loadState();
const S = ctx.state;
const acc = S.routines.find(r => r.accessoryDay);
eq(!!acc, true, "program users get an Accessory Day");
eq(acc.exercises.map(e => e.name), ["One-Arm Dumbbell Row", "Bulgarian Split Squat", "Back Extension", "Nordic Hamstring Curl", "Farmer Carry", "Hanging Leg Raise"], "template order");
eq(S.slLayoutVersion, 4, "version stamped");
ctx.localStorage.setItem("cutPlanState", JSON.stringify(S));
eq(ctx.loadState().routines.filter(r => r.accessoryDay).length, 1, "not added twice");
ctx.localStorage.setItem("cutPlanState", JSON.stringify({ ...base, routines: [{ id: "routine_1", name: "Full Body", active: true, exercises: [] }] }));
eq(ctx.loadState().routines.some(r => r.accessoryDay), false, "freeform-only users don't get one");

// ---- never in the rotation ----
const [A, B] = S.routines.filter(r => r.program);
eq(ctx.routinePool().map(r => r.name), ["StrongLifts A", "StrongLifts B"], "rotation pool is just A/B");
S.days = {};
S.days["2026-11-10"] = { workout: { type: "resistance", routineId: A.id, exercises: [{ name: "Squat", sets: [{ weight: lb(225), reps: 5 }] }] } };
S.days["2026-11-12"] = { workout: { type: "resistance", routineId: acc.id, exercises: [{ name: "Back Extension", sets: [{ weight: "", reps: 12 }] }] } };
eq(ctx.nextRoutineFor("2026-11-14").id, B.id, "a logged Accessory Day doesn't count as the next A/B session");

// ---- picking it lays out its exercises, pre-filled ----
const day = { workout: { type: "resistance", routineId: A.id, exercises: [], core: [] } };
ctx.setDayRoutine(day, acc, "2026-11-14");
eq(day.workout.exercises.map(e => e.name).length, 6, "all six exercises");
const back = day.workout.exercises.find(e => e.name === "Back Extension");
eq(back.sets.map(s => [s.reps, s.target]), [["", 12], ["", 12], ["", 12]], "back extensions from last time (12)");
const carry = day.workout.exercises.find(e => e.name === "Farmer Carry");
eq(carry.sets.map(s => s.target), [40, 40, 40], "carries default to 40 s");
eq(!!ctx.accessoryConfigFor(acc, { name: "Farmer Carry" }), true, "its exercises render as accessories");
eq(ctx.strongLiftsConfig(acc, "Squat"), null, "and none of them as program lifts");

// ---- a day on Accessory isn't re-synced back to A/B ----
const today = ctx.formatDateKey(new Date());
S.days = {};
S.days[today] = { workout: { type: "resistance", routineId: acc.id, exercises: acc.exercises.map(e => ({ name: e.name, sets: [] })) } };
eq(ctx.slResyncDayRoutine(S.days[today], today), false, "today stays an Accessory Day");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
