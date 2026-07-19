// Cut Plan Tracker — all app logic. Vanilla JS, no build step.

const STORAGE_KEY = "cutPlanState";
const PHOTO_DB = "cutPlanPhotos";
const PHOTO_STORE = "photos";

let state = loadState();
let currentTab = "today";
let viewDate = formatDateKey(new Date());

// ---------- persistence ----------

function defaultRoutine() {
  return {
    id: "routine_1",
    name: "Full Body",
    active: true,
    exercises: RESISTANCE_EXERCISES.map(name => ({ name, barbell: false })),
    setTarget: { ...SET_TARGET },
    repTarget: { ...REP_TARGET },
    weightStepKg: WEIGHT_STEP_KG,
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.customItems) parsed.customItems = {};
      if (!parsed.weeklySchedule) parsed.weeklySchedule = { ...WEEKLY_SCHEDULE };
      if (!parsed.mealTemplates) parsed.mealTemplates = JSON.parse(JSON.stringify(MEAL_TEMPLATES));
      if (!parsed.weightUnit) parsed.weightUnit = "kg";
      if (!parsed.routines || !parsed.routines.length) parsed.routines = [defaultRoutine()];
      parsed.routines.forEach(r => { if (r.active === undefined) r.active = true; });
      // backward compat: routine exercises used to be plain name strings, now {name, barbell}
      parsed.routines.forEach(r => {
        r.exercises = r.exercises.map(ex => typeof ex === "string" ? { name: ex, barbell: false } : ex);
      });
      if (!parsed.routines.some(r => r.active)) parsed.routines[0].active = true;
      if (parsed.nextRoutineIndex === undefined) parsed.nextRoutineIndex = 0;
      if (parsed.targets.fat === undefined) parsed.targets.fat = DEFAULT_TARGETS.fat;
      if (parsed.targets.carbs === undefined) parsed.targets.carbs = DEFAULT_TARGETS.carbs;
      for (const item of Object.values(parsed.customItems)) {
        if (item.fat === undefined) item.fat = 0;
        if (item.carbs === undefined) item.carbs = 0;
      }
      if (!parsed.checklistItems) parsed.checklistItems = SUPPLEMENTS.map(s => ({ ...s }));
      // backward compat: old checklist items predating the recurring flag default to recurring (matches old behavior)
      parsed.checklistItems.forEach(item => { if (item.recurring === undefined) item.recurring = true; });
      // migrate the old perpetual to-do list into the merged checklist as one-time items
      if (parsed.todos && parsed.todos.length) {
        for (const t of parsed.todos) {
          parsed.checklistItems.push({ id: "todo_" + t.id, label: t.text, recurring: false });
        }
      }
      delete parsed.todos;
      return parsed;
    } catch (e) { /* fall through to fresh state */ }
  }
  return {
    meta: { startDate: PLAN_START },
    targets: { ...DEFAULT_TARGETS },
    days: {},
    checkIns: [],
    checklistItems: SUPPLEMENTS.map(s => ({ ...s })),
    customItems: {},
    weeklySchedule: { ...WEEKLY_SCHEDULE },
    mealTemplates: JSON.parse(JSON.stringify(MEAL_TEMPLATES)),
    weightUnit: "kg",
    routines: [defaultRoutine()],
    nextRoutineIndex: 0,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ---------- date helpers ----------

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseKey(k) {
  return new Date(k + "T12:00:00");
}

function addDays(k, delta) {
  const d = parseKey(k);
  d.setDate(d.getDate() + delta);
  return formatDateKey(d);
}

function dayNumberFor(k) {
  const start = parseKey(PLAN_START);
  const cur = parseKey(k);
  return Math.round((cur - start) / 86400000) + 1;
}

function niceDate(k) {
  const d = parseKey(k);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ---------- day model ----------

function emptyMealsFromTemplate() {
  const meals = {};
  for (const mealName of Object.keys(state.mealTemplates)) {
    meals[mealName] = {};
    for (const id of Object.keys(state.mealTemplates[mealName])) meals[mealName][id] = 0;
  }
  return meals;
}

function routineForDay(day) {
  return state.routines.find(r => r.id === day.workout.routineId) ||
    { name: "", setTarget: SET_TARGET, repTarget: REP_TARGET, weightStepKg: WEIGHT_STEP_KG };
}

function populateResistanceExercises(day) {
  const active = state.routines.filter(r => r.active);
  const pool = active.length ? active : state.routines;
  const idx = state.nextRoutineIndex % pool.length;
  const routine = pool[idx];
  day.workout.exercises = routine.exercises.map(ex => ({ name: ex.name, barbell: !!ex.barbell, sets: [] }));
  day.workout.routineId = routine.id;
  state.nextRoutineIndex = (idx + 1) % pool.length;
}

function getOrCreateDay(dateKey) {
  if (!state.days[dateKey]) {
    const dow = parseKey(dateKey).getDay();
    const scheduled = state.weeklySchedule[dow];
    state.days[dateKey] = {
      scheduledActivity: scheduled,
      meals: emptyMealsFromTemplate(),
      water: { quarterBottles: 0 },
      supplements: {},
      workout: {
        type: scheduled || null,
        exercises: [],
        routineId: null,
        core: scheduled === "run" ? CORE_EXERCISES.map(ce => ({ name: ce.name, type: ce.type, sets: [] })) : [],
        run: { miles: "", minutes: "" },
        boulder: { minutes: "" },
      },
      weight: null,
      waist: null,
      notes: "",
      completed: false,
      steps: null,
    };
    if (scheduled === "resistance") populateResistanceExercises(state.days[dateKey]);
    saveState();
  }
  return state.days[dateKey];
}

function isTrainingDay(day) {
  return day.workout.type === "resistance" || day.workout.type === "run" || day.workout.type === "boulder";
}

function itemDef(id) {
  return ITEM_CATALOG[id] || state.customItems[id];
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function ringSVG(pct, color) {
  const r = 24, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);
  return `<svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="6"/><circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>`;
}

function workoutStatusLabel(day) {
  const w = day.workout;
  if (!w.type || w.type === "rest") return "Rest day";
  if (w.type === "resistance") {
    const done = w.exercises.filter(ex => ex.sets.length > 0).length;
    return `${done}/${w.exercises.length} exercises`;
  }
  if (w.type === "run") {
    const cardioDone = Number(w.run.miles) > 0 && Number(w.run.minutes) > 0;
    const coreDoneCount = w.core.filter(ex => ex.sets.length > 0).length;
    if (cardioDone && coreDoneCount === w.core.length) return "Done";
    if (!cardioDone && coreDoneCount === 0) return "Not started";
    return "In progress";
  }
  if (w.type === "boulder") return Number(w.boulder.minutes) > 0 ? "Done" : "Not started";
  return "—";
}

function mealTotals(meal) {
  let cal = 0, protein = 0, fat = 0, carbs = 0;
  for (const [id, qty] of Object.entries(meal)) {
    const item = itemDef(id);
    if (!item || !qty) continue;
    cal += item.cal * qty;
    protein += item.protein * qty;
    fat += (item.fat || 0) * qty;
    carbs += (item.carbs || 0) * qty;
  }
  return { cal, protein, fat, carbs };
}

function dayTotals(day) {
  let cal = 0, protein = 0, fat = 0, carbs = 0;
  for (const mealName of Object.keys(day.meals)) {
    const t = mealTotals(day.meals[mealName]);
    cal += t.cal;
    protein += t.protein;
    fat += t.fat;
    carbs += t.carbs;
  }
  return { cal, protein, fat, carbs };
}

// ---------- rendering shell ----------

function render() {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === currentTab));
  const root = document.getElementById("view-root");
  const day = getOrCreateDay(viewDate);
  document.getElementById("day-counter").textContent = niceDate(viewDate);

  if (currentTab === "today") root.innerHTML = renderToday(day);
  else if (currentTab === "workouts") root.innerHTML = renderWorkouts();
  else if (currentTab === "progress") root.innerHTML = renderProgressShell();
  else if (currentTab === "checkin") root.innerHTML = renderCheckin();

  if (currentTab === "progress") hydrateProgress();
}

