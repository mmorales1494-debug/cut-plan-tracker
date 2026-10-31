const ctx = require("./harness.js");
const vm = require("vm");
let fail = 0;
const S = ctx.state;
S.weightUnit = "lb";
S.days = {};
S.routines = [ctx.strongLiftsRoutine("A"), ctx.strongLiftsRoutine("B")];
S.routines[1].id = "routine_sl_b_x";
vm.runInContext('viewDate = "2026-08-03";', ctx);

const day = { workout: { type: "resistance", routineId: S.routines[0].id, exercises: [
  { name: "Squat", barbell: true, sets: [] },
  // Same name, but added for today only — must stay a plain one-time entry.
  { name: "Squat", barbell: true, quickAdd: true, sets: [{ weight: ctx.toStorageWeight(95), reps: 12 }] },
], core: [], run: {}, boulder: { climbs: [], warmupDone: [], grid: [] } } };
S.days["2026-08-03"] = day;

ctx.slFillPrescribedSets(day, "2026-08-03");
if (day.workout.exercises[1].sets.length !== 1) { console.log("FAIL quick add was prefilled"); fail++; }
const html = ctx.renderWorkoutBody(day);
if (!/removeQuickAddExercise/.test(html)) { console.log("FAIL quick add lost its remove button"); fail++; }
if ((html.match(/data-action="slSetWorkWeight"/g) || []).length !== 1) { console.log("FAIL wrong number of program blocks"); fail++; }
console.log(fail ? `${fail} failed` : "quick-add guard ok");
process.exit(fail ? 1 : 0);
