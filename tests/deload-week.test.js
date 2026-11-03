// "Take a deload week": 7 days at 90%, those sessions don't count, then pick up where you left off.
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
S.routines = [ctx.strongLiftsRoutine("A"), ctx.strongLiftsRoutine("B")];
S.routines[1].id = "routine_sl_b_x";
const [A] = S.routines;
const squat = A.exercises[0];
const lb = w => ctx.toStorageWeight(w);
const show = kg => ctx.toDisplayWeight(kg);
const today = ctx.formatDateKey(new Date());
function session(k, weight, reps) {
  S.days[k] = { workout: { type: "resistance", routineId: A.id, exercises: [
    { name: "Squat", barbell: true, sets: reps.map(r => ({ weight: lb(weight), reps: r })) },
  ] } };
}

S.days = {};
S.deloadWeeks = [];
session(ctx.addDays(today, -2), 225, [5, 5, 5, 5, 5]);
near(show(ctx.slPrescription(squat, today).weightKg), 230, "normally 230 next");

ctx.startDeloadWeek();
eq(S.deloadWeeks.length, 1, "week recorded");
eq(S.deloadWeeks[0].end, ctx.addDays(today, 6), "7 days including today");
eq(S.lastDeloadDate, today, "reminder resets");
let p = ctx.slPrescription(squat, today);
eq(p.status, "deloadWeek", "status");
near(show(p.weightKg), 205, "90% of 230 = 207, rounded down to 205");
near(show(p.normalKg), 230, "remembers the normal weight");
eq(/Deload week/.test(ctx.slProgressionNote(p, squat)), true, "note says so");
ctx.startDeloadWeek();
eq(S.deloadWeeks.length, 1, "starting again mid-week does nothing");

// light sessions inside the week — even a bad one — don't count
session(today, 205, [5, 5, 5, 5, 5]);
session(ctx.addDays(today, 2), 205, [5, 3, 2, 1, 1]);
session(ctx.addDays(today, 4), 205, [2, 2, 2, 2, 2]);
p = ctx.slPrescription(squat, ctx.addDays(today, 5));
eq(p.status, "deloadWeek", "still deload week on day 6");
p = ctx.slPrescription(squat, ctx.addDays(today, 7));
eq(p.status, "up", "after the week: back to the program");
near(show(p.weightKg), 230, "picks up exactly where it left off");
eq(p.failStreak, 0, "the bad deload session didn't start a stall");

// ending early: days already in it keep not counting, later days are normal again
S.days = {};
S.deloadWeeks = [{ start: ctx.addDays(today, -3), end: ctx.addDays(today, 3) }];
session(ctx.addDays(today, -5), 225, [5, 5, 5, 5, 5]);
session(ctx.addDays(today, -2), 205, [5, 5, 4, 4, 3]);
ctx.endDeloadWeek();
eq(S.deloadWeeks[0].end, ctx.addDays(today, -1), "week ends yesterday");
p = ctx.slPrescription(squat, today);
eq([p.status, show(p.weightKg)], ["up", 230], "today normal; the short deload session still ignored");
S.deloadWeeks = [];
ctx.startDeloadWeek();
ctx.endDeloadWeek();
eq(S.deloadWeeks, [], "a week started and ended the same day disappears");

// migration adds the field
ctx.localStorage.setItem("cutPlanState", JSON.stringify({ meta: {}, targets: {}, days: {}, customItems: {}, checklistItems: [], routines: [] }));
eq(ctx.loadState().deloadWeeks, [], "deloadWeeks added on load");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