// ---------- Today tab ----------

function formatBottles(b) {
  const rounded = Math.round(b * 100) / 100;
  return `${rounded} bottle${rounded === 1 ? "" : "s"}`;
}

function formatWaterTarget(t) {
  return t.min === t.max ? `${t.min}` : `${t.min}-${t.max}`;
}

function kgToLb(kg) {
  return Math.round(kg * KG_TO_LB * 10) / 10;
}

function lbToKg(lb) {
  return Math.round((lb / KG_TO_LB) * 10) / 10;
}

// All weights are stored in kg internally regardless of preference — these two
// helpers are the only place that converts to/from the unit the user sees and types.
function toDisplayWeight(kg) {
  if (kg === "" || kg === null || kg === undefined) return "";
  return state.weightUnit === "lb" ? kgToLb(kg) : Math.round(kg * 10) / 10;
}

function toStorageWeight(displayVal) {
  if (displayVal === "" || displayVal === null || displayVal === undefined) return "";
  const num = Number(displayVal);
  // Keep extra precision here (not rounded to 1dp like the display helpers) so a
  // lb entry that round-trips through kg storage doesn't drift off its plate match
  // (e.g. 135 lb -> kg -> lb landing on 134.9 and missing the exact 45s-per-side).
  const kg = state.weightUnit === "lb" ? num / KG_TO_LB : num;
  return Math.round(kg * 1000) / 1000;
}

function formatKgLb(kg) {
  if (state.weightUnit === "lb") return `${kgToLb(kg)} lb (${Math.round(kg * 10) / 10} kg)`;
  return `${kg} kg (${kgToLb(kg)} lb)`;
}

function activityLabel(type) {
  return { resistance: "Resistance", run: "Run + Core", boulder: "Bouldering", rest: "Rest" }[type] || "Not set";
}

const MEAL_ORDER = Object.keys(MEAL_TEMPLATES);
const MEAL_TITLES = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", extra: "Extra / swaps" };
const MEAL_TAB_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", extra: "Extra" };
let mealTabIndex = 0;

function renderMealSwipeCard(day) {
  const mealName = MEAL_ORDER[mealTabIndex];
  return `
    <div class="card">
      <div class="toggle-pill">
        ${MEAL_ORDER.map((m, i) => `<button data-action="setMealTab" data-idx="${i}" class="${i === mealTabIndex ? "active" : ""}">${MEAL_TAB_LABELS[m]}</button>`).join("")}
      </div>
      <div class="meal-swipe-area" data-swipe="meal" style="margin-top:12px;">
        ${renderMealInner(day, mealName, MEAL_TITLES[mealName])}
      </div>
    </div>`;
}

let quickAddOpen = false;
let editDefaultsOpen = false;

function renderMealDefaultsEditor(mealName) {
  const template = state.mealTemplates[mealName] || {};
  const entries = Object.entries(template);
  const rows = entries.length ? entries.map(([id, qty]) => {
    const item = itemDef(id);
    if (!item) return "";
    return `
      <div class="meal-item">
        <div class="meal-item-label">${item.label}</div>
        <div class="stepper">
          <button data-action="templateQty" data-meal="${mealName}" data-item="${id}" data-delta="-1">−</button>
          <div class="qty">${qty}</div>
          <button data-action="templateQty" data-meal="${mealName}" data-item="${id}" data-delta="1">+</button>
        </div>
      </div>`;
  }).join("") : `<div class="empty-state">No planned items — add one below</div>`;

  const allIds = [...Object.keys(ITEM_CATALOG), ...Object.keys(state.customItems)];
  const notInTemplate = allIds.filter(id => !(id in template));
  const options = notInTemplate.map(id => `<option value="${id}">${itemDef(id).label}</option>`).join("");

  return `
    <div class="quick-add-form">
      <div class="meal-item-macro" style="margin-bottom:8px;">Editing the planned defaults for this meal — used by "Log as planned" and shown as the hint next to each item.</div>
      ${rows}
      <div class="add-item-row" style="display:flex; gap:8px; margin-top:8px;">
        <select id="template-add-${mealName}" style="flex:1;">
          <option value="">+ add to defaults…</option>
          ${options}
        </select>
        <button class="btn secondary" data-action="addTemplateItem" data-meal="${mealName}">Add</button>
      </div>
    </div>
  `;
}

function renderMealInner(day, mealName, title) {
  const meal = day.meals[mealName];
  const template = state.mealTemplates[mealName] || {};
  const totals = mealTotals(meal);
  const entries = Object.entries(meal);
  const rows = entries.length ? entries.map(([id, qty]) => {
    const item = itemDef(id);
    const planned = template[id];
    return `
      <div class="meal-item">
        <div>
          <div class="meal-item-label">${item.label}</div>
          <div class="meal-item-macro">${item.cal * qty} cal · ${item.protein * qty}g protein · ${round1((item.carbs || 0) * qty)}g carbs · ${round1((item.fat || 0) * qty)}g fat${planned ? ` · planned ${planned}` : ""}</div>
        </div>
        <div class="stepper">
          <button data-action="mealQty" data-meal="${mealName}" data-item="${id}" data-delta="-1">−</button>
          <div class="qty">${qty}</div>
          <button data-action="mealQty" data-meal="${mealName}" data-item="${id}" data-delta="1">+</button>
        </div>
      </div>`;
  }).join("") : `<div class="empty-state">Nothing planned — add an item below</div>`;

  const allIds = [...Object.keys(ITEM_CATALOG), ...Object.keys(state.customItems)];
  const notInMeal = allIds.filter(id => !(id in meal));
  const options = notInMeal.map(id => `<option value="${id}">${itemDef(id).label}</option>`).join("");
  const hasTemplate = Object.keys(template).length > 0;

  return `
    <div class="row"><h3>${title}</h3><span class="meal-item-macro">${totals.cal} cal · ${totals.protein}g P · ${round1(totals.carbs)}g C · ${round1(totals.fat)}g F</span></div>
    ${rows}
    <div class="add-item-row" style="display:flex; gap:8px;">
      <select data-action="mealAdd" data-meal="${mealName}" style="flex:1;">
        <option value="">+ add item…</option>
        ${options}
      </select>
      ${hasTemplate ? `<button class="btn secondary" data-action="mealLogPlanned" data-meal="${mealName}">Log as planned</button>` : ""}
    </div>
    <div style="margin-top:8px;">
      <button class="btn secondary" data-action="toggleQuickAdd" style="width:100%;">${quickAddOpen ? "Cancel quick add" : "+ Quick add by macros"}</button>
      ${quickAddOpen ? `
        <div class="quick-add-form">
          <div class="field"><label>Name</label><input type="text" id="quickadd-name" placeholder="e.g. Family Mart onigiri"></div>
          <div class="two-col">
            <div class="field"><label>Calories</label><input type="number" inputmode="numeric" id="quickadd-cal" placeholder="cal"></div>
            <div class="field"><label>Protein (g)</label><input type="number" inputmode="numeric" id="quickadd-protein" placeholder="g"></div>
          </div>
          <div class="two-col">
            <div class="field"><label>Carbs (g)</label><input type="number" inputmode="numeric" id="quickadd-carbs" placeholder="g"></div>
            <div class="field"><label>Fat (g)</label><input type="number" inputmode="numeric" id="quickadd-fat" placeholder="g"></div>
          </div>
          <button class="btn" data-action="submitQuickAdd" data-meal="${mealName}" style="width:100%;">Add to ${title}</button>
        </div>
      ` : ""}
    </div>
    <div style="margin-top:8px;">
      <button class="btn secondary" data-action="toggleEditDefaults" style="width:100%;">${editDefaultsOpen ? "Done editing defaults" : "Edit planned defaults"}</button>
      ${editDefaultsOpen ? renderMealDefaultsEditor(mealName) : ""}
    </div>`;
}

