const ctx = require("./harness.js");
const vm = require("vm");
let fail = 0;
function check(label, fn) {
  try {
    const html = fn();
    if (typeof html !== "string" || html.includes("undefined,") || /\[object Object\]/.test(html)) {
      console.log(`SUSPECT ${label}: ${String(html).slice(0, 300)}`); fail++;
    } else { console.log(`ok   ${label} (${html.length} chars)`); }
    return html;
  } catch (e) { console.log(`THROW ${label}: ${e.message}`); fail++; return ""; }
}

const S = ctx.state;
S.weightUnit = "lb";
S.days = {};
S.routines = [ctx.strongLiftsRoutine("A"), ctx.strongLiftsRoutine("B")];
S.routines[1].id = "routine_sl_b_x";
S.nextRoutineIndex = 0;
S.weeklySchedule = { 0: null, 1: "resistance", 2: "run", 3: "boulder", 4: "resistance", 5: "run", 6: "boulder" };

vm.runInContext('viewDate = "2026-05-08";', ctx);

const day = {
  scheduledActivity: "resistance",
  meals: {}, water: { oz: 0 }, supplements: {},
  workout: {
    type: "resistance", routineId: S.routines[0].id,
    exercises: [
      { name: "Squat", barbell: true, sets: [] },
      { name: "Bench Press", barbell: true, sets: [] },
      { name: "Barbell Row", barbell: true, sets: [] },
    ],
    core: [], run: { miles: "", minutes: "" },
    boulder: { minutes: "", climbs: [], sessionType: null, warmupDone: [], grid: [], rating: null },
    startedAt: null, durationMinutes: null,
  },
  weightAM: null, weightPM: null, waist: null, maxHangTest: null, notes: "",
  completed: false, steps: null, stretchIds: [], stretchesDone: {},
};
S.days["2026-05-08"] = day;

const empty = check("workout body — empty StrongLifts A day", () => ctx.renderWorkoutBody(day));
console.log(/Load 5×5 @ 45 lb/.test(empty) ? "  ✓ offers to load the prescribed sets" : "  ✗ missing load button");
console.log(/Load 1×5 @/.test(empty) ? "  ✓ deadlift-style 1×5 label available" : "  (A has no 1×5 lift — expected)");

ctx.slFillPrescribedSets(day, "2026-05-08");
const filled = check("workout body — prescribed sets loaded", () => ctx.renderWorkoutBody(day));
console.log(/Working weight/.test(filled) ? "  ✓ single working-weight field" : "  ✗ no working-weight field");
console.log(/slLogSet/.test(filled) ? "  ✓ per-set check buttons" : "  ✗ no check buttons");
console.log(/No history yet/.test(filled) ? "  ✓ first-session note" : "  ✗ note missing");

// a session with history, mid-program
S.days["2026-05-01"] = { workout: { type: "resistance", routineId: S.routines[0].id, exercises: [
  { name: "Squat", barbell: true, sets: Array.from({ length: 5 }, () => ({ weight: ctx.toStorageWeight(225), reps: 5 })) },
] } };
day.workout.exercises[0].sets = [];
ctx.slFillPrescribedSets(day, "2026-05-08");
const mid = check("workout body — mid-program squat", () => ctx.renderWorkoutBody(day));
console.log(/Warm-up, not logged/.test(mid) ? "  ✓ warm-up ramp shown" : "  ✗ ramp missing");
console.log(/Today: 5×5 @ 230 lb, up 5 lb/.test(mid) ? "  ✓ prescribes 230 lb" : "  ✗ wrong prescription");

check("program card", () => ctx.renderStrongLiftsProgramCard());
const rm = check("routine manager", () => ctx.renderRoutineManager());
console.log(/setSlExerciseField/.test(rm) ? "  ✓ per-lift editors" : "  ✗ per-lift editors missing");
console.log(/Set Mon \/ Wed \/ Fri/.test(rm) ? "  ✓ schedule fix offered (2 resistance days)" : "  ✗ schedule prompt missing");
check("workouts tab", () => ctx.renderWorkouts());

// freeform routine still renders the old way
S.routines = [ctx.defaultRoutine()];
day.workout.routineId = "routine_1";
day.workout.exercises = [{ name: "Goblet Squat", barbell: false, sets: [{ weight: ctx.toStorageWeight(70), reps: 10 }] }];
const free = check("workout body — freeform routine", () => ctx.renderWorkoutBody(day));
console.log(/Target: 3-4 sets × 8-12 reps/.test(free) ? "  ✓ rep-range behavior untouched" : "  ✗ freeform path changed");
check("routine manager — freeform", () => ctx.renderRoutineManager());

process.exit(fail ? 1 : 0);