function renderToday(day) {
  const totals = dayTotals(day);
  const calTarget = isTrainingDay(day) ? state.targets.calTrain : state.targets.calRest;
  const proteinTarget = state.targets.protein;
  const waterTarget = waterTargetFor(day.workout.type);
  const bottles = day.water.quarterBottles / 4;
  const waterPct = Math.min(100, Math.round((bottles / waterTarget.max) * 100));

  const activityBadgeClass = day.workout.type || "rest";

  const fatTarget = state.targets.fat;
  const carbsTarget = state.targets.carbs;
  const rings = [
    { label: "cal", value: Math.round(totals.cal), target: calTarget, color: MACRO_RING_COLORS.cal, suffix: "" },
    { label: "protein", value: Math.round(totals.protein), target: proteinTarget, color: MACRO_RING_COLORS.protein, suffix: "g" },
    { label: "carbs", value: Math.round(totals.carbs), target: carbsTarget, color: MACRO_RING_COLORS.carbs, suffix: "g" },
    { label: "fat", value: round1(totals.fat), target: fatTarget, color: MACRO_RING_COLORS.fat, suffix: "g" },
  ];

  const isToday = viewDate === formatDateKey(new Date());

  return `
    <div class="card">
      <div class="row">
        <button class="btn secondary" data-action="navDay" data-delta="-1">← Prev</button>
        <span class="badge ${activityBadgeClass}">${activityLabel(day.workout.type)}</span>
        <button class="btn secondary" data-action="navDay" data-delta="1">Next →</button>
      </div>
      ${!isToday ? `<div class="row" style="margin-top:8px;"><button class="btn secondary" data-action="jumpToday" style="width:100%;">Jump to Today</button></div>` : ""}
      <div class="row" style="margin-top:12px;">
        <h2 style="margin:0;">Nutrition</h2>
        ${day.completed ? `<span class="meal-item-macro">✓ Complete</span>` : ""}
      </div>
      <div class="ring-row">
        ${rings.map(r => `
          <div class="ring-item">
            ${ringSVG((r.value / r.target) * 100, r.color)}
            <div class="ring-value">${r.value}/${r.target}${r.suffix}</div>
            <div class="ring-label">${r.label}</div>
          </div>
        `).join("")}
      </div>
      <div class="pill-row">
        <div class="activity-chip">Workout — ${workoutStatusLabel(day)}</div>
        <div class="activity-chip">${(day.steps || 0).toLocaleString()} steps</div>
      </div>
      <div class="row" style="margin-top:14px;">
        ${day.completed
          ? `<button class="btn secondary" data-action="reopenDay" style="width:100%;">Reopen day</button>`
          : `<button class="btn" data-action="closeDay" style="width:100%;">Close out day →</button>`}
      </div>
    </div>

    <div class="card">
      <h2>Daily checklist</h2>
      <div class="meal-item-macro" style="margin-bottom:8px;">Daily items reset fresh every morning. One-time tasks stick around until you check them off, then they're gone for good.</div>
      ${state.checklistItems.length ? state.checklistItems.map(s => {
        const checkedNow = s.recurring ? !!day.supplements[s.id] : false;
        const checkAction = s.recurring ? "toggleSupplement" : "completeOneTimeItem";
        return `
        <div class="meal-item">
          <button class="todo-check ${checkedNow ? "checked" : ""}" data-action="${checkAction}" data-id="${s.id}"></button>
          <div class="todo-label">${s.label}${s.recurring ? ` <span class="recurring-tag">↻ daily</span>` : ""}</div>
          <button class="remove-set" data-action="removeChecklistItem" data-id="${s.id}">✕</button>
        </div>`;
      }).join("") : `<div class="empty-state">Nothing here yet — add something below</div>`}
      <div class="add-item-row" style="margin-top:8px;">
        <div style="display:flex; gap:8px;">
          <input type="text" id="checklist-input" placeholder="Add an item…" style="flex:1;">
          <button class="btn secondary" data-action="addChecklistItem">Add</button>
        </div>
        <label style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12px; color:var(--text-dim);">
          <input type="checkbox" id="checklist-recurring-input" style="width:auto;"> Repeats daily (e.g. meds/supplements)
        </label>
      </div>
    </div>

    ${renderMealSwipeCard(day)}

    <div class="card">
      <h2>Water</h2>
      <div class="water-row">
        <button class="btn secondary" data-action="waterDelta" data-delta="-1">−¼ bottle</button>
        <div class="water-track"><div class="water-fill" style="width:${waterPct}%"></div></div>
        <button class="btn secondary" data-action="waterDelta" data-delta="1">+¼ bottle</button>
      </div>
      <div class="meal-item-macro" style="margin-top:6px;">${formatBottles(bottles)} logged (32 oz/bottle) · target ${formatWaterTarget(waterTarget)} bottle${waterTarget.max === 1 ? "" : "s"} (${waterTarget.min * BOTTLE_OZ}${waterTarget.min === waterTarget.max ? "" : `-${waterTarget.max * BOTTLE_OZ}`} oz)${day.workout.type === "boulder" ? " (bumped for bouldering)" : ""}</div>
    </div>

    <div class="card">
      <h2>Steps</h2>
      <div class="field">
        <label>From Apple Health</label>
        <input type="number" inputmode="numeric" placeholder="e.g. 8500" data-action="setSteps" value="${day.steps ?? ""}">
      </div>
      <div class="meal-item-macro" style="margin-top:6px;">target ${STEP_TARGET.min.toLocaleString()}-${STEP_TARGET.max.toLocaleString()} steps</div>
    </div>

    <div class="card">
      <h2>Workout</h2>
      <div class="toggle-pill">
        ${["rest", "resistance", "run", "boulder"].map(t => `<button data-action="setWorkoutType" data-type="${t}" class="${day.workout.type === t ? "active" : ""}">${activityLabel(t)}</button>`).join("")}
      </div>
      <div style="margin-top:12px;">
        ${renderWorkoutBody(day)}
      </div>
    </div>

    <div class="card">
      <h2>Body</h2>
      <div class="two-col">
        <div class="field"><label>Weight (lb)</label><input type="number" inputmode="decimal" step="0.1" data-action="setWeight" value="${day.weight ?? ""}"></div>
        <div class="field"><label>Waist (in, weekly)</label><input type="number" inputmode="decimal" step="0.1" data-action="setWaist" value="${day.waist ?? ""}"></div>
      </div>
      <div class="field"><label>Notes</label><textarea data-action="setNotes">${day.notes || ""}</textarea></div>
    </div>
  `;
}

function lastSessionFor(name, beforeKey) {
  const rows = collectExerciseHistory(name).filter(r => r.dateKey < beforeKey);
  return rows.length ? rows[rows.length - 1] : null;
}

function progressionNote(last, routine) {
  if (!last) return "No previous session yet — log your starting weight/reps.";
  const when = niceDate(last.dateKey);
  const w = formatKgLb(last.weight);
  const step = `${toDisplayWeight(routine.weightStepKg)} ${state.weightUnit}`;
  if (last.reps >= routine.repTarget.max) return `Last: ${w} × ${last.reps} (${when}) — hit the top of the rep range, try +${step} this session.`;
  if (last.reps < routine.repTarget.min) return `Last: ${w} × ${last.reps} (${when}) — aim for ${routine.repTarget.min}+ reps at this weight before adding more.`;
  return `Last: ${w} × ${last.reps} (${when}) — add a rep or two, or +${step} if it felt easy.`;
}

function coreFieldsFor(type) {
  if (type === "reps") return [{ field: "reps", placeholder: `${CORE_REP_TARGET.min}-${CORE_REP_TARGET.max}` }];
  if (type === "duration") return [{ field: "seconds", placeholder: `${CORE_DURATION_TARGET.min}-${CORE_DURATION_TARGET.max}` }];
  return [{ field: "weight", placeholder: state.weightUnit }, { field: "reps", placeholder: `${CORE_REP_TARGET.min}-${CORE_REP_TARGET.max}` }]; // weighted-reps
}

function coreTargetLabel(type) {
  if (type === "duration") return `Target: ${SET_TARGET.min}-${SET_TARGET.max} sets × ${CORE_DURATION_TARGET.min}-${CORE_DURATION_TARGET.max} sec hold`;
  return `Target: ${SET_TARGET.min}-${SET_TARGET.max} sets × ${CORE_REP_TARGET.min}-${CORE_REP_TARGET.max} reps`;
}

function renderCoreExerciseBlock(ex, exIdx) {
  const fields = coreFieldsFor(ex.type);
  return `
    <div class="exercise-block">
      <h3>${ex.name}</h3>
      <div class="meal-item-macro" style="margin-bottom:8px;">${coreTargetLabel(ex.type)}</div>
      ${ex.sets.map((s, sIdx) => `
        <div class="set-row-flex">
          <div class="set-num">${sIdx + 1}</div>
          ${fields.map(f => `<input type="number" inputmode="decimal" placeholder="${f.placeholder}" data-action="setCoreField" data-ex="${exIdx}" data-set="${sIdx}" data-field="${f.field}" value="${f.field === "weight" ? toDisplayWeight(s.weight) : (s[f.field] ?? "")}">`).join("")}
          <button class="remove-set" data-action="removeCoreSet" data-ex="${exIdx}" data-set="${sIdx}">✕</button>
        </div>
      `).join("")}
      <button class="btn secondary" data-action="addCoreSet" data-ex="${exIdx}">+ Add set</button>
    </div>
  `;
}

function renderPlateCalc(weightKg) {
  if (weightKg === "" || weightKg === null || weightKg === undefined || !Number(weightKg)) return "";
  const displayWeight = toDisplayWeight(weightKg);
  const result = plateBreakdown(displayWeight, state.weightUnit);
  if (!result) return `<div class="plate-calc">Lighter than the empty bar (${BAR_WEIGHT[state.weightUnit]} ${state.weightUnit})</div>`;
  const chips = result.plates.length
    ? result.plates.map(p => `<span class="plate-chip">${p}</span>`).join("")
    : `<span class="plate-calc-label">bar only</span>`;
  return `<div class="plate-calc"><span class="plate-calc-label">Per side:</span> ${chips}</div>`;
}

function renderWorkoutBody(day) {
  const w = day.workout;
  if (w.type === "resistance") {
    const routine = routineForDay(day);
    const routineHeader = routine.name ? `<div class="meal-item-macro" style="margin-bottom:10px;">Routine: <strong>${routine.name}</strong></div>` : "";
    return routineHeader + w.exercises.map((ex, exIdx) => {
      const last = lastSessionFor(ex.name, viewDate);
      return `
      <div class="exercise-block">
        <h3>${ex.name}</h3>
        <div class="meal-item-macro">Target: ${routine.setTarget.min}-${routine.setTarget.max} sets × ${routine.repTarget.min}-${routine.repTarget.max} reps</div>
        <div class="meal-item-macro" style="margin-bottom:8px;">${progressionNote(last, routine)}</div>
        ${ex.sets.map((s, sIdx) => `
          <div class="set-row">
            <div class="set-num">${sIdx + 1}</div>
            <input type="number" inputmode="decimal" placeholder="${state.weightUnit}" data-action="setField" data-ex="${exIdx}" data-set="${sIdx}" data-field="weight" value="${toDisplayWeight(s.weight)}">
            <input type="number" inputmode="numeric" placeholder="${routine.repTarget.min}-${routine.repTarget.max}" data-action="setField" data-ex="${exIdx}" data-set="${sIdx}" data-field="reps" value="${s.reps ?? ""}">
            <button class="remove-set" data-action="removeSet" data-ex="${exIdx}" data-set="${sIdx}">✕</button>
          </div>
          ${ex.barbell ? `<div data-plate-for="${exIdx}-${sIdx}">${renderPlateCalc(s.weight)}</div>` : ""}
        `).join("")}
        <button class="btn secondary" data-action="addSet" data-ex="${exIdx}">+ Add set</button>
      </div>
    `;
    }).join("");
  }
  if (w.type === "run") {
    return `
      <div class="two-col">
        <div class="field"><label>Miles</label><input type="number" inputmode="decimal" step="0.1" data-action="setRunField" data-field="miles" value="${w.run.miles}"></div>
        <div class="field"><label>Minutes</label><input type="number" inputmode="numeric" data-action="setRunField" data-field="minutes" value="${w.run.minutes}"></div>
      </div>
      <h3 style="margin-top:16px; margin-bottom:4px;">Core work</h3>
      <div class="meal-item-macro" style="margin-bottom:10px;">10-15 min total, progressive — add reps/time/weight weekly</div>
      ${w.core.map((ex, exIdx) => renderCoreExerciseBlock(ex, exIdx)).join("")}
    `;
  }
  if (w.type === "boulder") {
    return `<div class="field"><label>Session length (minutes)</label><input type="number" inputmode="numeric" data-action="setBoulderMinutes" value="${w.boulder.minutes}"></div>`;
  }
  return `<div class="empty-state">Rest day — nothing to log</div>`;
}

// ---------- Workouts tab (progression history) ----------

function collectExerciseHistory(name) {
  const rows = [];
  for (const [dateKey, day] of Object.entries(state.days)) {
    if (day.workout.type !== "resistance") continue;
    const ex = day.workout.exercises.find(e => e.name === name);
    if (!ex || ex.sets.length === 0) continue;
    let topWeight = 0, topSet = null;
    for (const s of ex.sets) {
      const w = Number(s.weight) || 0;
      if (w >= topWeight) { topWeight = w; topSet = s; }
    }
    if (topSet) rows.push({ dateKey, weight: Number(topSet.weight) || 0, reps: Number(topSet.reps) || 0, sets: ex.sets.length });
  }
  rows.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return rows;
}

function scheduledActivityLabel(scheduled) {
  return scheduled === null ? "Flexible / make-up day" : activityLabel(scheduled);
}

let scheduleEditOpen = false;
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABELS = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };
const SCHEDULE_OPTIONS = [
  { value: "", label: "Flexible / make-up" },
  { value: "rest", label: "Rest" },
  { value: "resistance", label: "Resistance" },
  { value: "run", label: "Run + Core" },
  { value: "boulder", label: "Bouldering" },
];

function renderScheduleEditor() {
  return `
    <div class="quick-add-form">
      ${DOW_ORDER.map(dow => {
        const current = state.weeklySchedule[dow] ?? "";
        return `
        <div class="schedule-edit-row">
          <label>${DOW_LABELS[dow]}</label>
          <select data-action="setScheduleDay" data-dow="${dow}">
            ${SCHEDULE_OPTIONS.map(o => `<option value="${o.value}" ${current === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
          </select>
        </div>`;
      }).join("")}
    </div>
  `;
}

function renderUpcomingSchedule(daysAhead) {
  const todayKey = formatDateKey(new Date());
  const rows = [];
  for (let i = 0; i < daysAhead; i++) {
    const key = addDays(todayKey, i);
    const scheduled = state.weeklySchedule[parseKey(key).getDay()];
    rows.push(`
      <div class="meal-item">
        <div class="meal-item-label">${i === 0 ? "Today — " : ""}${niceDate(key)}</div>
        <span class="badge ${scheduled || "rest"}">${scheduledActivityLabel(scheduled)}</span>
      </div>
    `);
  }
  return `
    <div class="card">
      <div class="row">
        <h2 style="margin:0;">Upcoming schedule</h2>
        <button class="btn secondary" data-action="toggleScheduleEdit">${scheduleEditOpen ? "Done" : "Edit schedule"}</button>
      </div>
      ${scheduleEditOpen
        ? `<div class="meal-item-macro" style="margin:10px 0;">Sets the recurring weekly pattern going forward. Days you've already logged won't change.</div>${renderScheduleEditor()}`
        : rows.join("")}
    </div>
  `;
}

function renderRoutineManager() {
  const routineBlocks = state.routines.map(routine => {
    const canDelete = state.routines.length > 1;
    const exRows = routine.exercises.length ? routine.exercises.map((ex, idx) => `
      <div class="meal-item">
        <div>
          <div class="meal-item-label">${ex.name}</div>
          <label style="display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-dim); margin-top:2px;">
            <input type="checkbox" data-action="toggleRoutineExerciseBarbell" data-routine="${routine.id}" data-idx="${idx}" ${ex.barbell ? "checked" : ""} style="width:auto;"> Barbell (plate calculator)
          </label>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="icon-btn" data-action="moveRoutineExercise" data-routine="${routine.id}" data-idx="${idx}" data-dir="-1" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="icon-btn" data-action="moveRoutineExercise" data-routine="${routine.id}" data-idx="${idx}" data-dir="1" ${idx === routine.exercises.length - 1 ? "disabled" : ""}>↓</button>
          <button class="remove-set" data-action="removeRoutineExercise" data-routine="${routine.id}" data-idx="${idx}">✕</button>
        </div>
      </div>
    `).join("") : `<div class="empty-state">No exercises yet — add one below</div>`;

    return `
      <div class="exercise-block">
        <div class="row">
          <h3 style="margin:0;">${routine.name}</h3>
          <button class="btn ${routine.active ? "" : "secondary"}" data-action="toggleRoutineActive" data-routine="${routine.id}">${routine.active ? "Active ✓" : "Inactive"}</button>
        </div>
        <div class="field" style="margin-top:10px;"><label>Routine name</label><input type="text" data-action="setRoutineField" data-routine="${routine.id}" data-field="name" value="${routine.name}"></div>
        <div class="two-col">
          <div class="field"><label>Sets (min)</label><input type="number" inputmode="numeric" data-action="setRoutineField" data-routine="${routine.id}" data-field="setMin" value="${routine.setTarget.min}"></div>
          <div class="field"><label>Sets (max)</label><input type="number" inputmode="numeric" data-action="setRoutineField" data-routine="${routine.id}" data-field="setMax" value="${routine.setTarget.max}"></div>
        </div>
        <div class="two-col">
          <div class="field"><label>Reps (min)</label><input type="number" inputmode="numeric" data-action="setRoutineField" data-routine="${routine.id}" data-field="repMin" value="${routine.repTarget.min}"></div>
          <div class="field"><label>Reps (max)</label><input type="number" inputmode="numeric" data-action="setRoutineField" data-routine="${routine.id}" data-field="repMax" value="${routine.repTarget.max}"></div>
        </div>
        <div class="field"><label>Weight step (${state.weightUnit})</label><input type="number" inputmode="decimal" step="0.5" data-action="setRoutineField" data-routine="${routine.id}" data-field="weightStep" value="${toDisplayWeight(routine.weightStepKg)}"></div>
        <h3 style="margin-top:10px;">Exercises</h3>
        ${exRows}
        <div class="add-item-row">
          <div style="display:flex; gap:8px;">
            <input type="text" id="new-exercise-${routine.id}" placeholder="Add exercise…" style="flex:1;">
            <button class="btn secondary" data-action="addRoutineExercise" data-routine="${routine.id}">Add</button>
          </div>
          <label style="display:flex; align-items:center; gap:6px; margin-top:6px; font-size:12px; color:var(--text-dim);">
            <input type="checkbox" id="new-exercise-barbell-${routine.id}" style="width:auto;"> Barbell lift (adds plate calculator)
          </label>
        </div>
        ${canDelete ? `<button class="btn secondary" data-action="deleteRoutine" data-routine="${routine.id}" style="width:100%; margin-top:10px;">Delete routine</button>` : ""}
      </div>
    `;
  }).join("");

  const hasStrongLifts = state.routines.some(r => r.name === "StrongLifts A" || r.name === "StrongLifts B");

  return `
    <div class="card">
      <div class="row">
        <h2 style="margin:0;">Workout routines</h2>
        <div class="toggle-pill" style="width:auto;">
          <button data-action="setWeightUnit" data-unit="kg" class="${state.weightUnit === "kg" ? "active" : ""}">kg</button>
          <button data-action="setWeightUnit" data-unit="lb" class="${state.weightUnit === "lb" ? "active" : ""}">lb</button>
        </div>
      </div>
      <div class="meal-item-macro" style="margin:8px 0 10px;">Only <strong>Active</strong> routines rotate on resistance days — one routine repeats every time, two or more alternate by session (A/B/A/B…), not by weekday. Inactive routines sit ready to switch to later.</div>
      ${routineBlocks}
      <div class="add-item-row" style="display:flex; gap:8px; margin-top:4px;">
        <input type="text" id="new-routine-name" placeholder="New routine name…" style="flex:1;">
        <button class="btn secondary" data-action="addRoutine">+ Add routine</button>
      </div>
      ${hasStrongLifts ? "" : `
        <button class="btn secondary" data-action="addStrongLiftsPreset" style="width:100%; margin-top:8px;">+ Add StrongLifts 5x5 (A/B, inactive)</button>
      `}
    </div>
  `;
}

function renderExerciseProgressionCard(name) {
  const rows = collectExerciseHistory(name);
  const recent = rows.slice(-8).reverse();
  const chart = rows.length > 1 ? lineChartSVG([rows.map(r => ({ x: r.dateKey, y: r.weight }))], ["#4fd1c5"]) : "";
  return `
    <div class="card">
      <h3>${name}</h3>
      ${chart ? `<div class="chart-wrap">${chart}</div>` : ""}
      ${recent.length ? `
        <table class="hist-table">
          <tr><th>Date</th><th>Top set</th><th>Sets</th></tr>
          ${recent.map(r => `<tr><td>${niceDate(r.dateKey)}</td><td>${formatKgLb(r.weight)} × ${r.reps}</td><td>${r.sets}</td></tr>`).join("")}
        </table>
      ` : `<div class="empty-state">No sets logged yet</div>`}
    </div>
  `;
}

function renderResistanceProgression() {
  const currentExerciseNames = new Set();
  state.routines.forEach(r => r.exercises.forEach(ex => currentExerciseNames.add(ex.name)));

  const loggedNames = new Set();
  for (const day of Object.values(state.days)) {
    if (day.workout.type !== "resistance") continue;
    for (const ex of day.workout.exercises) {
      if (ex.sets.length > 0) loggedNames.add(ex.name);
    }
  }

  const routineSections = state.routines.map(routine => `
    <div class="card"><h3 style="margin:0;">${routine.name || "Routine"}</h3></div>
    ${routine.exercises.length
      ? routine.exercises.map(ex => renderExerciseProgressionCard(ex.name)).join("")
      : `<div class="card"><div class="empty-state">No exercises in this routine yet — add some in Workout Routines above</div></div>`}
  `).join("");

  const otherNames = [...loggedNames].filter(name => !currentExerciseNames.has(name)).sort();
  const otherSection = otherNames.length ? `
    <div class="card"><h3 style="margin:0;">Other (from past routines)</h3></div>
    ${otherNames.map(renderExerciseProgressionCard).join("")}
  ` : "";

  return routineSections + otherSection;
}

function renderWorkouts() {
  const cardioRows = Object.entries(state.days)
    .filter(([, d]) => d.workout.type === "run" || d.workout.type === "boulder")
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 15);

  const cardioTable = cardioRows.length ? `
    <table class="hist-table">
      <tr><th>Date</th><th>Type</th><th>Detail</th></tr>
      ${cardioRows.map(([k, d]) => `
        <tr>
          <td>${niceDate(k)}</td>
          <td>${activityLabel(d.workout.type)}</td>
          <td>${d.workout.type === "run"
            ? `${d.workout.run.miles || 0} mi / ${d.workout.run.minutes || 0} min${d.workout.core && d.workout.core.length ? ` + core (${d.workout.core.filter(ex => ex.sets.length > 0).length}/${d.workout.core.length})` : ""}`
            : `${d.workout.boulder.minutes || 0} min`}</td>
        </tr>
      `).join("")}
    </table>
  ` : `<div class="empty-state">No cardio sessions logged yet</div>`;

  return `
    ${renderUpcomingSchedule(14)}
    ${renderRoutineManager()}
    <div class="card"><h2>Resistance progression</h2></div>
    ${renderResistanceProgression()}
    <div class="card"><h2>Run / boulder log</h2>${cardioTable}</div>
  `;
}

// ---------- Progress tab ----------

function renderProgressShell() {
  return `
    <div class="card">
      <h2>Weight trend</h2>
      <div id="weight-chart-slot" class="chart-wrap"><div class="empty-state">Loading…</div></div>
    </div>
    <div class="card">
      <h2>Waist (weekly)</h2>
      <div id="waist-table-slot"><div class="empty-state">Loading…</div></div>
    </div>
    <div class="card">
      <h2>Photos</h2>
      <input type="file" accept="image/*" capture="environment" data-action="addPhoto" style="margin-bottom:10px;">
      <div id="photo-grid-slot" class="photo-grid"></div>
    </div>
    <div class="card">
      <h2>Backup</h2>
      <div class="row">
        <button class="btn secondary" data-action="exportData">Export JSON</button>
        <label class="btn secondary" style="text-align:center;">
          Import JSON
          <input type="file" accept="application/json" data-action="importData" style="display:none;">
        </label>
      </div>
    </div>
  `;
}

function weightSeries() {
  return Object.entries(state.days)
    .filter(([, d]) => d.weight != null && d.weight !== "")
    .map(([k, d]) => ({ x: k, y: Number(d.weight) }))
    .sort((a, b) => a.x.localeCompare(b.x));
}

function rollingAverageSeries(series, windowSize) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = series.slice(start, i + 1);
    const avg = slice.reduce((s, p) => s + p.y, 0) / slice.length;
    out.push({ x: series[i].x, y: avg });
  }
  return out;
}

function hydrateProgress() {
  const series = weightSeries();
  const slot = document.getElementById("weight-chart-slot");
  if (series.length < 2) {
    slot.innerHTML = `<div class="empty-state">Log at least 2 days of weight to see a trend</div>`;
  } else {
    const avg = rollingAverageSeries(series, 7);
    slot.innerHTML = lineChartSVG([series, avg], ["#9aa1af", "#4fd1c5"]);
  }

  const waistEntries = Object.entries(state.days)
    .filter(([, d]) => d.waist != null && d.waist !== "")
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12);
  const waistSlot = document.getElementById("waist-table-slot");
  waistSlot.innerHTML = waistEntries.length ? `
    <table class="hist-table"><tr><th>Date</th><th>Waist (in)</th></tr>
    ${waistEntries.map(([k, d]) => `<tr><td>${niceDate(k)}</td><td>${d.waist}</td></tr>`).join("")}
    </table>` : `<div class="empty-state">No waist measurements yet</div>`;

  getAllPhotos().then(photos => {
    const grid = document.getElementById("photo-grid-slot");
    if (!photos.length) { grid.innerHTML = `<div class="empty-state">No photos yet</div>`; return; }
    grid.innerHTML = photos.map(p => `<img src="${URL.createObjectURL(p.blob)}" alt="${p.id}" title="${p.id}">`).join("");
  });
}

// simple multi-series SVG line chart, x = date-string categories, y = numeric
function lineChartSVG(seriesList, colors) {
  const W = 600, H = 180, PAD = 24;
  const allPoints = seriesList.flat();
  if (!allPoints.length) return "";
  const xs = [...new Set(allPoints.map(p => p.x))].sort();
  const ys = allPoints.map(p => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const yRange = yMax - yMin || 1;

  const xPos = x => PAD + (xs.indexOf(x) / Math.max(1, xs.length - 1)) * (W - PAD * 2);
  const yPos = y => H - PAD - ((y - yMin) / yRange) * (H - PAD * 2);

  const polylines = seriesList.map((series, i) => {
    const pts = series.map(p => `${xPos(p.x)},${yPos(p.y)}`).join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${colors[i]}" stroke-width="2" />`;
  }).join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${polylines}</svg>`;
}

// ---------- IndexedDB photo storage ----------

function openPhotoDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePhoto(id, blob) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPhotos() {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.id.localeCompare(a.id)));
    req.onerror = () => reject(req.error);
  });
}

// ---------- Check-in tab ----------

function allWeightEntriesSorted() {
  return Object.entries(state.days)
    .filter(([, d]) => d.weight != null && d.weight !== "")
    .map(([k, d]) => ({ date: k, weight: Number(d.weight) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computeRollingTrendAsOf(cutoffKey) {
  const entries = allWeightEntriesSorted().filter(e => e.date <= cutoffKey);
  if (entries.length < 8) return null;
  const last7 = entries.slice(-7);
  const prev7 = entries.slice(-14, -7);
  if (prev7.length < 1) return null;
  const avg = arr => arr.reduce((s, e) => s + e.weight, 0) / arr.length;
  const currentAvg = avg(last7);
  const prevAvg = avg(prev7);
  const weeklyRateLbs = prevAvg - currentAvg; // positive = losing
  return { currentAvg, prevAvg, weeklyRateLbs };
}

function nextCheckinDayNumber() {
  const done = new Set(state.checkIns.map(c => c.dayNumber));
  let n = CHECKIN_INTERVAL_DAYS;
  while (done.has(n)) n += CHECKIN_INTERVAL_DAYS;
  return n;
}

function pendingCheckinDayNumber() {
  const today = dayNumberFor(formatDateKey(new Date()));
  const next = nextCheckinDayNumber();
  return next <= today ? next : null;
}

function suggestionFor(trend) {
  if (!trend) return { kind: "insufficient", text: "Need at least 2 weeks of daily weigh-ins to compute a trend." };
  const rate = trend.weeklyRateLbs;
  const last2 = state.checkIns.slice(-1)[0];
  if (rate > 1.5) {
    return { kind: "increase", delta: 175, text: `Losing ~${rate.toFixed(1)} lb/week — faster than the 1-1.5 lb/week target. Suggest increasing calories by ~150-200/day.` };
  }
  if (rate < 0.5 && last2 && last2.weeklyRateLbs < 0.5) {
    return { kind: "decrease", delta: -175, text: `Losing ~${rate.toFixed(1)} lb/week for two check-ins in a row — slower than target. Suggest decreasing calories by ~150-200/day, or add activity.` };
  }
  if (rate < 0.5) {
    return { kind: "hold", delta: 0, text: `Losing ~${rate.toFixed(1)} lb/week — a bit slow, but only one check-in so far. Hold steady and re-check in 2 weeks.` };
  }
  return { kind: "hold", delta: 0, text: `Losing ~${rate.toFixed(1)} lb/week — right in the 1-1.5 lb/week target range. Hold current targets.` };
}

function renderCheckin() {
  const pendingDay = pendingCheckinDayNumber();
  let pendingBlock = "";
  if (pendingDay) {
    const cutoffKey = addDays(PLAN_START, pendingDay - 1);
    const trend = computeRollingTrendAsOf(cutoffKey);
    const s = suggestionFor(trend);
    const baseline = allWeightEntriesSorted()[0];
    const latest = allWeightEntriesSorted().slice(-1)[0];
    const totalChange = baseline && latest ? (baseline.weight - latest.weight) : null;
    pendingBlock = `
      <div class="card">
        <h2>Check-in due — Day ${pendingDay}</h2>
        <div class="checkin-suggestion ${s.kind}">${s.text}</div>
        ${totalChange != null && Math.abs(totalChange) > 5 ? `<div class="checkin-suggestion hold">Total change from baseline is ${totalChange.toFixed(1)} lb — consider re-estimating maintenance calories.</div>` : ""}
        <div class="row">
          <button class="btn secondary" data-action="dismissCheckin" data-day="${pendingDay}">Skip this time</button>
          <button class="btn" data-action="acceptCheckin" data-day="${pendingDay}" data-delta="${s.delta}" ${s.kind === "insufficient" ? "disabled" : ""}>Apply & log</button>
        </div>
      </div>
    `;
  }

  const history = state.checkIns.slice().reverse().map(c => `
    <tr><td>Day ${c.dayNumber}</td><td>${c.weeklyRateLbs != null ? c.weeklyRateLbs.toFixed(1) + " lb/wk" : "—"}</td><td>${c.appliedDeltaCal > 0 ? "+" : ""}${c.appliedDeltaCal} cal</td></tr>
  `).join("");

  return `
    ${pendingBlock || `<div class="card"><h2>Check-in</h2><div class="empty-state">Next check-in at day ${nextCheckinDayNumber()}</div></div>`}
    <div class="card">
      <h2>Current targets</h2>
      <div class="meal-item-macro">Rest day: ${state.targets.calRest} cal · Training day: ${state.targets.calTrain} cal · Protein: ${state.targets.protein}g · Carbs: ${state.targets.carbs}g · Fat: ${state.targets.fat}g</div>
    </div>
    <div class="card">
      <h2>Check-in history</h2>
      ${history ? `<table class="hist-table"><tr><th>Checkpoint</th><th>Rate</th><th>Adjustment</th></tr>${history}</table>` : `<div class="empty-state">No check-ins yet</div>`}
    </div>
  `;
}


// ---------- action dispatcher ----------

document.getElementById("bottom-nav").addEventListener("click", e => {
  const btn = e.target.closest(".nav-btn");
  if (!btn) return;
  currentTab = btn.dataset.tab;
  render();
});

document.getElementById("view-root").addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const day = getOrCreateDay(viewDate);

  if (action === "navDay") {
    viewDate = addDays(viewDate, Number(el.dataset.delta));
    mealTabIndex = 0;
    quickAddOpen = false;
    editDefaultsOpen = false;
    render(); return;
  }
  if (action === "jumpToday") {
    viewDate = formatDateKey(new Date());
    mealTabIndex = 0;
    quickAddOpen = false;
    editDefaultsOpen = false;
    render(); return;
  }
  if (action === "setMealTab") {
    mealTabIndex = Number(el.dataset.idx);
    quickAddOpen = false;
    editDefaultsOpen = false;
    render(); return;
  }
  if (action === "closeDay") {
    day.completed = true;
    saveState();
    viewDate = addDays(viewDate, 1);
    render(); return;
  }
  if (action === "reopenDay") {
    day.completed = false;
    saveState(); render(); return;
  }
  if (action === "mealQty") {
    const mealName = el.dataset.meal;
    const meal = day.meals[mealName];
    const id = el.dataset.item;
    const isTemplateItem = id in (state.mealTemplates[mealName] || {});
    const next = (meal[id] || 0) + Number(el.dataset.delta);
    if (next <= 0) { if (isTemplateItem) meal[id] = 0; else delete meal[id]; }
    else meal[id] = next;
    saveState(); render(); return;
  }
  if (action === "mealLogPlanned") {
    const mealName = el.dataset.meal;
    day.meals[mealName] = { ...day.meals[mealName], ...state.mealTemplates[mealName] };
    saveState(); render(); return;
  }
  if (action === "toggleQuickAdd") {
    quickAddOpen = !quickAddOpen;
    render(); return;
  }
  if (action === "toggleEditDefaults") {
    editDefaultsOpen = !editDefaultsOpen;
    render(); return;
  }
  if (action === "templateQty") {
    const mealName = el.dataset.meal;
    const id = el.dataset.item;
    const template = state.mealTemplates[mealName];
    const next = (template[id] || 0) + Number(el.dataset.delta);
    if (next <= 0) delete template[id]; else template[id] = next;
    saveState(); render(); return;
  }
  if (action === "addTemplateItem") {
    const mealName = el.dataset.meal;
    const select = document.getElementById("template-add-" + mealName);
    const id = select.value;
    if (id) { state.mealTemplates[mealName][id] = 1; saveState(); render(); }
    return;
  }
  if (action === "toggleScheduleEdit") {
    scheduleEditOpen = !scheduleEditOpen;
    render(); return;
  }
  if (action === "setWeightUnit") {
    state.weightUnit = el.dataset.unit;
    saveState(); render(); return;
  }
  if (action === "addRoutine") {
    const input = document.getElementById("new-routine-name");
    const name = input.value.trim();
    if (!name) return;
    state.routines.push({
      id: "routine_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      name,
      active: true,
      exercises: [],
      setTarget: { ...SET_TARGET },
      repTarget: { ...REP_TARGET },
      weightStepKg: WEIGHT_STEP_KG,
    });
    saveState(); render(); return;
  }
  if (action === "addStrongLiftsPreset") {
    const stamp = Date.now();
    state.routines.push(
      { id: "routine_sl_a_" + stamp, name: "StrongLifts A", active: false,
        exercises: [{ name: "Squat", barbell: true }, { name: "Bench Press", barbell: true }, { name: "Barbell Row", barbell: true }],
        setTarget: { min: 5, max: 5 }, repTarget: { min: 5, max: 5 }, weightStepKg: 2.5 },
      { id: "routine_sl_b_" + stamp, name: "StrongLifts B", active: false,
        exercises: [{ name: "Squat", barbell: true }, { name: "Overhead Press", barbell: true }, { name: "Deadlift", barbell: true }],
        setTarget: { min: 5, max: 5 }, repTarget: { min: 5, max: 5 }, weightStepKg: 2.5 }
    );
    saveState(); render(); return;
  }
  if (action === "toggleRoutineActive") {
    const routine = state.routines.find(r => r.id === el.dataset.routine);
    if (routine.active && state.routines.filter(r => r.active).length <= 1) return;
    routine.active = !routine.active;
    saveState(); render(); return;
  }
  if (action === "deleteRoutine") {
    if (state.routines.length <= 1) return;
    state.routines = state.routines.filter(r => r.id !== el.dataset.routine);
    if (state.nextRoutineIndex >= state.routines.length) state.nextRoutineIndex = 0;
    saveState(); render(); return;
  }
  if (action === "addRoutineExercise") {
    const routine = state.routines.find(r => r.id === el.dataset.routine);
    const input = document.getElementById("new-exercise-" + el.dataset.routine);
    const barbellBox = document.getElementById("new-exercise-barbell-" + el.dataset.routine);
    const name = input.value.trim();
    if (!name) return;
    routine.exercises.push({ name, barbell: !!(barbellBox && barbellBox.checked) });
    saveState(); render(); return;
  }
  if (action === "removeRoutineExercise") {
    const routine = state.routines.find(r => r.id === el.dataset.routine);
    routine.exercises.splice(Number(el.dataset.idx), 1);
    saveState(); render(); return;
  }
  if (action === "moveRoutineExercise") {
    const routine = state.routines.find(r => r.id === el.dataset.routine);
    const idx = Number(el.dataset.idx);
    const newIdx = idx + Number(el.dataset.dir);
    if (newIdx < 0 || newIdx >= routine.exercises.length) return;
    [routine.exercises[idx], routine.exercises[newIdx]] = [routine.exercises[newIdx], routine.exercises[idx]];
    saveState(); render(); return;
  }
  if (action === "submitQuickAdd") {
    const mealName = el.dataset.meal;
    const name = document.getElementById("quickadd-name").value.trim();
    const cal = Number(document.getElementById("quickadd-cal").value) || 0;
    const protein = Number(document.getElementById("quickadd-protein").value) || 0;
    const carbs = Number(document.getElementById("quickadd-carbs").value) || 0;
    const fat = Number(document.getElementById("quickadd-fat").value) || 0;
    if (!name) return;
    const id = "custom_food_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    state.customItems[id] = { label: name, cal, protein, carbs, fat };
    day.meals[mealName][id] = 1;
    quickAddOpen = false;
    saveState(); render(); return;
  }
  if (action === "waterDelta") {
    day.water.quarterBottles = Math.max(0, day.water.quarterBottles + Number(el.dataset.delta));
    saveState(); render(); return;
  }
  if (action === "setWorkoutType") {
    const type = el.dataset.type;
    day.workout.type = type;
    if (type === "resistance" && day.workout.exercises.length === 0) {
      populateResistanceExercises(day);
    }
    if (type === "run" && (!day.workout.core || day.workout.core.length === 0)) {
      day.workout.core = CORE_EXERCISES.map(ce => ({ name: ce.name, type: ce.type, sets: [] }));
    }
    saveState(); render(); return;
  }
  if (action === "addSet") {
    const ex = day.workout.exercises[Number(el.dataset.ex)];
    const routine = routineForDay(day);
    let suggestedWeight = "";
    if (ex.sets.length && ex.sets[ex.sets.length - 1].weight !== "") {
      suggestedWeight = ex.sets[ex.sets.length - 1].weight;
    } else {
      const last = lastSessionFor(ex.name, viewDate);
      if (last) suggestedWeight = last.reps >= routine.repTarget.max ? last.weight + routine.weightStepKg : last.weight;
    }
    ex.sets.push({ weight: suggestedWeight, reps: "" });
    saveState(); render(); return;
  }
  if (action === "removeSet") {
    day.workout.exercises[Number(el.dataset.ex)].sets.splice(Number(el.dataset.set), 1);
    saveState(); render(); return;
  }
  if (action === "addCoreSet") {
    const ex = day.workout.core[Number(el.dataset.ex)];
    const blank = {};
    for (const f of coreFieldsFor(ex.type)) blank[f.field] = "";
    ex.sets.push(blank);
    saveState(); render(); return;
  }
  if (action === "removeCoreSet") {
    day.workout.core[Number(el.dataset.ex)].sets.splice(Number(el.dataset.set), 1);
    saveState(); render(); return;
  }
  if (action === "toggleSupplement") {
    day.supplements[el.dataset.id] = !day.supplements[el.dataset.id];
    saveState(); render(); return;
  }
  if (action === "addChecklistItem") { addChecklistItemFromInput(); return; }
  if (action === "removeChecklistItem") {
    state.checklistItems = state.checklistItems.filter(s => s.id !== el.dataset.id);
    saveState(); render(); return;
  }
  if (action === "completeOneTimeItem") {
    state.checklistItems = state.checklistItems.filter(s => s.id !== el.dataset.id);
    saveState(); render(); return;
  }
  if (action === "exportData") { exportData(); return; }
  if (action === "acceptCheckin" || action === "dismissCheckin") {
    const dayNum = Number(el.dataset.day);
    const cutoffKey = addDays(PLAN_START, dayNum - 1);
    const trend = computeRollingTrendAsOf(cutoffKey);
    const delta = action === "acceptCheckin" ? Number(el.dataset.delta) : 0;
    if (action === "acceptCheckin" && delta) {
      state.targets.calRest += delta;
      state.targets.calTrain += delta;
    }
    state.checkIns.push({
      dayNumber: dayNum,
      weeklyRateLbs: trend ? trend.weeklyRateLbs : null,
      appliedDeltaCal: delta,
    });
    saveState(); render(); return;
  }
});

document.getElementById("view-root").addEventListener("input", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const day = getOrCreateDay(viewDate);

  if (action === "setWeight") { day.weight = el.value === "" ? null : Number(el.value); saveState(); return; }
  if (action === "setSteps") { day.steps = el.value === "" ? null : Number(el.value); saveState(); return; }
  if (action === "setWaist") { day.waist = el.value === "" ? null : Number(el.value); saveState(); return; }
  if (action === "setNotes") { day.notes = el.value; saveState(); return; }
  if (action === "setRoutineField") {
    const routine = state.routines.find(r => r.id === el.dataset.routine);
    const field = el.dataset.field;
    if (field === "name") routine.name = el.value;
    else if (field === "setMin") routine.setTarget.min = Number(el.value) || 0;
    else if (field === "setMax") routine.setTarget.max = Number(el.value) || 0;
    else if (field === "repMin") routine.repTarget.min = Number(el.value) || 0;
    else if (field === "repMax") routine.repTarget.max = Number(el.value) || 0;
    else if (field === "weightStep") routine.weightStepKg = toStorageWeight(el.value) || 0;
    saveState();
    return;
  }
  if (action === "setField") {
    const exIdx = Number(el.dataset.ex);
    const setIdx = Number(el.dataset.set);
    const ex = day.workout.exercises[exIdx];
    const field = el.dataset.field;
    ex.sets[setIdx][field] = field === "weight" ? toStorageWeight(el.value) : (el.value === "" ? "" : Number(el.value));
    saveState();
    if (field === "weight" && ex.barbell) {
      const wrap = document.querySelector(`[data-plate-for="${exIdx}-${setIdx}"]`);
      if (wrap) wrap.innerHTML = renderPlateCalc(ex.sets[setIdx].weight);
    }
    return;
  }
  if (action === "setCoreField") {
    const ex = day.workout.core[Number(el.dataset.ex)];
    const field = el.dataset.field;
    ex.sets[Number(el.dataset.set)][field] = field === "weight" ? toStorageWeight(el.value) : (el.value === "" ? "" : Number(el.value));
    saveState(); return;
  }
  if (action === "setRunField") { day.workout.run[el.dataset.field] = el.value === "" ? "" : Number(el.value); saveState(); return; }
  if (action === "setBoulderMinutes") { day.workout.boulder.minutes = el.value === "" ? "" : Number(el.value); saveState(); return; }
});

document.getElementById("view-root").addEventListener("change", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const day = getOrCreateDay(viewDate);

  if (action === "mealAdd") {
    const id = el.value;
    if (id) { day.meals[el.dataset.meal][id] = 1; saveState(); render(); }
    return;
  }
  if (action === "toggleRoutineExerciseBarbell") {
    const routine = state.routines.find(r => r.id === el.dataset.routine);
    routine.exercises[Number(el.dataset.idx)].barbell = el.checked;
    saveState(); render();
    return;
  }
  if (action === "setScheduleDay") {
    const dow = Number(el.dataset.dow);
    state.weeklySchedule[dow] = el.value === "" ? null : el.value;
    saveState(); render(); return;
  }
  if (action === "addPhoto") {
    const file = el.files[0];
    if (file) savePhoto(viewDate, file).then(render);
    return;
  }
  if (action === "importData") {
    const file = el.files[0];
    if (file) importData(file);
    return;
  }
});

document.getElementById("view-root").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "checklist-input") {
    e.preventDefault();
    addChecklistItemFromInput();
  }
});

// ---------- meal card swipe ----------

let swipeStartX = null;
let swipeStartY = null;

document.getElementById("view-root").addEventListener("touchstart", e => {
  if (!e.target.closest('[data-swipe="meal"]')) return;
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, { passive: true });

document.getElementById("view-root").addEventListener("touchend", e => {
  if (swipeStartX === null || !e.target.closest('[data-swipe="meal"]')) return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = e.changedTouches[0].clientY - swipeStartY;
  swipeStartX = null;
  if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return; // ignore short/vertical swipes
  if (dx < 0) mealTabIndex = Math.min(MEAL_ORDER.length - 1, mealTabIndex + 1);
  else mealTabIndex = Math.max(0, mealTabIndex - 1);
  quickAddOpen = false;
  editDefaultsOpen = false;
  render();
});

function addChecklistItemFromInput() {
  const input = document.getElementById("checklist-input");
  const recurringBox = document.getElementById("checklist-recurring-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  const recurring = !!(recurringBox && recurringBox.checked);
  state.checklistItems.push({ id: "custom_" + Date.now() + "_" + Math.floor(Math.random() * 1000), label: text, recurring });
  saveState(); render();
}

// ---------- export / import ----------

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function exportData() {
  const photos = await getAllPhotos();
  const photosOut = [];
  for (const p of photos) photosOut.push({ id: p.id, dataURL: await blobToDataURL(p.blob) });
  const payload = { state, photos: photosOut, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cut-plan-backup-${formatDateKey(new Date())}.json`;
  a.click();
}

async function importData(file) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (payload.state) {
    state = payload.state;
    saveState();
  }
  if (Array.isArray(payload.photos)) {
    for (const p of payload.photos) {
      const res = await fetch(p.dataURL);
      const blob = await res.blob();
      await savePhoto(p.id, blob);
    }
  }
  render();
}

// ---------- service worker ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
  // When a newer service worker takes over (i.e. an update was pushed), reload once
  // so the already-open page picks up the fresh files instead of staying stale.
  let swRefreshed = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshed) return;
    swRefreshed = true;
    location.reload();
  });
}

// ---------- init ----------

render();
