// Ledge — all app logic. Vanilla JS, no build step.
// STORAGE_KEY/PHOTO_DB are intentionally left as their original "cutPlan..." values (the
// app's earlier name) rather than renamed to match — changing them would orphan all
// existing localStorage/IndexedDB data for anyone who already has the app installed.
const STORAGE_KEY = "cutPlanState";
const PHOTO_DB = "cutPlanPhotos";
const PHOTO_STORE = "photos";

let state = loadState();
let currentTab = "today";
let tabBeforeSettings = "today"; // quick tab to return to when leaving Settings
let viewDate = formatDateKey(new Date());
document.documentElement.setAttribute("data-theme", state.theme);

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
    restSeconds: DEFAULT_REST_SECONDS,
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
      parsed.routines.forEach(r => { if (r.restSeconds === undefined) r.restSeconds = DEFAULT_REST_SECONDS; });
      // one-time addition: rotator cuff work wasn't in any routine before — add it if missing
      // (still just a normal exercise afterward, remove it in Workout Routines if not wanted)
      parsed.routines.forEach(r => {
        if (!r.exercises.some(ex => ex.name === "Band External Rotation")) {
          r.exercises.push({ name: "Band External Rotation", barbell: false });
        }
      });
      if (parsed.nextRoutineIndex === undefined) parsed.nextRoutineIndex = 0;
      if (parsed.targets.fat === undefined) parsed.targets.fat = DEFAULT_TARGETS.fat;
      if (parsed.targets.carbs === undefined) parsed.targets.carbs = DEFAULT_TARGETS.carbs;
      if (parsed.targets.fiber === undefined) parsed.targets.fiber = DEFAULT_TARGETS.fiber;
      for (const item of Object.values(parsed.customItems)) {
        if (item.fat === undefined) item.fat = 0;
        if (item.carbs === undefined) item.carbs = 0;
        if (item.fiber === undefined) item.fiber = 0;
      }
      if (!parsed.customPresets) parsed.customPresets = [];
      if (parsed.goal === undefined) parsed.goal = null;
      if (!parsed.itemUsage) parsed.itemUsage = {};
      if (!parsed.favoriteItems) parsed.favoriteItems = {};
      if (!parsed.theme) parsed.theme = "dark";
      if (!parsed.exerciseNotes) parsed.exerciseNotes = {};
      if (!parsed.collapsedCards) parsed.collapsedCards = {};
      if (parsed.lastDeloadDate === undefined) parsed.lastDeloadDate = null;
      if (parsed.lastExportAt === undefined) parsed.lastExportAt = null;
      // backward compat: water used to be logged in quarter-bottles, now plain ounces;
      // bouldering sessions used to only track minutes, now also a per-climb grade log
      for (const d of Object.values(parsed.days)) {
        if (d.water && d.water.quarterBottles !== undefined) {
          d.water.oz = d.water.quarterBottles * (BOTTLE_OZ / 4);
          delete d.water.quarterBottles;
        }
        if (d.workout && d.workout.boulder && d.workout.boulder.climbs === undefined) {
          d.workout.boulder.climbs = [];
        }
        if (d.workout && d.workout.boulder && d.workout.boulder.sessionType === undefined) {
          d.workout.boulder.sessionType = null;
        }
        if (d.workout && d.workout.boulder && d.workout.boulder.warmupDone === undefined) {
          d.workout.boulder.warmupDone = [];
        }
        if (d.workout && d.workout.boulder && d.workout.boulder.grid === undefined) {
          d.workout.boulder.grid = [];
        }
        if (d.workout && d.workout.boulder && d.workout.boulder.rating === undefined) {
          d.workout.boulder.rating = null;
        }
        // backward compat: single daily weight field split into AM/PM — old entries were
        // always logged once, treated as the AM (fasted) reading going forward.
        if (d.weightAM === undefined) {
          d.weightAM = d.weight != null ? d.weight : null;
          d.weightPM = null;
        }
        if (d.workout && d.workout.startedAt === undefined) {
          d.workout.startedAt = null;
          d.workout.durationMinutes = null;
        }
        if (d.maxHangTest === undefined) d.maxHangTest = null;
        if (d.stretchIds === undefined) {
          d.stretchIds = [];
          d.stretchesDone = {};
        }
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
    customPresets: [],
    goal: null,
    itemUsage: {},
    lastExportAt: null,
    favoriteItems: {},
    theme: "dark",
    exerciseNotes: {},
    lastDeloadDate: null,
    collapsedCards: {},
  };
}

let dataVersion = 0; // bumped on every save; aggregate calculations cache against this

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  dataVersion++;
}

// ---------- date helpers ----------

// Most-used items first (stable sort keeps catalog order among ties, e.g. all-zero usage).
function sortByUsage(ids) {
  return [...ids].sort((a, b) => (state.itemUsage[b] || 0) - (state.itemUsage[a] || 0));
}

function bumpItemUsage(id) {
  state.itemUsage[id] = (state.itemUsage[id] || 0) + 1;
}

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

function shortDate(k) {
  const d = parseKey(k);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

// Picks today's stretch set from the library, prioritizing whichever ones haven't been
// included in a day's set most recently (or ever) — the same "least done recently" pattern
// used for exercise-swap suggestions, so the daily 10 rotate instead of repeating.
function pickDailyStretches(dateKey) {
  const lastPicked = {};
  for (const [k, d] of Object.entries(state.days)) {
    if (k < dateKey && d.stretchIds) {
      for (const id of d.stretchIds) {
        if (!lastPicked[id] || k > lastPicked[id]) lastPicked[id] = k;
      }
    }
  }
  return STRETCH_LIBRARY.map(s => s.id)
    .sort((a, b) => (lastPicked[a] || "").localeCompare(lastPicked[b] || ""))
    .slice(0, DAILY_STRETCH_COUNT);
}

function getOrCreateDay(dateKey) {
  if (!state.days[dateKey]) {
    const previousDay = state.days[addDays(dateKey, -1)];
    const scheduled = suggestedWorkoutType(dateKey, previousDay ? previousDay.workout.type : null);
    state.days[dateKey] = {
      scheduledActivity: scheduled,
      meals: emptyMealsFromTemplate(),
      water: { oz: 0 },
      supplements: {},
      workout: {
        type: scheduled || null,
        exercises: [],
        routineId: null,
        core: scheduled === "run" ? CORE_EXERCISES.map(ce => ({ name: ce.name, type: ce.type, sets: [] })) : [],
        run: { miles: "", minutes: "" },
        boulder: { minutes: "", climbs: [], sessionType: null, warmupDone: [], grid: [], rating: null },
        startedAt: null,
        durationMinutes: null,
      },
      weightAM: null,
      weightPM: null,
      waist: null,
      maxHangTest: null,
      notes: "",
      completed: false,
      steps: null,
      stretchIds: pickDailyStretches(dateKey),
      stretchesDone: {},
    };
    if (scheduled === "resistance") populateResistanceExercises(state.days[dateKey]);
    saveState();
  }
  const day = state.days[dateKey];
  // Self-heal: a day created before the stretching feature shipped got backfilled with an
  // empty stretchIds by the migration (no retroactive fabrication for old days) — give it
  // a real pick the first time it's actually accessed, so today's card isn't just blank.
  if (!day.stretchIds || !day.stretchIds.length) {
    day.stretchIds = pickDailyStretches(dateKey);
    saveState();
  }
  return day;
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

// mode "floor": higher is better (protein, fiber) — under target warns/flags red.
// mode "budget": lower is better (calories, carbs, fat) — over target warns/flags red.
function macroStatusColor(pct, mode) {
  if (mode === "floor") {
    if (pct >= 100) return MACRO_STATUS_COLORS.good;
    if (pct >= 70) return MACRO_STATUS_COLORS.warn;
    return MACRO_STATUS_COLORS.over;
  }
  if (pct <= 100) return MACRO_STATUS_COLORS.good;
  if (pct <= 110) return MACRO_STATUS_COLORS.warn;
  return MACRO_STATUS_COLORS.over;
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
  if (w.type === "boulder") return (Number(w.boulder.minutes) > 0 || w.boulder.climbs.length > 0) ? "Done" : "Not started";
  return "—";
}

function mealTotals(meal) {
  let cal = 0, protein = 0, fat = 0, carbs = 0, fiber = 0;
  for (const [id, qty] of Object.entries(meal)) {
    const item = itemDef(id);
    if (!item || !qty) continue;
    cal += item.cal * qty;
    protein += item.protein * qty;
    fat += (item.fat || 0) * qty;
    carbs += (item.carbs || 0) * qty;
    fiber += (item.fiber || 0) * qty;
  }
  return { cal, protein, fat, carbs, fiber };
}

function dayTotals(day) {
  let cal = 0, protein = 0, fat = 0, carbs = 0, fiber = 0;
  for (const mealName of Object.keys(day.meals)) {
    const t = mealTotals(day.meals[mealName]);
    cal += t.cal;
    protein += t.protein;
    fat += t.fat;
    carbs += t.carbs;
    fiber += t.fiber;
  }
  return { cal, protein, fat, carbs, fiber };
}

// ---------- rendering shell ----------

// ---------- undo-on-delete ----------

let lastDeleted = null; // { message, restore() } — the most recent undoable delete, or null
let lastDeletedTimeoutId = null;

function recordUndo(message, restore) {
  lastDeleted = { message, restore };
  if (lastDeletedTimeoutId) clearTimeout(lastDeletedTimeoutId);
  lastDeletedTimeoutId = setTimeout(() => { lastDeleted = null; render(); }, 6000);
}

function undoLastDelete() {
  if (!lastDeleted) return;
  lastDeleted.restore();
  lastDeleted = null;
  if (lastDeletedTimeoutId) { clearTimeout(lastDeletedTimeoutId); lastDeletedTimeoutId = null; }
  saveState();
  render();
}

function render() {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === currentTab));
  const root = document.getElementById("view-root");
  const day = getOrCreateDay(viewDate);
  document.getElementById("day-counter").textContent = niceDate(viewDate);
  const streakBadge = document.getElementById("streak-badge");
  const streakCount = nutritionLoggingStreaks().current;
  if (streakCount > 0) {
    streakBadge.textContent = `🔥 ${streakCount}`;
    streakBadge.style.display = "";
  } else {
    streakBadge.style.display = "none";
  }

  let html = "";
  if (currentTab === "today") html = renderToday(day);
  else if (currentTab === "workouts") html = renderWorkouts();
  else if (currentTab === "progress") html = renderProgressShell();
  else if (currentTab === "climbing") html = renderClimbing();
  else if (currentTab === "settings") html = renderSettings();

  const undoBanner = lastDeleted ? `
    <div class="undo-banner">
      <span>${lastDeleted.message}</span>
      <button class="btn secondary" data-action="undoLastDelete">Undo</button>
    </div>
  ` : "";
  root.innerHTML = undoBanner + html;

  if (currentTab === "progress") hydrateProgress();
}

// ---------- Today tab ----------

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
      ${collapsibleCardHeader("meals", "Meals")}
      ${state.collapsedCards.meals ? "" : `
      <div class="toggle-pill" style="margin-top:10px;">
        ${MEAL_ORDER.map((m, i) => `<button data-action="setMealTab" data-idx="${i}" class="${i === mealTabIndex ? "active" : ""}">${MEAL_TAB_LABELS[m]}</button>`).join("")}
      </div>
      <div class="meal-swipe-area" data-swipe="meal" style="margin-top:12px;">
        ${renderMealInner(day, mealName, MEAL_TITLES[mealName])}
      </div>
      `}
    </div>`;
}

let quickAddOpen = false;
let editDefaultsOpen = false;
let quickAddExerciseOpen = false;
let quickAddCoreOpen = false;
let swapExerciseIndex = null; // index in day.workout.exercises currently showing the swap picker, or null
let foodPickerOpen = false;
let goalFormOpen = false;
let bodyWeightEntryUnit = "lb"; // which unit the Body-weight field currently expects typed input in
let waterEntryUnit = "oz"; // which unit the Water field currently expects typed input in
let goalFormSex = null; // live selection while the goal form is open, before it's saved
let comparePhotosOpen = false;
let compareBeforeId = null;
let compareAfterId = null;

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
  const notInTemplate = sortByUsage(allIds.filter(id => !(id in template)));
  const options = notInTemplate.map(id => `<option value="${id}">${itemDef(id).label}</option>`).join("");

  return `
    <div class="sheet-backdrop" data-action="toggleEditDefaults"></div>
    <div class="quick-add-form sheet-panel">
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
  const favorites = state.favoriteItems || {};
  const notInMeal = sortByUsage(allIds.filter(id => !(id in meal)))
    .slice()
    .sort((a, b) => (favorites[b] ? 1 : 0) - (favorites[a] ? 1 : 0));
  const hasTemplate = Object.keys(template).length > 0;

  return `
    <div class="row"><h3>${title}</h3><span class="meal-item-macro">${totals.cal} cal · ${totals.protein}g P · ${round1(totals.carbs)}g C · ${round1(totals.fat)}g F</span></div>
    ${rows}
    <div class="add-item-row" style="display:flex; gap:8px;">
      <button class="btn secondary" data-action="toggleFoodPicker" style="flex:1;">${foodPickerOpen ? "Close" : "+ add item…"}</button>
      ${hasTemplate ? `<button class="btn secondary" data-action="mealLogPlanned" data-meal="${mealName}">Log as planned</button>` : ""}
    </div>
    ${foodPickerOpen ? `
      <div class="sheet-backdrop" data-action="toggleFoodPicker"></div>
      <div class="quick-add-form sheet-panel">
        <input type="text" placeholder="Search foods…" data-action="filterFoodList" data-meal="${mealName}" style="margin-bottom:8px;">
        <div class="food-pick-list" id="food-pick-list-${mealName}">
          ${notInMeal.map(id => `
            <div class="food-pick-row" data-food-label="${itemDef(id).label.toLowerCase()}">
              <button class="star-btn ${favorites[id] ? "active" : ""}" data-action="toggleFavoriteItem" data-id="${id}">${favorites[id] ? "★" : "☆"}</button>
              <button class="btn secondary food-pick-add" data-action="mealAddItem" data-meal="${mealName}" data-id="${id}">${itemDef(id).label}</button>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}
    <div style="margin-top:8px;">
      <button class="btn secondary" data-action="toggleQuickAdd" style="width:100%;">${quickAddOpen ? "Cancel quick add" : "+ Quick add by macros"}</button>
      ${quickAddOpen ? `
        <div class="sheet-backdrop" data-action="toggleQuickAdd"></div>
        <div class="quick-add-form sheet-panel">
          <div class="field"><label>Name</label><input type="text" id="quickadd-name" placeholder="e.g. Family Mart onigiri"></div>
          <div class="two-col">
            <div class="field"><label>Calories</label><input type="number" inputmode="decimal" step="0.1" id="quickadd-cal" placeholder="cal"></div>
            <div class="field"><label>Protein (g)</label><input type="number" inputmode="decimal" step="0.1" id="quickadd-protein" placeholder="g"></div>
          </div>
          <div class="two-col">
            <div class="field"><label>Carbs (g)</label><input type="number" inputmode="decimal" step="0.1" id="quickadd-carbs" placeholder="g"></div>
            <div class="field"><label>Fat (g)</label><input type="number" inputmode="decimal" step="0.1" id="quickadd-fat" placeholder="g"></div>
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

// Days between the most recent finger-intensive session (bouldering or a completed hangboard
// timer run) strictly before asOfKey, and asOfKey itself — so a specific date (today, or a
// previewed future date) can check whether fingers will have recovered by then.
function daysSinceFingerLoadAsOf(asOfKey) {
  const dates = Object.entries(state.days)
    .filter(([k, d]) => k < asOfKey && ((d.completed && d.workout.type === "boulder") || (d.hangboardSessions || 0) > 0))
    .map(([k]) => k)
    .sort();
  if (!dates.length) return Infinity;
  const last = dates[dates.length - 1];
  return Math.floor((Date.parse(asOfKey) - Date.parse(last)) / 86400000);
}

// Days since the most recent finger-intensive session (bouldering or a completed hangboard
// timer run), so resistance/run days know whether it's safe to suggest more pulling work.
function daysSinceFingerLoad() {
  return daysSinceFingerLoadAsOf(formatDateKey(new Date()));
}

// Simple RPE-style auto-regulation: a recently-rated rough climbing session (1-2/5) keeps
// nudging away from bouldering for a bit longer than pure finger recovery alone accounts for.
function recentSessionWasRough(asOfKey) {
  const rated = Object.entries(state.days)
    .filter(([k, d]) => k < asOfKey && d.workout.type === "boulder" && d.workout.boulder.rating != null)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!rated.length) return false;
  const [lastKey, lastDay] = rated[rated.length - 1];
  const daysSince = Math.floor((Date.parse(asOfKey) - Date.parse(lastKey)) / 86400000);
  return lastDay.workout.boulder.rating <= 2 && daysSince < FINGER_RECOVERY_DAYS * 2;
}

// Recommends a workout type for dateKey given the type trained the day before (previousType),
// flexing the fixed weekly schedule around three constraints: never suggest bouldering before
// fingers have recovered, ease off bouldering a bit longer after a session rated rough, and
// avoid repeating the exact same training type two days running.
// Purely a *default* — setWorkoutType always lets the user override it for that day.
function suggestedWorkoutType(dateKey, previousType) {
  const scheduled = state.weeklySchedule[parseKey(dateKey).getDay()];
  if (!scheduled || scheduled === "rest") return scheduled;

  const fingersRecovered = daysSinceFingerLoadAsOf(dateKey) >= FINGER_RECOVERY_DAYS;
  const goodToBoulder = fingersRecovered && !recentSessionWasRough(dateKey);
  if (scheduled === "boulder" && !goodToBoulder) {
    return previousType === "resistance" ? "run" : "resistance";
  }
  if (scheduled === previousType) {
    const alternatives = ["resistance", "run", "boulder"].filter(t => t !== scheduled);
    return alternatives.find(t => t !== "boulder" || goodToBoulder) || "rest";
  }
  return scheduled;
}

function renderPullSuggestion(day) {
  if (day.workout.type !== "resistance" && day.workout.type !== "run") return "";
  if (daysSinceFingerLoad() < FINGER_RECOVERY_DAYS) return "";
  return `
    <div class="card">
      <h2>Climbing Strength</h2>
      <div class="meal-item-macro">Good day to tack on some pulling work: 3-5 sets of weighted pull-ups (bar), or 3×8-10 cable rows/lat pulldowns — bar/machine grips only, skip the block so fingers stay recovered.</div>
      <div class="meal-item-macro" style="margin-top:8px;">Balance it out: a few sets of push-ups, tricep pushdowns, or band external rotations — climbers tend to overdevelop pull vs. push, and that imbalance is what drives elbow tendinopathy.</div>
    </div>
  `;
}

// Current/longest streak of logging any food at all, across every day (not just scheduled
// training days) — mirrors climbingStreaks() but for daily nutrition logging habit.
function nutritionLoggingStreaks() {
  const startDate = parseKey(state.meta.startDate);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const hits = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const day = state.days[formatDateKey(d)];
    hits.push(!!(day && Object.values(day.meals).some(meal => Object.values(meal).some(qty => qty > 0))));
  }
  let longest = 0, running = 0;
  for (const h of hits) {
    if (h) { running++; longest = Math.max(longest, running); }
    else running = 0;
  }
  let current = 0;
  for (let i = hits.length - 1; i >= 0; i--) {
    if (hits[i]) current++; else break;
  }
  return { current, longest };
}

// Header row for a card that can be collapsed to just its title — persisted per-user
// in state.collapsedCards so density preference sticks across days/sessions.
function collapsibleCardHeader(cardId, title) {
  const collapsed = !!state.collapsedCards[cardId];
  return `<div class="row card-header-row" data-action="toggleCardCollapse" data-card="${cardId}"><h2 style="margin:0;">${title}</h2><span class="collapse-chevron">${collapsed ? "▸" : "▾"}</span></div>`;
}

function renderStretchingCard(day) {
  const stretches = day.stretchIds.map(id => STRETCH_LIBRARY.find(s => s.id === id)).filter(Boolean);
  if (!stretches.length) return "";
  const doneCount = stretches.filter(s => day.stretchesDone[s.id]).length;
  return `
    <div class="card">
      ${collapsibleCardHeader("stretching", "Stretching")}
      ${state.collapsedCards.stretching ? "" : `
      <div class="meal-item-macro" style="margin-top:10px; margin-bottom:8px;">${doneCount}/${stretches.length} done — ${STRETCH_HOLD_SECONDS}s each. Rotates daily so it's not the same 10 every time.</div>
      ${stretches.map(s => {
        const done = !!day.stretchesDone[s.id];
        const running = stretchTimerId === s.id;
        return `
        <div class="meal-item">
          <button class="todo-check ${done ? "checked" : ""}" data-action="toggleStretchDone" data-id="${s.id}"></button>
          <div class="todo-label">${s.label}<div class="meal-item-macro">${s.cue}</div></div>
          ${running
            ? `<span class="meal-item-macro" id="stretch-clock-${s.id}" style="font-weight:600; color:var(--text); flex-shrink:0;">${stretchTimerRemaining}s</span>`
            : `<button class="btn secondary" data-action="startStretchTimer" data-id="${s.id}" style="flex-shrink:0;">Start</button>`}
        </div>
        `;
      }).join("")}
      `}
    </div>
  `;
}

function renderToday(day) {
  const totals = dayTotals(day);
  const calTarget = calorieTargetFor(day) ?? (isTrainingDay(day) ? state.targets.calTrain : state.targets.calRest);
  const { protein: proteinTarget, fat: fatTarget, carbs: carbsTarget } = macroTargetsFor(day, calTarget);
  const waterTarget = waterTargetFor(day.workout.type);
  const waterOz = day.water.oz || 0;
  const waterTargetOzMin = waterTarget.min * BOTTLE_OZ;
  const waterTargetOzMax = waterTarget.max * BOTTLE_OZ;
  const waterPct = Math.min(100, Math.round((waterOz / waterTargetOzMax) * 100));

  const activityBadgeClass = day.workout.type || "rest";

  const rings = [
    { label: "cal", value: Math.round(totals.cal), target: calTarget, mode: "budget", suffix: "" },
    { label: "protein", value: Math.round(totals.protein), target: proteinTarget, mode: "floor", suffix: "g" },
    { label: "carbs", value: Math.round(totals.carbs), target: carbsTarget, mode: "budget", suffix: "g" },
    { label: "fat", value: round1(totals.fat), target: fatTarget, mode: "budget", suffix: "g" },
  ].map(r => ({ ...r, color: macroStatusColor((r.value / r.target) * 100, r.mode) }));

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
            <div class="ring-value" style="color:${r.color};">${r.value}/${r.target}${r.suffix}</div>
            <div class="ring-label">${r.label}</div>
          </div>
        `).join("")}
      </div>
      <div class="meal-item-macro" style="margin-top:6px; color:${macroStatusColor((totals.fiber / state.targets.fiber) * 100, "floor")};">Fiber: ${round1(totals.fiber)}/${state.targets.fiber}g</div>
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
      ${collapsibleCardHeader("checklist", "Daily checklist")}
      ${state.collapsedCards.checklist ? "" : `
      <div class="meal-item-macro" style="margin-bottom:8px; margin-top:10px;">Daily items reset fresh every morning. One-time tasks stick around until you check them off, then they're gone for good.</div>
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
      `}
    </div>

    ${renderMealSwipeCard(day)}

    <div class="card">
      ${collapsibleCardHeader("water", "Water")}
      ${state.collapsedCards.water ? "" : `
      <div class="meal-item-macro" style="margin-top:10px;">Plain water (and other zero/near-zero-calorie fluids like black coffee or tea) only — juice, shakes, milk, soda, and alcohol are already tracked in your meal log, so they don't need to be counted here too.</div>
      <div class="water-track" style="margin-top:10px;"><div class="water-fill" style="width:${waterPct}%"></div></div>
      <div class="field" style="margin-top:10px;">
        <label>${waterEntryUnit === "ml" ? "Milliliters logged today" : "Ounces logged today"}</label>
        <div class="toggle-pill" style="max-width:160px; margin-bottom:6px;">
          <button data-action="setWaterEntryUnit" data-unit="oz" class="${waterEntryUnit === "oz" ? "active" : ""}">oz</button>
          <button data-action="setWaterEntryUnit" data-unit="ml" class="${waterEntryUnit === "ml" ? "active" : ""}">ml</button>
        </div>
        <input type="number" inputmode="decimal" step="1" data-action="setWaterOz" value="${waterOz}">
      </div>
      <div class="row" style="gap:8px;">
        ${waterEntryUnit === "ml" ? `
        <button class="btn secondary" data-action="waterAddMl" data-ml="250" style="flex:1;">+250 ml</button>
        <button class="btn secondary" data-action="waterAddMl" data-ml="500" style="flex:1;">+500 ml</button>
        <button class="btn secondary" data-action="waterAddMl" data-ml="600" style="flex:1;">+600 ml</button>
        ` : `
        <button class="btn secondary" data-action="waterAdd" data-oz="8" style="flex:1;">+8 oz</button>
        <button class="btn secondary" data-action="waterAdd" data-oz="16" style="flex:1;">+16 oz</button>
        <button class="btn secondary" data-action="waterAdd" data-oz="20" style="flex:1;">+20 oz</button>
        `}
      </div>
      <div class="meal-item-macro" style="margin-top:6px;">target ${waterEntryUnit === "ml" ? `${Math.round(waterTargetOzMin * ML_PER_OZ)}${waterTargetOzMin === waterTargetOzMax ? "" : `-${Math.round(waterTargetOzMax * ML_PER_OZ)}`} ml` : `${waterTargetOzMin}${waterTargetOzMin === waterTargetOzMax ? "" : `-${waterTargetOzMax}`} oz`}${day.workout.type === "boulder" ? " (bumped for bouldering)" : ""}</div>
      `}
    </div>

    <div class="card">
      ${collapsibleCardHeader("steps", "Steps")}
      ${state.collapsedCards.steps ? "" : `
      <div class="field" style="margin-top:10px;">
        <label>From Apple Health</label>
        <input type="number" inputmode="numeric" placeholder="e.g. 8500" data-action="setSteps" value="${day.steps ?? ""}">
      </div>
      <div class="meal-item-macro" style="margin-top:6px;">target ${STEP_TARGET.min.toLocaleString()}-${STEP_TARGET.max.toLocaleString()} steps</div>
      `}
    </div>

    ${renderStretchingCard(day)}

    <div class="card">
      ${collapsibleCardHeader("workout", "Workout")}
      ${state.collapsedCards.workout ? "" : `
      <div class="toggle-pill" style="margin-top:10px;">
        ${["rest", "resistance", "run", "boulder"].map(t => `<button data-action="setWorkoutType" data-type="${t}" class="${day.workout.type === t ? "active" : ""}">${activityLabel(t)}</button>`).join("")}
      </div>
      <div style="margin-top:12px;">
        ${renderWorkoutBody(day)}
      </div>
      `}
    </div>

    ${renderPullSuggestion(day)}

    <div class="card">
      ${collapsibleCardHeader("body", "Body")}
      ${state.collapsedCards.body ? "" : `
      <div class="field" style="margin-top:10px;">
        <label>Weight (lb)</label>
        <div class="toggle-pill" style="max-width:160px; margin-bottom:6px;">
          <button data-action="setBodyWeightEntryUnit" data-unit="lb" class="${bodyWeightEntryUnit === "lb" ? "active" : ""}">lb</button>
          <button data-action="setBodyWeightEntryUnit" data-unit="kg" class="${bodyWeightEntryUnit === "kg" ? "active" : ""}">kg</button>
        </div>
        <div class="two-col">
          <div class="field"><label>AM</label><input type="number" inputmode="decimal" step="0.1" data-action="setWeight" data-period="am" value="${day.weightAM ?? ""}"></div>
          <div class="field"><label>PM</label><input type="number" inputmode="decimal" step="0.1" data-action="setWeight" data-period="pm" value="${day.weightPM ?? ""}"></div>
        </div>
      </div>
      <div class="field"><label>Waist (in)</label><input type="number" inputmode="decimal" step="0.1" data-action="setWaist" value="${day.waist ?? ""}"></div>
      <div class="field"><label>Notes</label><textarea data-action="setNotes">${day.notes || ""}</textarea></div>
      `}
    </div>

    <button class="btn secondary" data-action="clearDay" style="width:100%; margin-top:4px;">Clear this day</button>
  `;
}

// Ramp-up warm-up sets (40/60/80% of the working weight) before a barbell lift's
// working sets, rounded to a plate-friendly 2.5 increment.
function warmupSetSuggestions(workingWeightKg) {
  if (!workingWeightKg) return [];
  return [0.4, 0.6, 0.8].map(pct => Math.round((workingWeightKg * pct) / 2.5) * 2.5);
}

function lastSessionFor(name, beforeKey) {
  const rows = collectExerciseHistory(name).filter(r => r.dateKey < beforeKey);
  return rows.length ? rows[rows.length - 1] : null;
}

// Full set-by-set breakdown (not just the top set) from the most recent day this exercise
// was actually logged before beforeKey — powers "fill all sets from last session."
function lastFullSessionSets(name, beforeKey) {
  const dateKeys = Object.keys(state.days).filter(k => k < beforeKey).sort();
  for (let i = dateKeys.length - 1; i >= 0; i--) {
    const d = state.days[dateKeys[i]];
    if (d.workout.type !== "resistance") continue;
    const ex = d.workout.exercises.find(e => e.name === name);
    if (ex && ex.sets.length) return ex.sets.map(s => ({ weight: s.weight, reps: s.reps }));
  }
  return null;
}

// Recommends a same-movement-pattern alternative when swapping an exercise out (e.g. no
// cable machine today) — prefers whichever candidate hasn't been trained most recently,
// so it doubles as light exercise-variety rotation rather than always suggesting the same one.
function suggestAlternativeExercise(currentName, excludeNames) {
  const category = EXERCISE_CATEGORIES[currentName];
  if (!category) return null;
  const candidates = Object.keys(EXERCISE_CATEGORIES)
    .filter(name => EXERCISE_CATEGORIES[name] === category && name !== currentName && !excludeNames.includes(name));
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const lastA = lastSessionFor(a, viewDate)?.dateKey || "";
    const lastB = lastSessionFor(b, viewDate)?.dateKey || "";
    return lastA.localeCompare(lastB);
  });
  return candidates[0];
}

function renderExerciseSwapSheet(ex, exIdx, excludeNames) {
  const suggested = suggestAlternativeExercise(ex.name, excludeNames);
  const allNames = [...new Set([...RESISTANCE_EXERCISES, ...state.routines.flatMap(r => r.exercises.map(e => e.name))])].sort();
  return `
    <div class="sheet-backdrop" data-action="toggleSwapExercise" data-ex="${exIdx}"></div>
    <div class="quick-add-form sheet-panel">
      <div class="meal-item-macro" style="margin-bottom:8px;">Swap "${ex.name}" for today only — sets reset, your routine isn't changed.</div>
      ${suggested ? `<button class="btn secondary" data-action="selectSwapExerciseName" data-name="${suggested}" style="width:100%; margin-bottom:10px; border-color:var(--accent); color:var(--accent);">Suggested: ${suggested}</button>` : ""}
      <div class="field"><label>New exercise</label><input type="text" id="swap-exercise-name" placeholder="Search, or type a new exercise…" data-action="filterSwapExercisePickList" autocomplete="off" value="${ex.name}"></div>
      <div class="food-pick-list" id="swap-exercise-pick-list" style="margin-bottom:10px;">
        ${allNames.map(n => `
          <div class="food-pick-row" data-exercise-label="${n.toLowerCase()}">
            <button class="btn secondary food-pick-add" data-action="selectSwapExerciseName" data-name="${n}" style="width:100%;">${n}</button>
          </div>
        `).join("")}
      </div>
      <label style="display:flex; align-items:center; gap:6px; margin-bottom:10px; font-size:12px; color:var(--text-dim);">
        <input type="checkbox" id="swap-exercise-barbell" style="width:auto;" ${ex.barbell ? "checked" : ""}> Barbell (plate calculator)
      </label>
      <button class="btn" data-action="submitSwapExercise" data-ex="${exIdx}" style="width:100%;">Swap</button>
    </div>
  `;
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
      <div class="row">
        <h3 style="margin:0;">${ex.name}${ex.quickAdd ? ` <span class="recurring-tag">one-time</span>` : ""}</h3>
        ${ex.quickAdd ? `<button class="icon-btn" data-action="removeQuickAddCore" data-ex="${exIdx}">✕</button>` : ""}
      </div>
      <div class="meal-item-macro" style="margin-bottom:8px; margin-top:6px;">${coreTargetLabel(ex.type)}</div>
      ${ex.sets.map((s, sIdx) => {
        const isRunning = ex.type === "duration" && coreStopwatchKey === `${exIdx}-${sIdx}`;
        const stopwatchHtml = ex.type !== "duration" ? "" : isRunning
          ? `<button class="btn secondary" data-action="stopCoreStopwatch" data-ex="${exIdx}" data-set="${sIdx}" style="min-width:76px;">■ <span id="core-stopwatch-${exIdx}-${sIdx}">${formatMMSS(coreStopwatchElapsed)}</span></button>`
          : `<button class="btn secondary" data-action="startCoreStopwatch" data-ex="${exIdx}" data-set="${sIdx}" style="min-width:76px;">▶ Start</button>`;
        return `
        <div class="set-row-flex">
          <div class="set-num">${sIdx + 1}</div>
          ${fields.map(f => `<input type="number" inputmode="decimal" placeholder="${f.placeholder}" data-action="setCoreField" data-ex="${exIdx}" data-set="${sIdx}" data-field="${f.field}" value="${f.field === "weight" ? toDisplayWeight(s.weight) : (s[f.field] ?? "")}">`).join("")}
          ${stopwatchHtml}
          <button class="remove-set" data-action="removeCoreSet" data-ex="${exIdx}" data-set="${sIdx}">✕</button>
        </div>
      `;
      }).join("")}
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

function renderBoulderGrid(sessionType, grid) {
  const config = BOULDER_GRID_CONFIG[sessionType];
  if (!config || !grid.length) return "";
  return `
    <h3 style="margin-bottom:8px;">${sessionType} Tracker</h3>
    ${grid.map((row, r) => `
      <div class="grid-row">
        <div class="grid-row-label">${config.rowLabel} ${r + 1}</div>
        <div class="grid-cells">
          ${row.map((cell, c) => `<button class="grid-cell ${cell || ""}" data-action="toggleGridCell" data-row="${r}" data-col="${c}">${cell === "done" ? "✓" : cell === "fail" ? "✕" : ""}</button>`).join("")}
        </div>
      </div>
    `).join("")}
    <button class="btn secondary" data-action="addGridRow" style="width:100%; margin-top:8px;">+ Extra ${config.rowLabel.toLowerCase()} (got more in the tank)</button>
  `;
}

// Start/End session timer, shared by resistance and boulder — resistance has no other
// duration input so this becomes its only accurate time source; boulder uses it to fill
// the existing "Session length" field instead of you having to guess/estimate it.
function renderWorkoutTimerControl(day) {
  const w = day.workout;
  if (w.startedAt) {
    if (!workoutTimerIntervalId) {
      workoutTimerIntervalId = setInterval(() => {
        const clockEl = document.getElementById("workout-timer-clock");
        if (!clockEl) { clearInterval(workoutTimerIntervalId); workoutTimerIntervalId = null; return; }
        clockEl.textContent = formatMMSS((Date.now() - w.startedAt) / 1000);
      }, 1000);
    }
    return `
      <div class="timer-display" style="padding:10px 0; margin-bottom:12px;">
        <div class="timer-phase">Workout in progress</div>
        <div class="timer-clock" id="workout-timer-clock" style="font-size:28px;">${formatMMSS((Date.now() - w.startedAt) / 1000)}</div>
        <button class="btn secondary" data-action="endWorkoutTimer" style="margin-top:8px;">⏹ End workout</button>
      </div>
    `;
  }
  return `
    <div class="row" style="margin-bottom:12px; gap:8px;">
      <button class="btn secondary" data-action="startWorkoutTimer" style="flex:1;">▶ Start workout</button>
      ${w.durationMinutes != null ? `<div class="activity-chip">Last: ${Math.round(w.durationMinutes)} min</div>` : ""}
    </div>
  `;
}

function renderWorkoutBody(day) {
  const w = day.workout;
  if (w.type === "resistance") {
    const routine = routineForDay(day);
    const routineHeader = routine.name ? `<div class="meal-item-macro" style="margin-bottom:10px;">Routine: <strong>${routine.name}</strong></div>` : "";
    const restBanner = restTimerRemaining > 0 ? `
      <div class="timer-display rest" style="padding:12px 0; margin-bottom:12px;">
        <div class="timer-phase">Resting</div>
        <div class="timer-clock" id="rest-timer-clock" style="font-size:32px;">${formatMMSS(restTimerRemaining)}</div>
        <button class="btn secondary" data-action="skipRestTimer" style="margin-top:8px;">Skip</button>
      </div>
    ` : "";
    return renderWorkoutTimerControl(day) + restBanner + routineHeader + w.exercises.map((ex, exIdx) => {
      const last = lastSessionFor(ex.name, viewDate);
      const lastFullSets = lastFullSessionSets(ex.name, viewDate);
      return `
      <div class="exercise-block">
        <div class="row">
          <h3 style="margin:0;">${ex.name}${ex.quickAdd ? ` <span class="recurring-tag">one-time</span>` : ""}</h3>
          <div style="display:flex; gap:6px;">
            <button class="icon-btn" data-action="toggleSwapExercise" data-ex="${exIdx}" aria-label="Swap exercise">⇄</button>
            ${ex.quickAdd ? `<button class="icon-btn" data-action="removeQuickAddExercise" data-ex="${exIdx}">✕</button>` : ""}
          </div>
        </div>
        ${swapExerciseIndex === exIdx ? renderExerciseSwapSheet(ex, exIdx, w.exercises.filter((_, i) => i !== exIdx).map(e => e.name)) : ""}
        <input type="text" placeholder="Add a cue/note…" data-action="setExerciseNote" data-name="${ex.name}" value="${state.exerciseNotes[ex.name] || ""}" style="font-size:12px; padding:6px 8px; margin-bottom:8px; margin-top:6px;">
        <div class="meal-item-macro">Target: ${routine.setTarget.min}-${routine.setTarget.max} sets × ${routine.repTarget.min}-${routine.repTarget.max} reps</div>
        <div class="meal-item-macro" style="margin-bottom:8px;">${progressionNote(last, routine)}</div>
        ${ex.barbell && last ? `<div class="meal-item-macro" style="margin-bottom:8px;">Warm-up ramp: ${warmupSetSuggestions(last.weight).map(w => formatKgLb(w)).join(" → ")} → ${formatKgLb(last.weight)} working</div>` : ""}
        ${(() => {
          const priorBest = priorBestEst1RM(ex.name);
          return ex.sets.map((s, sIdx) => `
          <div class="set-row">
            <div class="set-num">${sIdx + 1}</div>
            <input type="number" inputmode="decimal" placeholder="${state.weightUnit}" data-action="setField" data-ex="${exIdx}" data-set="${sIdx}" data-field="weight" value="${toDisplayWeight(s.weight)}">
            <input type="number" inputmode="numeric" placeholder="${routine.repTarget.min}-${routine.repTarget.max}" data-action="setField" data-ex="${exIdx}" data-set="${sIdx}" data-field="reps" value="${s.reps ?? ""}">
            <button class="remove-set" data-action="removeSet" data-ex="${exIdx}" data-set="${sIdx}">✕</button>
          </div>
          ${ex.barbell ? `<div data-plate-for="${exIdx}-${sIdx}">${renderPlateCalc(s.weight)}</div>` : ""}
          ${isSetPR(s.weight, s.reps, priorBest) ? `<div class="pr-badge">🏆 New PR — est. 1RM ${formatKgLb(estimated1RM(Number(s.weight) || 0, Number(s.reps) || 0))}</div>` : ""}
        `).join("");
        })()}
        <div class="row" style="gap:8px;">
          <button class="btn secondary" data-action="addSet" data-ex="${exIdx}" style="flex:1;">+ Add set</button>
          ${ex.sets.length ? `<button class="btn secondary" data-action="repeatLastSet" data-ex="${exIdx}" style="flex:1;">Repeat last set</button>` : ""}
        </div>
        ${lastFullSets ? `<button class="btn secondary" data-action="fillFromLastSession" data-ex="${exIdx}" style="width:100%; margin-top:8px;">Fill from last session (${lastFullSets.length} set${lastFullSets.length === 1 ? "" : "s"})</button>` : ""}
      </div>
    `;
    }).join("") + `
      <div style="margin-top:8px;">
        <button class="btn secondary" data-action="toggleQuickAddExercise" style="width:100%;">${quickAddExerciseOpen ? "Cancel" : "+ Quick add an exercise (one-time)"}</button>
        ${quickAddExerciseOpen ? `
          <div class="sheet-backdrop" data-action="toggleQuickAddExercise"></div>
          <div class="quick-add-form sheet-panel">
            <div class="field"><label>Exercise name</label><input type="text" id="quickadd-exercise-name" placeholder="Search, or type a new exercise…" data-action="filterExercisePickList" autocomplete="off"></div>
            <div class="food-pick-list" id="quickadd-exercise-pick-list" style="margin-bottom:10px;">
              ${[...new Set([...RESISTANCE_EXERCISES, ...state.routines.flatMap(r => r.exercises.map(e => e.name))])].sort().map(n => `
                <div class="food-pick-row" data-exercise-label="${n.toLowerCase()}">
                  <button class="btn secondary food-pick-add" data-action="selectQuickAddExerciseName" data-name="${n}" style="width:100%;">${n}</button>
                </div>
              `).join("")}
            </div>
            <label style="display:flex; align-items:center; gap:6px; margin-bottom:10px; font-size:12px; color:var(--text-dim);">
              <input type="checkbox" id="quickadd-exercise-barbell" style="width:auto;"> Barbell (plate calculator)
            </label>
            <button class="btn" data-action="submitQuickAddExercise" style="width:100%;">Add for today</button>
          </div>
        ` : ""}
      </div>
    `;
  }
  if (w.type === "run") {
    const restBanner = restTimerRemaining > 0 ? `
      <div class="timer-display rest" style="padding:12px 0; margin-bottom:12px;">
        <div class="timer-phase">Resting</div>
        <div class="timer-clock" id="rest-timer-clock" style="font-size:32px;">${formatMMSS(restTimerRemaining)}</div>
        <button class="btn secondary" data-action="skipRestTimer" style="margin-top:8px;">Skip</button>
      </div>
    ` : "";
    return `
      <div class="two-col">
        <div class="field"><label>Miles</label><input type="number" inputmode="decimal" step="0.1" data-action="setRunField" data-field="miles" value="${w.run.miles}"></div>
        <div class="field"><label>Minutes</label><input type="number" inputmode="numeric" data-action="setRunField" data-field="minutes" value="${w.run.minutes}"></div>
      </div>
      <h3 style="margin-top:16px; margin-bottom:4px;">Core work</h3>
      <div class="meal-item-macro" style="margin-bottom:10px;">10-15 min total, progressive — add reps/time/weight weekly</div>
      ${restBanner}
      ${w.core.map((ex, exIdx) => renderCoreExerciseBlock(ex, exIdx)).join("")}
      <div style="margin-top:8px;">
        <button class="btn secondary" data-action="toggleQuickAddCore" style="width:100%;">${quickAddCoreOpen ? "Cancel" : "+ Quick add a core exercise (one-time)"}</button>
        ${quickAddCoreOpen ? `
          <div class="sheet-backdrop" data-action="toggleQuickAddCore"></div>
          <div class="quick-add-form sheet-panel">
            <div class="field"><label>Exercise name</label><input type="text" id="quickadd-core-name" placeholder="e.g. Side Plank"></div>
            <div class="field">
              <label>Type</label>
              <select id="quickadd-core-type">
                <option value="reps">Reps (bodyweight)</option>
                <option value="duration">Duration (timed hold)</option>
                <option value="weighted-reps">Weighted reps</option>
              </select>
            </div>
            <button class="btn" data-action="submitQuickAddCore" style="width:100%;">Add for today</button>
          </div>
        ` : ""}
      </div>
    `;
  }
  if (w.type === "boulder") {
    const climbs = w.boulder.climbs;
    const tally = CLIMBING_GRADES.map(g => ({ grade: g, count: climbs.filter(c => c.grade === g).length })).filter(t => t.count > 0);
    const warmupDone = w.boulder.warmupDone;
    const restBanner = restTimerRemaining > 0 ? `
      <div class="timer-display rest" style="padding:12px 0; margin-bottom:12px;">
        <div class="timer-phase">Resting</div>
        <div class="timer-clock" id="rest-timer-clock" style="font-size:32px;">${formatMMSS(restTimerRemaining)}</div>
        <button class="btn secondary" data-action="skipRestTimer" style="margin-top:8px;">Skip</button>
      </div>
    ` : "";
    const warmupChecklist = `
      <h3 style="margin-bottom:8px;">Warm-up</h3>
      ${CLIMBING_WARMUP_STEPS.map((step, i) => `
        <div class="meal-item">
          <button class="todo-check ${warmupDone[i] ? "checked" : ""}" data-action="toggleWarmupStep" data-idx="${i}"></button>
          <div class="todo-label">${step.label}</div>
        </div>
      `).join("")}
    `;
    return `
      ${renderWorkoutTimerControl(day)}
      ${warmupChecklist}
      ${restBanner}
      ${renderClimbingPhaseNote(day)}
      <div class="field">
        <label>Session type</label>
        <div class="toggle-pill">
          ${BOULDER_SESSION_TYPES.map(t => `<button data-action="setBoulderSessionType" data-type="${t}" class="${w.boulder.sessionType === t ? "active" : ""}">${t}</button>`).join("")}
        </div>
      </div>
      ${w.boulder.sessionType ? `<div class="meal-item-macro" style="margin-bottom:10px;">${BOULDER_SESSION_GUIDANCE[w.boulder.sessionType]}</div>` : ""}
      ${renderBoulderGrid(w.boulder.sessionType, w.boulder.grid)}
      <div class="field"><label>Session length (minutes)</label><input type="number" inputmode="numeric" data-action="setBoulderMinutes" value="${w.boulder.minutes}"></div>
      <h3 style="margin-top:16px; margin-bottom:8px;">Log a climb</h3>
      <div class="grade-grid">
        ${CLIMBING_GRADES.map(g => `<button class="btn secondary" data-action="logClimb" data-grade="${g}">${g}</button>`).join("")}
      </div>
      ${climbs.length ? `
        <div class="meal-item-macro" style="margin-top:10px;">${climbs.length} climb${climbs.length === 1 ? "" : "s"} — ${tally.map(t => `${t.grade}×${t.count}`).join(", ")}</div>
        <div style="margin-top:8px;">
          ${climbs.map((c, i) => `
            <div class="meal-item">
              <div class="meal-item-label">${c.grade}</div>
              <div class="row" style="gap:6px; flex:0 0 auto;">
                <button class="btn secondary" data-action="cycleClimbOutcome" data-idx="${i}" style="padding:4px 10px; font-size:12px;">${c.outcome || "Send"}</button>
                ${c.photoId
                  ? `<button class="icon-btn" data-action="viewClimbPhoto" data-idx="${i}">🖼</button>`
                  : `<label class="icon-btn" style="display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">📷<input type="file" accept="image/*" capture="environment" data-action="addClimbPhoto" data-idx="${i}" style="display:none;"></label>`}
                <button class="icon-btn" data-action="removeClimb" data-idx="${i}">✕</button>
              </div>
            </div>
            <div data-climb-photo-view="${i}" data-expanded="0"></div>
          `).join("")}
        </div>
      ` : `<div class="empty-state" style="margin-top:10px;">No climbs logged yet — tap a grade above as you send.</div>`}
      <h3 style="margin-top:16px; margin-bottom:8px;">Session rating</h3>
      <div class="row" style="gap:6px;">
        ${[1, 2, 3, 4, 5].map(n => `<button class="btn ${w.boulder.rating === n ? "" : "secondary"}" data-action="setBoulderRating" data-value="${n}" style="flex:1;">${n}</button>`).join("")}
      </div>
    `;
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
  let previousType = state.days[addDays(todayKey, -1)]?.workout.type ?? null;
  for (let i = 0; i < daysAhead; i++) {
    const key = addDays(todayKey, i);
    const existing = state.days[key];
    const scheduled = existing ? existing.workout.type : suggestedWorkoutType(key, previousType);
    previousType = scheduled;
    rows.push(`
      <div class="meal-item">
        <div class="meal-item-label">${i === 0 ? "Today — " : ""}${niceDate(key)}</div>
        <span class="badge ${scheduled || "rest"}">${scheduledActivityLabel(scheduled)}${!existing ? " (predicted)" : ""}</span>
      </div>
    `);
  }
  return `
    <div class="card">
      <h2>Upcoming schedule</h2>
      <div class="meal-item-macro" style="margin-bottom:8px;">Adapts to what you actually did the day before — gated by finger recovery and recent session ratings, not locked to the fixed weekly slot. Always overridable on the day.</div>
      ${rows.join("")}
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
        <div class="two-col">
          <div class="field"><label>Weight step (${state.weightUnit})</label><input type="number" inputmode="decimal" step="0.5" data-action="setRoutineField" data-routine="${routine.id}" data-field="weightStep" value="${toDisplayWeight(routine.weightStepKg)}"></div>
          <div class="field"><label>Rest between sets (sec)</label><input type="number" inputmode="numeric" step="5" data-action="setRoutineField" data-routine="${routine.id}" data-field="restSeconds" value="${routine.restSeconds}"></div>
        </div>
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

// Epley formula estimate; weight/output stay in whatever unit the input weight is (kg internally).
function estimated1RM(weight, reps) {
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Highest estimated 1RM ever logged for this exercise strictly before today — the bar a
// set logged today needs to clear to count as a new PR.
function priorBestEst1RM(name) {
  return collectExerciseHistory(name)
    .filter(r => r.dateKey < viewDate)
    .reduce((max, r) => Math.max(max, estimated1RM(r.weight, r.reps)), 0);
}

function isSetPR(weightKg, reps, priorBest) {
  const w = Number(weightKg) || 0;
  const r = Number(reps) || 0;
  if (!w || !r) return false;
  return estimated1RM(w, r) > priorBest;
}

function renderExerciseProgressionCard(name) {
  const rows = collectExerciseHistory(name);
  const recent = rows.slice(-8).reverse();
  const weightPoints = rows.map(r => ({ x: r.dateKey, y: r.weight }));
  const oneRMPoints = rows.map(r => ({ x: r.dateKey, y: estimated1RM(r.weight, r.reps) }));
  const chart = rows.length > 1 ? lineChartSVG([weightPoints, oneRMPoints], ["#4fd1c5", "#EF9F27"]) : "";
  const latest1RM = rows.length ? oneRMPoints[oneRMPoints.length - 1].y : null;
  return `
    <div class="card" data-exercise-name="${name.toLowerCase()}">
      <h3>${name}</h3>
      ${chart ? `<div class="meal-item-macro" style="margin-bottom:4px;">Top set (teal) vs. estimated 1RM (orange)${latest1RM != null ? ` — currently ~${formatKgLb(latest1RM)}` : ""}</div><div class="chart-wrap">${chart}</div>` : ""}
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
    .filter(([, d]) => d.completed && (d.workout.type === "run" || d.workout.type === "boulder"))
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
            : `${d.workout.boulder.sessionType ? `${d.workout.boulder.sessionType} · ` : ""}${d.workout.boulder.minutes || 0} min${d.workout.boulder.climbs && d.workout.boulder.climbs.length ? ` · ${d.workout.boulder.climbs.length} climb${d.workout.boulder.climbs.length === 1 ? "" : "s"}` : ""}`}</td>
        </tr>
      `).join("")}
    </table>
  ` : `<div class="empty-state">No cardio sessions logged yet</div>`;

  return `
    ${renderUpcomingSchedule(14)}
    ${renderDeloadReminder()}
    ${renderRoutineManager()}
    <div class="card">
      <h2>Resistance progression</h2>
      <input type="text" placeholder="Filter exercises…" data-action="filterExerciseList">
    </div>
    ${renderResistanceProgression()}
    ${renderTonnageChart()}
    <div class="card"><h2>Run / boulder log</h2>${cardioTable}</div>
  `;
}

// ---------- Progress tab ----------

function renderGoalCard() {
  const g = state.goal;
  const latestWeight = latestKnownWeight();

  if (!g || goalFormOpen) {
    const d = g || {};
    const sex = goalFormSex || d.sex || "male";
    return `
      <div class="card">
        <h2>Weight Goal</h2>
        <div class="toggle-pill">
          <button data-action="setGoalSex" data-sex="male" class="${sex === "male" ? "active" : ""}">Male</button>
          <button data-action="setGoalSex" data-sex="female" class="${sex === "female" ? "active" : ""}">Female</button>
        </div>
        <div class="two-col" style="margin-top:10px;">
          <div class="field"><label>Height (in)</label><input type="number" inputmode="decimal" step="0.1" id="goal-height" value="${d.heightIn ?? ""}"></div>
          <div class="field"><label>Age</label><input type="number" inputmode="numeric" id="goal-age" value="${d.age ?? ""}"></div>
        </div>
        <div class="two-col">
          <div class="field"><label>Starting weight (lb)</label><input type="number" inputmode="decimal" step="0.1" id="goal-start" value="${d.startWeight ?? latestWeight ?? ""}"></div>
          <div class="field"><label>Goal weight (lb)</label><input type="number" inputmode="decimal" step="0.1" id="goal-target" value="${d.goalWeight ?? ""}"></div>
        </div>
        <div class="field"><label>Weeks to reach goal</label><input type="number" inputmode="decimal" step="0.5" id="goal-weeks" value="${d.weeks ?? ""}"></div>
        <div class="row" style="gap:8px;">
          <button class="btn" data-action="submitGoal" style="flex:1;">Save goal</button>
          ${g ? `<button class="btn secondary" data-action="toggleGoalForm" style="flex:1;">Cancel</button>` : ""}
        </div>
      </div>
    `;
  }

  const weeklyRate = (g.goalWeight - g.startWeight) / g.weeks;
  const elapsedWeeks = Math.max(0, Math.floor((Date.parse(formatDateKey(new Date())) - Date.parse(g.startDate)) / (7 * 86400000)));
  const weeksLeft = Math.max(0, g.weeks - elapsedWeeks);
  const today = getOrCreateDay(formatDateKey(new Date()));
  const todayTarget = calorieTargetFor(today);
  const todayMacros = macroTargetsFor(today, todayTarget);
  const rateWarning = Math.abs(weeklyRate) > 2 ? `<div class="meal-item-macro" style="color:var(--warn); margin-top:6px;">⚠ ${Math.abs(weeklyRate).toFixed(1)} lb/week is an aggressive rate — consider a longer timeframe.</div>` : "";
  const pace = goalPaceStatus();
  const paceLine = !pace
    ? `<div class="meal-item-macro">Log your weight on the Today tab to see pace vs. plan.</div>`
    : Math.abs(pace.aheadBy) < 1
      ? `<div class="meal-item-macro">On pace — expected ~${pace.expected} lb today, you're at ${pace.actual} lb.</div>`
      : pace.aheadBy > 0
        ? `<div class="meal-item-macro" style="color:var(--good);">${pace.aheadBy.toFixed(1)} lb ahead of pace (expected ~${pace.expected} lb, you're at ${pace.actual} lb).</div>`
        : `<div class="meal-item-macro" style="color:var(--warn);">${Math.abs(pace.aheadBy).toFixed(1)} lb behind pace (expected ~${pace.expected} lb, you're at ${pace.actual} lb).</div>`;

  return `
    <div class="card">
      <div class="row"><h2 style="margin:0;">Weight Goal</h2><button class="icon-btn" data-action="toggleGoalForm">✎</button></div>
      <div class="meal-item-macro">${g.startWeight} → ${g.goalWeight} lb over ${g.weeks} weeks (${weeklyRate >= 0 ? "+" : ""}${weeklyRate.toFixed(1)} lb/week)</div>
      <div class="meal-item-macro">${weeksLeft} of ${g.weeks} weeks left</div>
      ${paceLine}
      <div class="meal-item-macro" style="margin-top:6px;">Today's target: <strong style="color:var(--text);">${todayTarget} cal</strong> · ${todayMacros.protein}g protein · ${todayMacros.carbs}g carbs · ${todayMacros.fat}g fat</div>
      ${rateWarning}
      <div class="row" style="margin-top:10px;">
        <button class="btn secondary" data-action="clearGoal" style="width:100%;">Clear goal</button>
      </div>
    </div>
  `;
}

function daysSinceLastExport() {
  if (!state.lastExportAt) return null;
  return Math.floor((Date.now() - Date.parse(state.lastExportAt)) / 86400000);
}

function renderBackupStatus() {
  const daysSince = daysSinceLastExport();
  if (daysSince === null) {
    return `<div class="meal-item-macro" style="color:var(--warn); margin-bottom:8px;">⚠ You haven't exported a backup yet — everything lives only in this browser.</div>`;
  }
  if (daysSince > 14) {
    return `<div class="meal-item-macro" style="color:var(--warn); margin-bottom:8px;">⚠ Last backup was ${daysSince} days ago — consider exporting again.</div>`;
  }
  return `<div class="meal-item-macro" style="margin-bottom:8px;">Last backup: ${daysSince === 0 ? "today" : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`}.</div>`;
}

function weeklyHardestGradeSeries() {
  const all = allClimbsHistory();
  const weekOf = (dateKey) => {
    const d = parseKey(dateKey);
    const diffToMonday = (d.getDay() + 6) % 7; // days since most recent Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() - diffToMonday);
    return formatDateKey(monday);
  };
  const weekMax = {};
  for (const c of all) {
    const wk = weekOf(c.dateKey);
    const idx = CLIMBING_GRADES.indexOf(c.grade);
    if (weekMax[wk] === undefined || idx > weekMax[wk]) weekMax[wk] = idx;
  }
  return Object.entries(weekMax).map(([x, y]) => ({ x, y })).sort((a, b) => a.x.localeCompare(b.x));
}

function renderClimbingProgressChart() {
  const series = weeklyHardestGradeSeries();
  if (series.length < 2) {
    return `<div class="card"><h2>Climbing progress</h2><div class="empty-state">Log climbs across at least 2 weeks to see a trend</div></div>`;
  }
  const latest = series[series.length - 1];
  return `
    <div class="card">
      <h2>Climbing progress</h2>
      <div class="meal-item-macro" style="margin-bottom:8px;">Hardest grade per week — currently ${CLIMBING_GRADES[latest.y]}</div>
      <div class="chart-wrap">${lineChartSVG([series], ["#4fd1c5"])}</div>
    </div>
  `;
}

function sessionTonnage(day) {
  let tonnage = 0;
  for (const ex of day.workout.exercises) {
    for (const s of ex.sets) {
      tonnage += (toDisplayWeight(s.weight) || 0) * (Number(s.reps) || 0);
    }
  }
  return Math.round(tonnage);
}

function tonnageSeries() {
  return Object.entries(state.days)
    .filter(([, d]) => d.workout.type === "resistance")
    .map(([k, d]) => ({ x: k, y: sessionTonnage(d) }))
    .filter(p => p.y > 0)
    .sort((a, b) => a.x.localeCompare(b.x));
}

// Weeks since the last marked deload (or since the plan started, if never marked).
// Manual rather than auto-detected from tonnage — inferring "lightness" from noisy
// session-to-session tonnage swings would be unreliable; a one-tap marker is honest.
function weeksSinceDeload() {
  const base = state.lastDeloadDate || state.meta.startDate;
  const days = Math.floor((Date.now() - parseKey(base).getTime()) / 86400000);
  return Math.floor(days / 7);
}

function renderDeloadReminder() {
  const weeks = weeksSinceDeload();
  if (weeks < 6) return "";
  return `
    <div class="card">
      <h2>Deload check-in</h2>
      <div class="meal-item-macro" style="margin-bottom:8px;">It's been ${weeks} weeks since your last lighter week — a deload roughly every 4-8 weeks helps avoid chronic under-recovery.</div>
      <button class="btn secondary" data-action="markDeload" style="width:100%;">Mark this week as a deload</button>
    </div>
  `;
}

function renderTonnageChart() {
  const series = tonnageSeries();
  if (series.length < 2) {
    return `<div class="card"><h2>Training volume</h2><div class="empty-state">Log at least 2 resistance sessions to see a trend</div></div>`;
  }
  const latest = series[series.length - 1];
  return `
    <div class="card">
      <h2>Training volume</h2>
      <div class="meal-item-macro" style="margin-bottom:8px;">Total weight × reps per session (${state.weightUnit}) — latest: ${latest.y.toLocaleString()}</div>
      <div class="chart-wrap">${lineChartSVG([series], ["#378ADD"])}</div>
    </div>
  `;
}

function renderProgressShell() {
  return `
    ${renderGoalCard()}
    <div class="card">
      <h2>Weight trend</h2>
      <div id="weight-trend-summary" class="meal-item-macro" style="margin-bottom:8px;"></div>
      <div id="weight-chart-slot" class="chart-wrap"><div class="empty-state">Loading…</div></div>
    </div>
    <div class="card">
      <h2>Waist trend</h2>
      <div class="meal-item-macro" style="margin-bottom:8px;">A steadier read on visible fat loss than the scale — track this if the gut is what you actually care about.</div>
      <div id="waist-trend-summary" class="meal-item-macro" style="margin-bottom:8px;"></div>
      <div id="waist-chart-slot" class="chart-wrap"><div class="empty-state">Loading…</div></div>
    </div>
    <div class="card">
      <h2>Photos</h2>
      <input type="file" accept="image/*" capture="environment" data-action="addPhoto" style="margin-bottom:10px;">
      <div id="photo-grid-slot" class="photo-grid"></div>
      <div style="margin-top:12px;">
        <button class="btn secondary" data-action="toggleComparePhotos" style="width:100%;">${comparePhotosOpen ? "Close comparison" : "Compare photos"}</button>
        ${comparePhotosOpen ? `<div id="compare-photos-slot" style="margin-top:10px;"><div class="empty-state">Loading…</div></div>` : ""}
      </div>
    </div>
  `;
}

function renderSettings() {
  return `
    <button class="btn secondary" data-action="backFromSettings" style="margin-bottom:12px;">← Back</button>
    <div class="card">
      <h2>Appearance</h2>
      <div class="toggle-pill">
        <button data-action="setTheme" data-theme="dark" class="${state.theme === "dark" ? "active" : ""}">Dark</button>
        <button data-action="setTheme" data-theme="light" class="${state.theme === "light" ? "active" : ""}">Light</button>
      </div>
    </div>
    <div class="card">
      <h2>Weekly schedule</h2>
      <div class="meal-item-macro" style="margin-bottom:10px;">Sets the recurring weekly pattern going forward. Days you've already logged won't change.</div>
      ${renderScheduleEditor()}
    </div>
    <div class="card">
      <h2>Backup</h2>
      ${renderBackupStatus()}
      <div class="row">
        <button class="btn secondary" data-action="exportData">Export JSON</button>
        <label class="btn secondary" style="text-align:center;">
          Import JSON
          <input type="file" accept="application/json" data-action="importData" style="display:none;">
        </label>
      </div>
      <button class="btn secondary" data-action="exportCSV" style="width:100%; margin-top:8px;">Export CSV (weight/nutrition history)</button>
    </div>
    <div class="card">
      <h2>Storage</h2>
      ${renderStorageHealth()}
    </div>
  `;
}

function storageStats() {
  const json = JSON.stringify(state);
  return { sizeKB: Math.round((json.length / 1024) * 10) / 10, dayCount: Object.keys(state.days).length };
}

function oldDayKeys(monthsBack = 6) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffKey = formatDateKey(cutoff);
  return Object.keys(state.days).filter(k => k < cutoffKey);
}

function renderStorageHealth() {
  const stats = storageStats();
  const oldKeys = oldDayKeys(6);
  return `
    <div class="meal-item-macro" style="margin-bottom:8px;">Storing ${stats.dayCount} day${stats.dayCount === 1 ? "" : "s"} of history (~${stats.sizeKB} KB).</div>
    ${oldKeys.length
      ? `<button class="btn secondary" data-action="archiveOldDays" style="width:100%;">Archive & remove ${oldKeys.length} day${oldKeys.length === 1 ? "" : "s"} older than 6 months</button>`
      : `<div class="meal-item-macro">No data older than 6 months yet.</div>`}
  `;
}

function archiveOldDays() {
  const oldKeys = oldDayKeys(6);
  if (!oldKeys.length) return;
  const archive = {};
  oldKeys.forEach(k => { archive[k] = state.days[k]; });
  const blob = new Blob([JSON.stringify(archive)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ledge-archive-${formatDateKey(new Date())}.json`;
  a.click();
  oldKeys.forEach(k => delete state.days[k]);
  saveState();
  render();
}

// ---------- Climbing history aggregation (grade pyramid, hardest send, progress chart) ----------

let _climbsHistoryCache = null;
let _climbsHistoryCacheVersion = -1;

// Scans every logged day, so it's cached against dataVersion — grade pyramid, hardest
// send, the weekly progress chart, and the weekly report card all call this, and it
// would otherwise re-scan full history from scratch on every single render.
function allClimbsHistory() {
  if (_climbsHistoryCacheVersion === dataVersion) return _climbsHistoryCache;
  const entries = [];
  for (const [dateKey, d] of Object.entries(state.days)) {
    const climbs = d.workout && d.workout.boulder && d.workout.boulder.climbs;
    if (climbs) for (const c of climbs) entries.push({ dateKey, grade: c.grade, outcome: c.outcome });
  }
  entries.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  _climbsHistoryCache = entries;
  _climbsHistoryCacheVersion = dataVersion;
  return entries;
}

function hardestSend() {
  const all = allClimbsHistory();
  let best = null, bestIdx = -1;
  for (const c of all) {
    const idx = CLIMBING_GRADES.indexOf(c.grade);
    if (idx > bestIdx) { bestIdx = idx; best = c; }
  }
  return best;
}

let _sessionTypeCountsCache = new Map(); // days -> { version, value }

// Counts of completed boulder sessions by session type within the trailing window
// (default 28 days / 4 weeks) — used for the balance readout and the adaptive suggestion.
// Cached per (days, dataVersion) since it's called multiple times per render.
function recentSessionTypeCounts(days = 28) {
  const cached = _sessionTypeCountsCache.get(days);
  if (cached && cached.version === dataVersion) return cached.value;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = formatDateKey(cutoff);
  const counts = {};
  BOULDER_SESSION_TYPES.forEach(t => counts[t] = 0);
  for (const [dateKey, d] of Object.entries(state.days)) {
    if (dateKey < cutoffKey) continue;
    if (d.completed && d.workout.type === "boulder" && d.workout.boulder.sessionType) {
      counts[d.workout.boulder.sessionType]++;
    }
  }
  _sessionTypeCountsCache.set(days, { version: dataVersion, value: counts });
  return counts;
}

let _climbingStreaksCache = null;
let _climbingStreaksCacheVersion = -1;

// Current/longest streak of hitting scheduled boulder days (per the weekly schedule),
// walked from the plan's start date through today. Cached against dataVersion — the
// date-rolls-over-past-midnight-mid-session edge case is accepted for simplicity.
function climbingStreaks() {
  if (_climbingStreaksCacheVersion === dataVersion) return _climbingStreaksCache;
  const startDate = parseKey(state.meta.startDate);
  const today = new Date();
  today.setHours(12, 0, 0, 0); // match parseKey's noon convention so today isn't excluded by a time-of-day mismatch
  const scheduledDates = [];
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    if (state.weeklySchedule[d.getDay()] === "boulder") scheduledDates.push(formatDateKey(d));
  }
  const hits = scheduledDates.map(key => {
    const day = state.days[key];
    return !!(day && day.completed && day.workout.type === "boulder");
  });
  let longest = 0, running = 0;
  for (const h of hits) {
    if (h) { running++; longest = Math.max(longest, running); }
    else running = 0;
  }
  let current = 0;
  for (let i = hits.length - 1; i >= 0; i--) {
    if (hits[i]) current++; else break;
  }
  _climbingStreaksCache = { current, longest };
  _climbingStreaksCacheVersion = dataVersion;
  return _climbingStreaksCache;
}

// Recap of the current week (Monday through today): climbs, hardest grade, average
// session rating, and how many scheduled training days were actually closed out.
function weeklyReportCard() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffToMonday = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  const mondayKey = formatDateKey(monday);
  const todayKey = formatDateKey(today);

  const weekClimbs = allClimbsHistory().filter(c => c.dateKey >= mondayKey && c.dateKey <= todayKey);
  let hardestIdx = -1;
  for (const c of weekClimbs) {
    const idx = CLIMBING_GRADES.indexOf(c.grade);
    if (idx > hardestIdx) hardestIdx = idx;
  }

  const ratings = [];
  let scheduledCount = 0, trainedCount = 0;
  for (let d = new Date(monday); d <= today; d.setDate(d.getDate() + 1)) {
    const key = formatDateKey(d);
    if (state.weeklySchedule[d.getDay()]) scheduledCount++;
    const day = state.days[key];
    if (day && day.completed) {
      trainedCount++;
      if (day.workout.type === "boulder" && day.workout.boulder.rating != null) ratings.push(day.workout.boulder.rating);
    }
  }
  const avgRating = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

  return { totalClimbs: weekClimbs.length, hardestGrade: hardestIdx >= 0 ? CLIMBING_GRADES[hardestIdx] : null, avgRating, trainedCount, scheduledCount };
}

function renderWeeklyReportCard() {
  const r = weeklyReportCard();
  return `
    <div class="card">
      <h2>This Week</h2>
      <div class="meal-item-macro">${r.totalClimbs} climb${r.totalClimbs === 1 ? "" : "s"}${r.hardestGrade ? ` — hardest ${r.hardestGrade}` : ""}</div>
      <div class="meal-item-macro">${r.trainedCount}/${r.scheduledCount} scheduled days trained</div>
      ${r.avgRating != null ? `<div class="meal-item-macro">Avg session rating: ${r.avgRating}/5</div>` : ""}
    </div>
  `;
}

function isCompletedBoulderSession(d) {
  return d.workout && d.workout.type === "boulder" && (Number(d.workout.boulder.minutes) > 0 || d.workout.boulder.climbs.length > 0);
}

// Position in the session-count-based periodization cycle (see CLIMBING_PHASE_PLAN) as of
// asOfKey — counts completed sessions strictly before that date, so "today" is whatever
// session comes next in the cycle, however long it's actually been since the last one.
function climbingPhaseInfoAsOf(asOfKey) {
  const priorSessions = Object.entries(state.days).filter(([k, d]) => k < asOfKey && isCompletedBoulderSession(d)).length;
  const sessionNumber = (priorSessions % CLIMBING_CYCLE_LENGTH) + 1;
  let cumulative = 0;
  for (const p of CLIMBING_PHASE_PLAN) {
    cumulative += p.sessions;
    if (sessionNumber <= cumulative) return { sessionNumber, cycleLength: CLIMBING_CYCLE_LENGTH, phase: p };
  }
  return { sessionNumber, cycleLength: CLIMBING_CYCLE_LENGTH, phase: CLIMBING_PHASE_PLAN[CLIMBING_PHASE_PLAN.length - 1] };
}

// Suggests which session type to train next — primarily driven by where today's session
// falls in the periodization cycle; the least-done-in-4-weeks balance only kicks in during
// Deload sessions (no forced type) as a tiebreaker for variety. Still gated on finger
// recovery so it never nudges toward more climbing before that's safe.
function suggestNextSessionType() {
  if (daysSinceFingerLoad() < FINGER_RECOVERY_DAYS) return null;
  const { phase } = climbingPhaseInfoAsOf(viewDate);
  if (phase.sessionType) return phase.sessionType;
  const counts = recentSessionTypeCounts(28);
  let best = BOULDER_SESSION_TYPES[0];
  for (const t of BOULDER_SESSION_TYPES) if (counts[t] < counts[best]) best = t;
  return best;
}

// One-line phase note shown on boulder days — what this session's focus is, and (during the
// harder Strength/Power-Endurance stretches) a reminder not to stress about the scale.
function renderClimbingPhaseNote(day) {
  if (daysSinceFingerLoad() < FINGER_RECOVERY_DAYS) return "";
  const { sessionNumber, cycleLength, phase } = climbingPhaseInfoAsOf(viewDate);
  const cutNote = (phase.phase === "Strength" || phase.phase === "Power-Endurance")
    ? " Don't sweat the scale this stretch — this phase is about performance, not the deficit."
    : "";
  const typeHint = day.workout.boulder.sessionType
    ? ""
    : phase.sessionType
      ? ` Select <strong style="color:var(--text);">${phase.sessionType}</strong> below.`
      : " Pick whichever session type below sounds good — this one's about easing off, not hitting a target.";
  return `<div class="meal-item-macro" style="margin-bottom:6px;">Session ${sessionNumber}/${cycleLength} — <strong style="color:var(--text);">${phase.phase}</strong> phase: ${phase.note}${typeHint}${cutNote}</div>`;
}

// Standard finger-strength benchmark history: same edge every time, heaviest added (or
// lightest assisted, negative) weight held for a target time — the climbing equivalent of
// the estimated-1RM chart already tracked for lifting.
function maxHangTestHistory() {
  return Object.entries(state.days)
    .filter(([, d]) => d.maxHangTest && d.maxHangTest.edgeMM > 0 && d.maxHangTest.holdSeconds > 0)
    .map(([k, d]) => ({ dateKey: k, ...d.maxHangTest }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function renderMaxHangTestCard(day) {
  const test = day.maxHangTest;
  const history = maxHangTestHistory();
  const chart = history.length > 1 ? lineChartSVG([history.map(h => ({ x: h.dateKey, y: h.addedWeightLb }))], ["#4fd1c5"]) : "";
  return `
    <div class="card">
      <h2>Max Hang Test</h2>
      <div class="meal-item-macro" style="margin-bottom:8px;">Same edge every time — heaviest added (or lightest assisted) weight you can hold for the target time. Test every few weeks, not every session.</div>
      <div class="two-col">
        <div class="field"><label>Edge (mm)</label><input type="number" inputmode="numeric" data-action="setMaxHangField" data-field="edgeMM" value="${test?.edgeMM ?? 20}"></div>
        <div class="field"><label>Added weight (lb)</label><input type="number" inputmode="decimal" step="0.5" data-action="setMaxHangField" data-field="addedWeightLb" value="${test?.addedWeightLb ?? ""}"></div>
      </div>
      <div class="field"><label>Hold time (sec)</label><input type="number" inputmode="numeric" data-action="setMaxHangField" data-field="holdSeconds" value="${test?.holdSeconds ?? 7}"></div>
      ${history.length > 1 ? `<div class="chart-wrap" style="margin-top:10px;">${chart}</div>`
        : history.length === 1 ? `<div class="empty-state" style="margin-top:10px;">Log another test in a few weeks to see a trend</div>` : ""}
    </div>
  `;
}

function renderGradePyramid() {
  const all = allClimbsHistory();
  const typeCounts = recentSessionTypeCounts(28);
  const typeBalanceLine = `<div class="meal-item-macro" style="margin-top:10px;">Last 4 weeks: ${BOULDER_SESSION_TYPES.map(t => `${t} ×${typeCounts[t]}`).join(", ")}</div>`;
  const streaks = climbingStreaks();
  const streakLine = `<div class="meal-item-macro" style="margin-top:4px;">Streak: ${streaks.current} current · ${streaks.longest} longest</div>`;
  if (!all.length) {
    return `<div class="card"><h2>Grade Pyramid</h2><div class="empty-state">No climbs logged yet</div>${typeBalanceLine}${streakLine}</div>`;
  }
  const best = hardestSend();
  const bestIdx = CLIMBING_GRADES.indexOf(best.grade);
  const counts = CLIMBING_GRADES.map((g, i) => ({ grade: g, count: all.filter(c => c.grade === g).length, idx: i }));
  const maxCount = Math.max(...counts.map(c => c.count), 1);
  const visible = counts.filter(c => c.idx <= bestIdx).slice().reverse();
  return `
    <div class="card">
      <h2>Grade Pyramid</h2>
      <div class="meal-item-macro" style="margin-bottom:10px;">Hardest send: <strong style="color:var(--text);">${best.grade}</strong> (${niceDate(best.dateKey)})</div>
      ${visible.map(c => `
        <div class="pyramid-row">
          <div class="pyramid-label">${c.grade}</div>
          <div class="pyramid-bar-track"><div class="pyramid-bar" style="width:${Math.max(4, c.count / maxCount * 100)}%"></div></div>
          <div class="pyramid-count">${c.count}</div>
        </div>
      `).join("")}
      ${typeBalanceLine}
      ${streakLine}
    </div>
  `;
}

// The AM (fasted) reading is the primary tracked value for charts/goal math, since it's the
// most comparable day-to-day; falls back to PM on days only one reading was logged.
function trackedWeightForDay(d) {
  const v = d.weightAM ?? d.weightPM;
  return v != null && v !== "" ? Number(v) : null;
}

function weightSeries() {
  return Object.entries(state.days)
    .map(([k, d]) => ({ x: k, y: trackedWeightForDay(d) }))
    .filter(p => p.y != null)
    .sort((a, b) => a.x.localeCompare(b.x));
}

// Waist circumference over time — a steadier, more direct read on visible fat loss than
// scale weight, which bounces with water/sodium/glycogen day to day.
function waistSeries() {
  return Object.entries(state.days)
    .filter(([, d]) => d.waist != null && d.waist !== "")
    .map(([k, d]) => ({ x: k, y: Number(d.waist) }))
    .sort((a, b) => a.x.localeCompare(b.x));
}

// ---------- goal-based calorie targeting ----------

function latestKnownWeight() {
  const series = weightSeries();
  if (series.length) return series[series.length - 1].y;
  return state.goal ? state.goal.startWeight : null;
}

function bmr(weightLb, heightIn, age, sex) {
  const kg = weightLb / KG_TO_LB;
  const cm = heightIn * 2.54;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === "female" ? base - 161 : base + 5;
}

function requiredDailyDeltaKcal(goal) {
  if (!goal || !goal.weeks) return 0;
  const totalChangeLb = goal.goalWeight - goal.startWeight;
  return (totalChangeLb * KCAL_PER_LB) / (goal.weeks * 7);
}

// Standard kcal/min for a given MET and bodyweight: MET x 3.5 x kg / 200.
function kcalFromMET(met, weightKg, minutes) {
  if (!minutes || minutes <= 0) return 0;
  return met * 3.5 * weightKg / 200 * minutes;
}

// ACSM running metabolic equation, scaled by actual pace instead of a flat per-session
// number — VO2(ml/kg/min) = 0.2 x speed(m/min) + 3.5, MET = VO2 / 3.5.
function runningMET(paceMph) {
  if (!paceMph || paceMph <= 0) return 0;
  const speedMPerMin = paceMph * 26.8224;
  const vo2 = 0.2 * speedMPerMin + 3.5;
  return vo2 / 3.5;
}

// Sets that actually have both a weight and a rep count logged — placeholder rows the
// user added but hasn't filled in yet shouldn't count toward the calorie estimate.
function loggedResistanceSetCount(day) {
  return day.workout.exercises.reduce((count, ex) =>
    count + ex.sets.filter(s => s.weight !== "" && s.weight != null && s.reps !== "" && s.reps != null).length, 0);
}

// Exercise calorie bonus via MET x bodyweight x time, using whatever's actually been
// logged today (sets, minutes, pace) rather than a flat number the instant a workout
// type is picked — so the allowance grows as the session is logged, not all at once.
function workoutCalorieBonus(day, weightLb) {
  const weightKg = weightLb / KG_TO_LB;
  const w = day.workout;
  if (w.type === "resistance") {
    const minutes = w.durationMinutes ?? (loggedResistanceSetCount(day) * MINUTES_PER_SET_ESTIMATE);
    return kcalFromMET(RESISTANCE_MET, weightKg, minutes);
  }
  if (w.type === "run") {
    const miles = Number(w.run.miles) || 0;
    const minutes = Number(w.run.minutes) || 0;
    const paceMph = minutes > 0 ? miles / (minutes / 60) : 0;
    return kcalFromMET(runningMET(paceMph), weightKg, minutes);
  }
  if (w.type === "boulder") {
    return kcalFromMET(BOULDER_MET, weightKg, Number(w.boulder.minutes) || 0);
  }
  return 0;
}

// Returns a whole-number calorie target for the day if a goal is set, else null
// (callers fall back to the manual calRest/calTrain targets).
function calorieTargetFor(day) {
  const goal = state.goal;
  if (!goal) return null;
  const weight = latestKnownWeight() ?? goal.startWeight;
  const base = bmr(weight, goal.heightIn, goal.age, goal.sex) * GOAL_ACTIVITY_MULTIPLIER;
  const exerciseBonus = workoutCalorieBonus(day, weight);
  const stepsBonus = kcalFromMET(WALK_MET, weight / KG_TO_LB, (day.steps || 0) / STEPS_PER_MINUTE_WALKING);
  const delta = requiredDailyDeltaKcal(goal);
  return Math.round(base + exerciseBonus + stepsBonus + delta);
}

// Protein/fat/carbs targets for the day. Scales with bodyweight + the dynamic calorie
// target when a goal is set; otherwise falls back to the manual state.targets grams.
function macroTargetsFor(day, calTarget) {
  const goal = state.goal;
  if (!goal) return { protein: state.targets.protein, fat: state.targets.fat, carbs: state.targets.carbs };
  const weight = latestKnownWeight() ?? goal.startWeight;
  const protein = Math.round(weight * PROTEIN_PER_LB_GOAL);
  const fat = Math.round(weight * FAT_PER_LB_GOAL);
  const remainingCals = Math.max(0, calTarget - protein * 4 - fat * 9);
  const carbs = Math.round(remainingCals / 4);
  return { protein, fat, carbs };
}

// Compares your actual logged weight to the straight-line pace needed to hit the goal
// on schedule. Returns null if there's no goal or no logged weight yet to compare against
// (falling back to the goal's own startWeight would just always show "on pace").
function goalPaceStatus() {
  const g = state.goal;
  if (!g) return null;
  const series = weightSeries();
  if (!series.length) return null;
  const actual = series[series.length - 1].y;
  const totalDays = g.weeks * 7;
  const elapsedDays = Math.min(totalDays, Math.max(0, (Date.parse(formatDateKey(new Date())) - Date.parse(g.startDate)) / 86400000));
  const expected = g.startWeight + (g.goalWeight - g.startWeight) * (elapsedDays / totalDays);
  const diff = actual - expected;
  const losing = g.goalWeight < g.startWeight;
  const aheadBy = losing ? -diff : diff; // positive = ahead of schedule toward the goal
  return { actual, expected: Math.round(expected * 10) / 10, aheadBy: Math.round(aheadBy * 10) / 10 };
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

// Actual observed rate of change per week (whatever unit the series is in — lb, inches, etc.),
// read off the smoothed (rolling-average) series rather than any target rate — this is "what's
// really happening," not "what's planned." Looks back 7 days where available, or falls back to
// the full span if less history exists yet.
function trendRatePerWeek(avgSeries) {
  if (avgSeries.length < 2) return null;
  const last = avgSeries[avgSeries.length - 1];
  const lastDate = Date.parse(last.x);
  let ref = avgSeries[0];
  for (let i = avgSeries.length - 1; i >= 0; i--) {
    if ((lastDate - Date.parse(avgSeries[i].x)) / 86400000 >= 7) { ref = avgSeries[i]; break; }
  }
  const days = (lastDate - Date.parse(ref.x)) / 86400000;
  if (days < 1) return null;
  return ((last.y - ref.y) / days) * 7;
}

// Clips a series (and a matching 7-day rolling average computed over its FULL history, so the
// average at the window's left edge is still a real trailing average) to the last windowDays
// ending at the most recent entry. Falls back to the unclipped series if that leaves too little
// to plot (e.g. all logging happened further back than the window).
function trailingTrendWindow(series, windowDays) {
  const avgFull = rollingAverageSeries(series, 7);
  const cutoff = formatDateKey(new Date(Date.parse(series[series.length - 1].x) - (windowDays - 1) * 86400000));
  let windowed = series.filter(p => p.x >= cutoff);
  let avgWindowed = avgFull.filter(p => p.x >= cutoff);
  if (windowed.length < 2) { windowed = series; avgWindowed = avgFull; }
  return { windowed, avgWindowed };
}

function hydrateProgress() {
  const series = weightSeries();
  const slot = document.getElementById("weight-chart-slot");
  const summarySlot = document.getElementById("weight-trend-summary");
  if (series.length < 2) {
    slot.innerHTML = `<div class="empty-state">Log at least 2 days of weight to see a trend</div>`;
    if (summarySlot) summarySlot.innerHTML = "";
  } else {
    const { windowed, avgWindowed } = trailingTrendWindow(series, TREND_CHART_WINDOW_DAYS);
    const goalWeight = state.goal ? state.goal.goalWeight : null;
    slot.innerHTML = trendChartSVG(windowed, avgWindowed, goalWeight) + renderTrendLegend("Daily weight", goalWeight);
    const current = avgWindowed[avgWindowed.length - 1].y;
    const rate = trendRatePerWeek(avgWindowed);
    if (summarySlot) {
      const rateText = rate == null ? "" : ` · ${rate >= 0 ? "+" : ""}${rate.toFixed(1)} lb/wk`;
      summarySlot.innerHTML = `<strong style="color:var(--text);">${current.toFixed(1)} lb</strong> 7-day avg${rateText} · last ${TREND_CHART_WINDOW_DAYS} days`;
    }
  }

  const waistSlot = document.getElementById("waist-chart-slot");
  const waistSummarySlot = document.getElementById("waist-trend-summary");
  if (waistSlot) {
    const wSeries = waistSeries();
    if (wSeries.length < 2) {
      waistSlot.innerHTML = `<div class="empty-state">Log at least 2 days of waist measurement to see a trend</div>`;
      if (waistSummarySlot) waistSummarySlot.innerHTML = "";
    } else {
      const { windowed, avgWindowed } = trailingTrendWindow(wSeries, TREND_CHART_WINDOW_DAYS);
      waistSlot.innerHTML = trendChartSVG(windowed, avgWindowed, null) + renderTrendLegend("Daily waist", null);
      const current = avgWindowed[avgWindowed.length - 1].y;
      const rate = trendRatePerWeek(avgWindowed);
      if (waistSummarySlot) {
        const rateText = rate == null ? "" : ` · ${rate >= 0 ? "+" : ""}${rate.toFixed(2)} in/wk`;
        waistSummarySlot.innerHTML = `<strong style="color:var(--text);">${current.toFixed(1)} in</strong> 7-day avg${rateText} · last ${TREND_CHART_WINDOW_DAYS} days`;
      }
    }
  }

  getAllPhotos().then(photos => {
    const grid = document.getElementById("photo-grid-slot");
    if (!photos.length) { grid.innerHTML = `<div class="empty-state">No photos yet</div>`; return; }
    grid.innerHTML = photos.map(p => `<img src="${URL.createObjectURL(p.blob)}" alt="${p.id}" title="${p.id}">`).join("");
  });

  if (comparePhotosOpen) {
    const slot = document.getElementById("compare-photos-slot");
    getAllPhotos().then(photos => {
      if (!slot) return;
      const bodyPhotos = photos.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.id)).sort((a, b) => a.id.localeCompare(b.id));
      if (bodyPhotos.length < 2) {
        slot.innerHTML = `<div class="empty-state">Need at least 2 dated progress photos to compare</div>`;
        return;
      }
      if (!bodyPhotos.some(p => p.id === compareBeforeId)) compareBeforeId = bodyPhotos[0].id;
      if (!bodyPhotos.some(p => p.id === compareAfterId)) compareAfterId = bodyPhotos[bodyPhotos.length - 1].id;
      const beforePhoto = bodyPhotos.find(p => p.id === compareBeforeId);
      const afterPhoto = bodyPhotos.find(p => p.id === compareAfterId);
      const options = list => list.map(p => `<option value="${p.id}">${niceDate(p.id)}</option>`).join("");
      slot.innerHTML = `
        <div class="two-col">
          <div class="field"><label>Before</label>
            <select data-action="setComparePhoto" data-slot="before">${options(bodyPhotos)}</select>
          </div>
          <div class="field"><label>After</label>
            <select data-action="setComparePhoto" data-slot="after">${options(bodyPhotos)}</select>
          </div>
        </div>
        <div class="compare-photos-grid">
          <div><img src="${URL.createObjectURL(beforePhoto.blob)}" alt="Before"><div class="meal-item-macro" style="text-align:center; margin-top:4px;">${niceDate(beforePhoto.id)}</div></div>
          <div><img src="${URL.createObjectURL(afterPhoto.blob)}" alt="After"><div class="meal-item-macro" style="text-align:center; margin-top:4px;">${niceDate(afterPhoto.id)}</div></div>
        </div>
      `;
      slot.querySelector('[data-slot="before"]').value = compareBeforeId;
      slot.querySelector('[data-slot="after"]').value = compareAfterId;
    });
  }
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

// Weight and waist trend get their own chart (rather than reusing the generic lineChartSVG
// used by training volume) because they're worth annotating: an optional dashed goal reference
// line plus labeled start/current points, so it reads as "where am I vs. the plan" at a glance
// instead of just being an unlabeled shape. goalWeight is null for waist (no goal tracked there).
function trendChartSVG(rawSeries, avgSeries, goalWeight) {
  const W = 600, H = 200, PAD_L = 8, PAD_R = 8, PAD_TOP = 22, PAD_BOTTOM = 26;
  const xs = rawSeries.map(p => p.x);
  const allY = rawSeries.map(p => p.y).concat(avgSeries.map(p => p.y));
  if (goalWeight != null) allY.push(goalWeight);
  const yMinRaw = Math.min(...allY), yMaxRaw = Math.max(...allY);
  const yPad = (yMaxRaw - yMinRaw) * 0.12 || 2;
  const yLo = yMinRaw - yPad, yHi = yMaxRaw + yPad;
  const yRange = yHi - yLo || 1;

  const xPos = x => PAD_L + (xs.indexOf(x) / Math.max(1, xs.length - 1)) * (W - PAD_L - PAD_R);
  const yPos = y => H - PAD_BOTTOM - ((y - yLo) / yRange) * (H - PAD_TOP - PAD_BOTTOM);

  const rawLine = `<polyline points="${rawSeries.map(p => `${xPos(p.x)},${yPos(p.y)}`).join(" ")}" fill="none" stroke="var(--text-dim)" stroke-width="1.5" opacity="0.5" />`;
  const avgLine = `<polyline points="${avgSeries.map(p => `${xPos(p.x)},${yPos(p.y)}`).join(" ")}" fill="none" stroke="var(--good)" stroke-width="2.5" />`;

  const goalLine = goalWeight != null ? `
    <line x1="${PAD_L}" y1="${yPos(goalWeight)}" x2="${W - PAD_R}" y2="${yPos(goalWeight)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="5,4" />
    <text x="${PAD_L + 4}" y="${yPos(goalWeight) - 6}" font-size="12" fill="var(--warn)">Goal ${goalWeight} lb</text>
  ` : "";

  const currentPoint = avgSeries[avgSeries.length - 1];
  const currentIsNearTop = yPos(currentPoint.y) < PAD_TOP + 16;

  // Date axis: a handful of evenly-spaced ticks (not just the endpoints) so any point along
  // the line can be tied back to roughly which day it is, not just "somewhere in the window."
  const tickCount = Math.min(5, xs.length);
  const tickIndices = [...new Set(Array.from({ length: tickCount }, (_, i) =>
    Math.round(i * (xs.length - 1) / Math.max(1, tickCount - 1))))];
  const dateAxis = tickIndices.map((i, idx) => {
    const x = xPos(xs[i]);
    const anchor = idx === 0 ? "start" : idx === tickIndices.length - 1 ? "end" : "middle";
    return `
      <line x1="${x}" y1="${PAD_TOP}" x2="${x}" y2="${H - PAD_BOTTOM}" stroke="var(--border)" stroke-width="1" />
      <line x1="${x}" y1="${H - PAD_BOTTOM}" x2="${x}" y2="${H - PAD_BOTTOM + 4}" stroke="var(--text-dim)" stroke-width="1" />
      <text x="${x}" y="${H - 8}" text-anchor="${anchor}" font-size="10.5" fill="var(--text-dim)">${shortDate(xs[i])}</text>
    `;
  }).join("");

  const currentLabel = `
    <circle cx="${xPos(currentPoint.x)}" cy="${yPos(currentPoint.y)}" r="3.5" fill="var(--good)" />
    <text x="${xPos(currentPoint.x) - 6}" y="${yPos(currentPoint.y) + (currentIsNearTop ? 16 : -8)}" text-anchor="end" font-size="13" font-weight="600" fill="var(--text)">${currentPoint.y.toFixed(1)}</text>
  `;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${dateAxis}${goalLine}${rawLine}${avgLine}${currentLabel}</svg>`;
}

function renderTrendLegend(rawLabel, goalWeight) {
  return `
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-swatch" style="border-color:var(--text-dim);"></span>${rawLabel}</span>
      <span class="legend-item"><span class="legend-swatch" style="border-color:var(--good);"></span>7-day avg</span>
      ${goalWeight != null ? `<span class="legend-item"><span class="legend-swatch dashed" style="border-color:var(--warn);"></span>Goal</span>` : ""}
    </div>
  `;
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

async function getPhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const req = tx.objectStore(PHOTO_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Climbing / hangboard timer ----------

let climbingMode = "simple"; // "simple" | "presets"
let savePresetOpen = false;
let timerConfig = { sets: 1, reps: 8, work: 10, rest: 5, restBetweenSets: 60 };
let timerPhase = null; // null (idle) | "prep" | "work" | "rest" | "restBetweenSets" | "done"
let timerCurrentSet = 1;
let timerCurrentRep = 1;
let timerRemaining = 0;
let timerPhaseEndAt = 0; // absolute Date.now() target for the current phase — see restTimerEndAt for why
let timerIntervalId = null;
let wakeLockSentinel = null;
let audioCtx = null;
const PREP_SECONDS = 5;
let timerPrepReturn = null; // {phase, remaining} to resume into once the prep countdown finishes

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function computeTotalSeconds(cfg) {
  const perSet = cfg.reps * cfg.work + Math.max(0, cfg.reps - 1) * cfg.rest;
  return cfg.sets * perSet + Math.max(0, cfg.sets - 1) * cfg.restBetweenSets;
}

function beep(freq, duration) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration / 1000);
    osc.start();
    osc.stop(audioCtx.currentTime + duration / 1000);
  } catch (e) { /* Web Audio unavailable — fail silently */ }
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLockSentinel = await navigator.wakeLock.request("screen");
  } catch (e) { /* not supported / denied — fail silently */ }
}

function releaseWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().catch(() => {});
    wakeLockSentinel = null;
  }
}

// ---------- Resistance rest timer ----------

let restTimerRemaining = 0; // seconds left; 0 = inactive
let restTimerEndAt = 0; // absolute Date.now() target — timers are resynced from this, not tick counts,
                         // since backgrounding the tab/app pauses setInterval and would otherwise freeze the countdown
let restTimerIntervalId = null;

let coreStopwatchKey = null; // `${exIdx}-${setIdx}` of the currently running stopwatch, or null
let coreStopwatchElapsed = 0;
let coreStopwatchStartedAt = 0;
let coreStopwatchIntervalId = null;

let workoutTimerIntervalId = null; // ticks the live clock while a resistance/boulder session is in progress

let stretchTimerId = null; // stretch id with its 60s countdown running, or null
let stretchTimerDay = null; // the day object it was started against
let stretchTimerRemaining = 0;
let stretchTimerEndAt = 0;
let stretchTimerIntervalId = null;

function resyncCoreStopwatch() {
  if (!coreStopwatchIntervalId) return;
  coreStopwatchElapsed = Math.round((Date.now() - coreStopwatchStartedAt) / 1000);
}

function resyncStretchTimer() {
  if (!stretchTimerIntervalId) return;
  stretchTimerRemaining = Math.round((stretchTimerEndAt - Date.now()) / 1000);
  if (stretchTimerRemaining <= 0) {
    clearInterval(stretchTimerIntervalId);
    stretchTimerIntervalId = null;
    stretchTimerRemaining = 0;
    if (stretchTimerDay && stretchTimerId) stretchTimerDay.stretchesDone[stretchTimerId] = true;
    stretchTimerId = null;
    stretchTimerDay = null;
    beep(880, 150);
    setTimeout(() => beep(880, 250), 200);
    saveState();
  }
}

function resyncRestTimer() {
  if (!restTimerIntervalId) return;
  restTimerRemaining = Math.round((restTimerEndAt - Date.now()) / 1000);
  if (restTimerRemaining <= 0) {
    clearInterval(restTimerIntervalId);
    restTimerIntervalId = null;
    restTimerRemaining = 0;
    releaseWakeLock();
    beep(880, 150);
    setTimeout(() => beep(880, 250), 200);
  }
}

function startRestTimer(seconds) {
  if (!seconds || seconds <= 0) return;
  restTimerRemaining = seconds;
  restTimerEndAt = Date.now() + seconds * 1000;
  requestWakeLock();
  if (restTimerIntervalId) clearInterval(restTimerIntervalId);
  restTimerIntervalId = setInterval(() => {
    resyncRestTimer();
    if (restTimerRemaining <= 0) {
      // Finished — a real render is needed to remove the banner from the page.
      if (currentTab === "today") render();
    } else {
      // Just patch the clock text every second instead of a full re-render, so typing
      // in any other field on the page doesn't get its focus wiped out every tick.
      const clockEl = document.getElementById("rest-timer-clock");
      if (clockEl) clockEl.textContent = formatMMSS(restTimerRemaining);
    }
  }, 1000);
  if (currentTab === "today") render();
}

function skipRestTimer() {
  if (restTimerIntervalId) { clearInterval(restTimerIntervalId); restTimerIntervalId = null; }
  releaseWakeLock();
  restTimerRemaining = 0;
  if (currentTab === "today") render();
}

function startTimer() {
  if (timerPhase === null || timerPhase === "done") {
    timerCurrentSet = 1;
    timerCurrentRep = 1;
    timerPrepReturn = { phase: "work", remaining: timerConfig.work };
    timerPhase = "prep";
    timerRemaining = PREP_SECONDS;
    beep(880, 150);
  } else if (timerPhase !== "prep" && timerIntervalId === null) {
    // resuming after a pause mid-session — give a fresh prep countdown to get back set up
    timerPrepReturn = { phase: timerPhase, remaining: timerRemaining };
    timerPhase = "prep";
    timerRemaining = PREP_SECONDS;
    beep(880, 150);
  }
  timerPhaseEndAt = Date.now() + timerRemaining * 1000;
  requestWakeLock();
  if (timerIntervalId) clearInterval(timerIntervalId);
  timerIntervalId = setInterval(tickTimer, 1000);
  render();
}

function pauseTimer() {
  if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
  releaseWakeLock();
  render();
}

function resetTimer() {
  if (timerIntervalId) { clearInterval(timerIntervalId); timerIntervalId = null; }
  releaseWakeLock();
  timerPhase = null;
  timerCurrentSet = 1;
  timerCurrentRep = 1;
  timerRemaining = 0;
  timerPrepReturn = null;
  render();
}

function finishTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  releaseWakeLock();
  timerPhase = "done";
  beep(660, 150);
  setTimeout(() => beep(660, 150), 200);
  setTimeout(() => beep(880, 250), 400);
  // Record finger load for today so resistance/run days know to hold off suggesting more pulling work.
  const today = getOrCreateDay(formatDateKey(new Date()));
  today.hangboardSessions = (today.hangboardSessions || 0) + 1;
  saveState();
  if (currentTab === "climbing") render();
}

// Advances exactly one phase transition (prep->work, work->rest, etc). Returns false once
// finishTimer() has been called (timer is done), true if a new phase is now active.
function advanceTimerPhase() {
  if (timerPhase === "prep") {
    timerPhase = timerPrepReturn.phase;
    timerRemaining = timerPrepReturn.remaining;
    timerPrepReturn = null;
    beep(880, 150);
  } else if (timerPhase === "work") {
    if (timerCurrentRep < timerConfig.reps) {
      timerPhase = "rest";
      timerRemaining = timerConfig.rest;
      beep(440, 150);
    } else if (timerCurrentSet < timerConfig.sets) {
      timerPhase = "restBetweenSets";
      timerRemaining = timerConfig.restBetweenSets;
      beep(440, 150);
    } else {
      finishTimer();
      return false;
    }
  } else if (timerPhase === "rest") {
    timerCurrentRep += 1;
    timerPhase = "work";
    timerRemaining = timerConfig.work;
    beep(880, 150);
  } else if (timerPhase === "restBetweenSets") {
    timerCurrentSet += 1;
    timerCurrentRep = 1;
    timerPhase = "work";
    timerRemaining = timerConfig.work;
    beep(880, 150);
  }
  timerPhaseEndAt += timerRemaining * 1000;
  return true;
}

// Catches up timerPhase/timerRemaining to the real elapsed wall-clock time, fast-forwarding
// through any number of phases that finished while the interval was throttled/suspended
// (e.g. the app was backgrounded through an entire rest period).
function advanceTimerToNow() {
  let guard = 0;
  while (guard++ < 1000) {
    const remaining = Math.round((timerPhaseEndAt - Date.now()) / 1000);
    if (remaining > 0) {
      timerRemaining = remaining;
      return;
    }
    if (!advanceTimerPhase()) return;
  }
}

function tickTimer() {
  advanceTimerToNow();
  if (currentTab === "climbing") render();
}

function renderClimbing() {
  const day = getOrCreateDay(viewDate);
  const isIdle = timerPhase === null;
  const isDone = timerPhase === "done";
  const showConfig = isIdle;
  const totalSeconds = computeTotalSeconds(timerConfig);
  const showSetsFields = climbingMode === "presets";

  const modeSwitcher = showConfig ? `
    <div class="toggle-pill">
      <button data-action="setClimbingMode" data-mode="simple" class="${climbingMode === "simple" ? "active" : ""}">Simple Timer</button>
      <button data-action="setClimbingMode" data-mode="presets" class="${climbingMode === "presets" ? "active" : ""}">Preset Protocols</button>
    </div>
  ` : "";

  const presetCard = (p, source, i, deletable) => `
    <div class="meal-item">
      <div>
        <div class="meal-item-label">${p.name}</div>
        ${p.description ? `<div class="meal-item-macro">${p.description}</div>` : ""}
        <div class="meal-item-macro">${p.sets} sets × ${p.reps} reps · ${p.work}s work / ${p.rest}s rest</div>
      </div>
      <div class="row" style="gap:6px;">
        ${deletable ? `<button class="icon-btn" data-action="deleteCustomPreset" data-idx="${i}">✕</button>` : ""}
        <button class="btn secondary" data-action="selectPreset" data-source="${source}" data-idx="${i}">Load</button>
      </div>
    </div>
  `;

  const presetList = (showConfig && climbingMode === "presets") ? `
    <div style="margin-top:12px;">
      ${HANGBOARD_PRESETS.map((p, i) => presetCard(p, "builtin", i, false)).join("")}
      ${state.customPresets.length ? `
        <div class="meal-item-macro" style="margin:10px 0 2px; text-transform:uppercase; letter-spacing:0.4px;">Your protocols</div>
        ${state.customPresets.map((p, i) => presetCard(p, "custom", i, true)).join("")}
      ` : ""}
    </div>
  ` : "";

  const savePresetForm = showConfig ? `
    <div style="margin-top:10px;">
      <button class="btn secondary" data-action="toggleSavePreset" style="width:100%;">${savePresetOpen ? "Cancel" : "+ Save current settings as preset"}</button>
      ${savePresetOpen ? `
        <div class="sheet-backdrop" data-action="toggleSavePreset"></div>
        <div class="quick-add-form sheet-panel">
          <div class="field"><label>Preset name</label><input type="text" id="save-preset-name" placeholder="e.g. My Repeaters"></div>
          <button class="btn" data-action="submitSavePreset" style="width:100%;">Save preset</button>
        </div>
      ` : ""}
    </div>
  ` : "";

  const sliderRow = (label, field, min, max, step, value, unit) => `
    <div class="field">
      <label>${label}: <span id="timer-val-${field}">${value}</span>${unit || ""}</label>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-action="setTimerField" data-field="${field}">
    </div>
  `;

  const configPanel = showConfig ? `
    <div style="margin-top:14px;">
      ${showSetsFields ? sliderRow("Sets", "sets", 1, 10, 1, timerConfig.sets, "") : ""}
      ${sliderRow("Reps", "reps", 1, 30, 1, timerConfig.reps, "")}
      ${sliderRow("Work time", "work", 1, 60, 1, timerConfig.work, "s")}
      ${sliderRow("Rest time", "rest", 0, 60, 1, timerConfig.rest, "s")}
      ${showSetsFields ? sliderRow("Rest between sets", "restBetweenSets", 0, 300, 5, timerConfig.restBetweenSets, "s") : ""}
    </div>
  ` : "";

  const phaseLabel = { prep: "Get Ready", work: "Work", rest: "Rest", restBetweenSets: "Rest (between sets)", done: "Done!" }[timerPhase] || "Ready";
  const displayTime = isIdle ? formatMMSS(totalSeconds) : isDone ? "Done!" : formatMMSS(timerRemaining);
  const phaseClass = timerPhase === "work" ? "work" : (timerPhase === "rest" || timerPhase === "restBetweenSets" || timerPhase === "prep") ? "rest" : timerPhase === "done" ? "done" : "";

  const fingerDaysSince = daysSinceFingerLoad();
  const fingerRecoveryNote = fingerDaysSince === Infinity
    ? "No finger sessions logged yet."
    : `Last finger session: ${fingerDaysSince} day${fingerDaysSince === 1 ? "" : "s"} ago.`;

  return `
    <div class="card">
      <h2>Hangboard Timer</h2>
      <div class="meal-item-macro" style="margin-bottom:10px;">${fingerRecoveryNote}</div>
      ${modeSwitcher}
      ${presetList}
      ${configPanel}
      ${savePresetForm}
      <div class="timer-display ${phaseClass}">
        <div class="timer-phase">${isIdle ? "Total time" : phaseLabel}</div>
        <div class="timer-clock" id="timer-clock">${displayTime}</div>
        ${!isIdle && !isDone ? `<div class="timer-progress">Set ${timerCurrentSet} of ${timerConfig.sets} · Rep ${timerCurrentRep} of ${timerConfig.reps}</div>` : ""}
      </div>
      <div class="row" style="margin-top:14px; gap:8px;">
        ${isIdle || isDone
          ? `<button class="btn" data-action="startTimer" style="width:100%;">Start</button>`
          : timerIntervalId
            ? `<button class="btn secondary" data-action="pauseTimer" style="flex:1;">Pause</button><button class="btn secondary" data-action="resetTimer" style="flex:1;">Reset</button>`
            : `<button class="btn" data-action="startTimer" style="flex:1;">Resume</button><button class="btn secondary" data-action="resetTimer" style="flex:1;">Reset</button>`}
      </div>
    </div>
    ${renderMaxHangTestCard(day)}
    ${renderWeeklyReportCard()}
    ${renderGradePyramid()}
    ${renderClimbingProgressChart()}
  `;
}

// ---------- action dispatcher ----------

document.getElementById("bottom-nav").addEventListener("click", e => {
  const btn = e.target.closest(".nav-btn");
  if (!btn) return;
  currentTab = btn.dataset.tab;
  render();
});

document.getElementById("settings-btn").addEventListener("click", () => {
  if (currentTab !== "settings") tabBeforeSettings = currentTab;
  currentTab = "settings";
  render();
});

// Backgrounding the tab/app pauses setInterval entirely (no ticks fire at all), so any
// running timer needs an explicit catch-up the moment the app is foregrounded again —
// otherwise it just looks frozen until the next tick happens to land.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  let needsRender = false;
  if (restTimerIntervalId) { resyncRestTimer(); needsRender = true; }
  if (stretchTimerIntervalId) { resyncStretchTimer(); needsRender = true; }
  if (coreStopwatchIntervalId) { resyncCoreStopwatch(); needsRender = true; }
  if (timerIntervalId) { advanceTimerToNow(); needsRender = true; }
  if (workoutTimerIntervalId) needsRender = true;
  if (needsRender) render();
});

document.getElementById("view-root").addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const day = getOrCreateDay(viewDate);

  if (action === "backFromSettings") {
    currentTab = tabBeforeSettings;
    render(); return;
  }
  if (action === "toggleCardCollapse") {
    const cardId = el.dataset.card;
    state.collapsedCards[cardId] = !state.collapsedCards[cardId];
    saveState(); render(); return;
  }
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
  if (action === "clearDay") {
    if (!confirm(`Clear all of ${niceDate(viewDate)}'s data? This can't be undone.`)) return;
    delete state.days[viewDate];
    saveState(); render(); return;
  }
  if (action === "mealQty") {
    const mealName = el.dataset.meal;
    const meal = day.meals[mealName];
    const id = el.dataset.item;
    const isTemplateItem = id in (state.mealTemplates[mealName] || {});
    const prevQty = meal[id] || 0;
    const next = prevQty + Number(el.dataset.delta);
    if (next <= 0) {
      if (isTemplateItem) meal[id] = 0;
      else {
        delete meal[id];
        recordUndo(`${itemDef(id).label} removed`, () => { meal[id] = prevQty; });
      }
    } else meal[id] = next;
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
  if (action === "undoLastDelete") { undoLastDelete(); return; }
  if (action === "markDeload") {
    state.lastDeloadDate = formatDateKey(new Date());
    saveState(); render(); return;
  }
  if (action === "setTheme") {
    state.theme = el.dataset.theme;
    document.documentElement.setAttribute("data-theme", state.theme);
    saveState(); render(); return;
  }
  if (action === "toggleFoodPicker") {
    foodPickerOpen = !foodPickerOpen;
    render(); return;
  }
  if (action === "toggleFavoriteItem") {
    const id = el.dataset.id;
    if (!state.favoriteItems) state.favoriteItems = {};
    if (state.favoriteItems[id]) delete state.favoriteItems[id];
    else state.favoriteItems[id] = true;
    saveState(); render(); return;
  }
  if (action === "mealAddItem") {
    const id = el.dataset.id;
    day.meals[el.dataset.meal][id] = 1;
    bumpItemUsage(id);
    saveState(); render(); return;
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
    if (id) { state.mealTemplates[mealName][id] = 1; bumpItemUsage(id); saveState(); render(); }
    return;
  }
  if (action === "setClimbingMode") {
    climbingMode = el.dataset.mode;
    if (climbingMode === "simple") timerConfig.sets = 1;
    render(); return;
  }
  if (action === "selectPreset") {
    const list = el.dataset.source === "custom" ? state.customPresets : HANGBOARD_PRESETS;
    const p = list[Number(el.dataset.idx)];
    timerConfig = { sets: p.sets, reps: p.reps, work: p.work, rest: p.rest, restBetweenSets: p.restBetweenSets };
    render(); return;
  }
  if (action === "toggleSavePreset") {
    savePresetOpen = !savePresetOpen;
    render(); return;
  }
  if (action === "submitSavePreset") {
    const name = document.getElementById("save-preset-name").value.trim();
    if (!name) return;
    state.customPresets.push({ name, sets: timerConfig.sets, reps: timerConfig.reps, work: timerConfig.work, rest: timerConfig.rest, restBetweenSets: timerConfig.restBetweenSets });
    savePresetOpen = false;
    saveState(); render(); return;
  }
  if (action === "deleteCustomPreset") {
    state.customPresets.splice(Number(el.dataset.idx), 1);
    saveState(); render(); return;
  }
  if (action === "startTimer") { startTimer(); return; }
  if (action === "pauseTimer") { pauseTimer(); return; }
  if (action === "resetTimer") { resetTimer(); return; }
  if (action === "skipRestTimer") { skipRestTimer(); return; }
  if (action === "startWorkoutTimer") {
    if (day.workout.durationMinutes != null && !confirm("Start a new workout timer? This replaces the previous session's tracked time.")) return;
    if (workoutTimerIntervalId) { clearInterval(workoutTimerIntervalId); workoutTimerIntervalId = null; }
    day.workout.startedAt = Date.now();
    day.workout.durationMinutes = null;
    saveState(); render(); return;
  }
  if (action === "endWorkoutTimer") {
    if (workoutTimerIntervalId) { clearInterval(workoutTimerIntervalId); workoutTimerIntervalId = null; }
    if (day.workout.startedAt) {
      const minutes = (Date.now() - day.workout.startedAt) / 60000;
      day.workout.durationMinutes = Math.round(minutes * 10) / 10;
      day.workout.startedAt = null;
      if (day.workout.type === "boulder") day.workout.boulder.minutes = Math.round(minutes);
    }
    saveState(); render(); return;
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
    bumpItemUsage(id);
    quickAddOpen = false;
    saveState(); render(); return;
  }
  if (action === "waterAdd") {
    day.water.oz = Math.max(0, (day.water.oz || 0) + Number(el.dataset.oz));
    saveState(); render(); return;
  }
  if (action === "waterAddMl") {
    day.water.oz = Math.max(0, Math.round(((day.water.oz || 0) + Number(el.dataset.ml) / ML_PER_OZ) * 10) / 10);
    saveState(); render(); return;
  }
  if (action === "setWaterEntryUnit") {
    waterEntryUnit = el.dataset.unit;
    render(); return;
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
  if (action === "repeatLastSet") {
    const ex = day.workout.exercises[Number(el.dataset.ex)];
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({ weight: last.weight, reps: last.reps });
    saveState(); render(); return;
  }
  if (action === "fillFromLastSession") {
    const ex = day.workout.exercises[Number(el.dataset.ex)];
    const priorSets = lastFullSessionSets(ex.name, viewDate);
    if (!priorSets) return;
    if (ex.sets.length && !confirm(`Replace ${ex.sets.length} logged set(s) with last session's ${priorSets.length}?`)) return;
    ex.sets = priorSets.map(s => ({ weight: s.weight, reps: s.reps }));
    saveState(); render(); return;
  }
  if (action === "toggleQuickAddExercise") {
    quickAddExerciseOpen = !quickAddExerciseOpen;
    render(); return;
  }
  if (action === "selectQuickAddExerciseName") {
    const input = document.getElementById("quickadd-exercise-name");
    if (input) input.value = el.dataset.name;
    return;
  }
  if (action === "submitQuickAddExercise") {
    const name = document.getElementById("quickadd-exercise-name").value.trim();
    if (!name) return;
    const barbell = document.getElementById("quickadd-exercise-barbell").checked;
    day.workout.exercises.push({ name, barbell, sets: [], quickAdd: true });
    quickAddExerciseOpen = false;
    saveState(); render(); return;
  }
  if (action === "removeQuickAddExercise") {
    day.workout.exercises.splice(Number(el.dataset.ex), 1);
    saveState(); render(); return;
  }
  if (action === "toggleSwapExercise") {
    const exIdx = Number(el.dataset.ex);
    swapExerciseIndex = swapExerciseIndex === exIdx ? null : exIdx;
    render(); return;
  }
  if (action === "selectSwapExerciseName") {
    const input = document.getElementById("swap-exercise-name");
    if (input) input.value = el.dataset.name;
    return;
  }
  if (action === "submitSwapExercise") {
    const exIdx = Number(el.dataset.ex);
    const name = document.getElementById("swap-exercise-name").value.trim();
    if (!name) return;
    const barbell = document.getElementById("swap-exercise-barbell").checked;
    const ex = day.workout.exercises[exIdx];
    ex.name = name;
    ex.barbell = barbell;
    ex.sets = [];
    swapExerciseIndex = null;
    saveState(); render(); return;
  }
  if (action === "toggleQuickAddCore") {
    quickAddCoreOpen = !quickAddCoreOpen;
    render(); return;
  }
  if (action === "submitQuickAddCore") {
    const name = document.getElementById("quickadd-core-name").value.trim();
    if (!name) return;
    const type = document.getElementById("quickadd-core-type").value;
    day.workout.core.push({ name, type, sets: [], quickAdd: true });
    quickAddCoreOpen = false;
    saveState(); render(); return;
  }
  if (action === "removeQuickAddCore") {
    day.workout.core.splice(Number(el.dataset.ex), 1);
    saveState(); render(); return;
  }
  if (action === "removeSet") {
    const exIdx = Number(el.dataset.ex), setIdx = Number(el.dataset.set);
    const ex = day.workout.exercises[exIdx];
    const removed = ex.sets[setIdx];
    ex.sets.splice(setIdx, 1);
    recordUndo("Set removed", () => { ex.sets.splice(setIdx, 0, removed); });
    saveState(); render(); return;
  }
  if (action === "toggleWarmupStep") {
    const idx = Number(el.dataset.idx);
    const wasChecked = day.workout.boulder.warmupDone[idx];
    day.workout.boulder.warmupDone[idx] = !wasChecked;
    saveState();
    const restAfter = CLIMBING_WARMUP_STEPS[idx].restAfter;
    if (!wasChecked && restAfter > 0) startRestTimer(restAfter);
    else render();
    return;
  }
  if (action === "setBoulderSessionType") {
    const newType = el.dataset.type;
    if (day.workout.boulder.sessionType !== newType) {
      day.workout.boulder.sessionType = newType;
      const config = BOULDER_GRID_CONFIG[newType];
      day.workout.boulder.grid = config ? Array.from({ length: config.rows }, () => Array(config.cols).fill(null)) : [];
      saveState();
    }
    render(); return;
  }
  if (action === "addGridRow") {
    const config = BOULDER_GRID_CONFIG[day.workout.boulder.sessionType];
    if (config) day.workout.boulder.grid.push(Array(config.cols).fill(null));
    saveState(); render(); return;
  }
  if (action === "toggleGridCell") {
    const r = Number(el.dataset.row), c = Number(el.dataset.col);
    const grid = day.workout.boulder.grid;
    const cur = grid[r][c];
    const next = cur === null ? "done" : cur === "done" ? "fail" : null;
    grid[r][c] = next;
    saveState();
    const config = BOULDER_GRID_CONFIG[day.workout.boulder.sessionType];
    const shouldRest = next !== null && (config.restTrigger === "cell" || (config.restTrigger === "row" && grid[r].every(cell => cell !== null)));
    if (shouldRest) {
      startRestTimer(config.restSeconds);
    } else {
      // Highest-frequency tap in a climbing session — patch just this one cell instead
      // of re-rendering the whole tab (the rest banner already forces a full render above).
      el.className = "grid-cell" + (next ? ` ${next}` : "");
      el.textContent = next === "done" ? "✓" : next === "fail" ? "✕" : "";
    }
    return;
  }
  if (action === "setBoulderRating") {
    const val = Number(el.dataset.value);
    day.workout.boulder.rating = day.workout.boulder.rating === val ? null : val;
    saveState(); render(); return;
  }
  if (action === "logClimb") {
    day.workout.boulder.climbs.push({ grade: el.dataset.grade, outcome: "Send" });
    saveState(); render(); return;
  }
  if (action === "cycleClimbOutcome") {
    const c = day.workout.boulder.climbs[Number(el.dataset.idx)];
    const next = CLIMB_OUTCOMES[(CLIMB_OUTCOMES.indexOf(c.outcome) + 1) % CLIMB_OUTCOMES.length];
    c.outcome = next;
    saveState(); render(); return;
  }
  if (action === "removeClimb") {
    const idx = Number(el.dataset.idx);
    const climbs = day.workout.boulder.climbs;
    const removed = climbs[idx];
    if (removed.photoId) deletePhoto(removed.photoId);
    climbs.splice(idx, 1);
    recordUndo(`${removed.grade} climb removed`, () => { climbs.splice(idx, 0, { grade: removed.grade, outcome: removed.outcome }); });
    saveState(); render(); return;
  }
  if (action === "viewClimbPhoto") {
    const idx = Number(el.dataset.idx);
    const wrap = document.querySelector(`[data-climb-photo-view="${idx}"]`);
    if (wrap.dataset.expanded === "1") {
      wrap.innerHTML = "";
      wrap.dataset.expanded = "0";
      return;
    }
    getPhoto(day.workout.boulder.climbs[idx].photoId).then(p => {
      if (p) {
        wrap.innerHTML = `<img src="${URL.createObjectURL(p.blob)}" style="width:100%; border-radius:8px; margin-top:6px;">`;
        wrap.dataset.expanded = "1";
      }
    });
    return;
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
  if (action === "startCoreStopwatch") {
    const exIdx = Number(el.dataset.ex), setIdx = Number(el.dataset.set);
    if (coreStopwatchIntervalId) clearInterval(coreStopwatchIntervalId);
    coreStopwatchKey = `${exIdx}-${setIdx}`;
    coreStopwatchElapsed = 0;
    coreStopwatchStartedAt = Date.now();
    coreStopwatchIntervalId = setInterval(() => {
      resyncCoreStopwatch();
      const clockEl = document.getElementById(`core-stopwatch-${exIdx}-${setIdx}`);
      if (clockEl) clockEl.textContent = formatMMSS(coreStopwatchElapsed);
    }, 1000);
    render(); return;
  }
  if (action === "stopCoreStopwatch") {
    const exIdx = Number(el.dataset.ex), setIdx = Number(el.dataset.set);
    if (coreStopwatchIntervalId) { clearInterval(coreStopwatchIntervalId); coreStopwatchIntervalId = null; }
    const ex = day.workout.core[exIdx];
    if (ex && ex.sets[setIdx]) ex.sets[setIdx].seconds = coreStopwatchElapsed;
    coreStopwatchKey = null;
    coreStopwatchElapsed = 0;
    saveState(); render(); return;
  }
  if (action === "toggleSupplement") {
    day.supplements[el.dataset.id] = !day.supplements[el.dataset.id];
    saveState(); render(); return;
  }
  if (action === "toggleStretchDone") {
    const id = el.dataset.id;
    day.stretchesDone[id] = !day.stretchesDone[id];
    saveState(); render(); return;
  }
  if (action === "startStretchTimer") {
    const id = el.dataset.id;
    if (stretchTimerIntervalId) clearInterval(stretchTimerIntervalId);
    stretchTimerId = id;
    stretchTimerDay = day;
    stretchTimerRemaining = STRETCH_HOLD_SECONDS;
    stretchTimerEndAt = Date.now() + STRETCH_HOLD_SECONDS * 1000;
    stretchTimerIntervalId = setInterval(() => {
      resyncStretchTimer();
      if (stretchTimerRemaining <= 0) {
        render();
      } else {
        const clockEl = document.getElementById(`stretch-clock-${id}`);
        if (clockEl) clockEl.textContent = `${stretchTimerRemaining}s`;
      }
    }, 1000);
    render(); return;
  }
  if (action === "addChecklistItem") { addChecklistItemFromInput(); return; }
  if (action === "removeChecklistItem") {
    const item = state.checklistItems.find(s => s.id === el.dataset.id);
    if (item && !confirm(`Delete "${item.label}" from your checklist?`)) return;
    state.checklistItems = state.checklistItems.filter(s => s.id !== el.dataset.id);
    saveState(); render(); return;
  }
  if (action === "completeOneTimeItem") {
    const item = state.checklistItems.find(s => s.id === el.dataset.id);
    if (item && !confirm(`Check off "${item.label}"? It's a one-time item and will be removed for good.`)) return;
    state.checklistItems = state.checklistItems.filter(s => s.id !== el.dataset.id);
    saveState(); render(); return;
  }
  if (action === "exportData") { exportData(); return; }
  if (action === "exportCSV") { exportCSV(); return; }
  if (action === "archiveOldDays") { archiveOldDays(); return; }
  if (action === "setBodyWeightEntryUnit") {
    bodyWeightEntryUnit = el.dataset.unit;
    render(); return;
  }
  if (action === "toggleGoalForm") {
    goalFormOpen = !goalFormOpen;
    goalFormSex = null;
    render(); return;
  }
  if (action === "setGoalSex") {
    goalFormSex = el.dataset.sex;
    render(); return;
  }
  if (action === "submitGoal") {
    const heightIn = Number(document.getElementById("goal-height").value);
    const age = Number(document.getElementById("goal-age").value);
    const startWeight = Number(document.getElementById("goal-start").value);
    const goalWeight = Number(document.getElementById("goal-target").value);
    const weeks = Number(document.getElementById("goal-weeks").value);
    if (!heightIn || !age || !startWeight || !goalWeight || !weeks) return;
    const sex = goalFormSex || (state.goal && state.goal.sex) || "male";
    state.goal = {
      sex, heightIn, age, startWeight, goalWeight, weeks,
      startDate: (state.goal && state.goal.startDate) || formatDateKey(new Date()),
    };
    goalFormOpen = false;
    goalFormSex = null;
    saveState(); render(); return;
  }
  if (action === "clearGoal") {
    state.goal = null;
    goalFormOpen = false;
    goalFormSex = null;
    saveState(); render(); return;
  }
  if (action === "toggleComparePhotos") {
    comparePhotosOpen = !comparePhotosOpen;
    render(); return;
  }
});

document.getElementById("view-root").addEventListener("input", e => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;
  const day = getOrCreateDay(viewDate);

  if (action === "setWeight") {
    const field = el.dataset.period === "pm" ? "weightPM" : "weightAM";
    day[field] = el.value === "" ? null : Number(el.value);
    saveState(); return;
  }
  if (action === "setSteps") { day.steps = el.value === "" ? null : Number(el.value); saveState(); return; }
  if (action === "setWaist") { day.waist = el.value === "" ? null : Number(el.value); saveState(); return; }
  if (action === "setMaxHangField") {
    if (!day.maxHangTest) day.maxHangTest = { edgeMM: 20, addedWeightLb: 0, holdSeconds: 7 };
    const field = el.dataset.field;
    day.maxHangTest[field] = el.value === "" ? (field === "addedWeightLb" ? 0 : null) : Number(el.value);
    saveState(); return;
  }
  if (action === "setWaterOz") { day.water.oz = el.value === "" ? 0 : Number(el.value); saveState(); return; }
  if (action === "setNotes") { day.notes = el.value; saveState(); return; }
  if (action === "setExerciseNote") { state.exerciseNotes[el.dataset.name] = el.value; saveState(); return; }
  if (action === "filterExerciseList") {
    const query = el.value.toLowerCase();
    document.querySelectorAll("[data-exercise-name]").forEach(card => {
      card.style.display = card.dataset.exerciseName.includes(query) ? "" : "none";
    });
    return;
  }
  if (action === "filterFoodList") {
    const query = el.value.toLowerCase();
    const list = document.getElementById("food-pick-list-" + el.dataset.meal);
    if (list) list.querySelectorAll(".food-pick-row").forEach(row => {
      row.style.display = row.dataset.foodLabel.includes(query) ? "" : "none";
    });
    return;
  }
  if (action === "filterExercisePickList") {
    const query = el.value.toLowerCase();
    const list = document.getElementById("quickadd-exercise-pick-list");
    if (list) list.querySelectorAll(".food-pick-row").forEach(row => {
      row.style.display = row.dataset.exerciseLabel.includes(query) ? "" : "none";
    });
    return;
  }
  if (action === "filterSwapExercisePickList") {
    const query = el.value.toLowerCase();
    const list = document.getElementById("swap-exercise-pick-list");
    if (list) list.querySelectorAll(".food-pick-row").forEach(row => {
      row.style.display = row.dataset.exerciseLabel.includes(query) ? "" : "none";
    });
    return;
  }
  if (action === "setTimerField") {
    const field = el.dataset.field;
    timerConfig[field] = Number(el.value);
    const valSpan = document.getElementById("timer-val-" + field);
    if (valSpan) valSpan.textContent = el.value;
    const clockEl = document.getElementById("timer-clock");
    if (clockEl && timerPhase === null) clockEl.textContent = formatMMSS(computeTotalSeconds(timerConfig));
    return;
  }
  if (action === "setRoutineField") {
    const routine = state.routines.find(r => r.id === el.dataset.routine);
    const field = el.dataset.field;
    if (field === "name") routine.name = el.value;
    else if (field === "setMin") routine.setTarget.min = Number(el.value) || 0;
    else if (field === "setMax") routine.setTarget.max = Number(el.value) || 0;
    else if (field === "repMin") routine.repTarget.min = Number(el.value) || 0;
    else if (field === "repMax") routine.repTarget.max = Number(el.value) || 0;
    else if (field === "weightStep") routine.weightStepKg = toStorageWeight(el.value) || 0;
    else if (field === "restSeconds") routine.restSeconds = Number(el.value) || 0;
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

  if (action === "setComparePhoto") {
    if (el.dataset.slot === "before") compareBeforeId = el.value; else compareAfterId = el.value;
    hydrateProgress();
    return;
  }
  const day = getOrCreateDay(viewDate);

  if (action === "setWeight") {
    const field = el.dataset.period === "pm" ? "weightPM" : "weightAM";
    if (bodyWeightEntryUnit === "kg" && day[field] != null) {
      day[field] = Math.round(day[field] * KG_TO_LB * 10) / 10;
      saveState(); render();
    }
    return;
  }
  if (action === "setWaterOz") {
    if (waterEntryUnit === "ml") {
      day.water.oz = Math.round((day.water.oz / ML_PER_OZ) * 10) / 10;
      saveState(); render();
    }
    return;
  }
  if (action === "setField" && el.dataset.field === "weight" && el.value !== "") {
    const repsInput = document.querySelector(`[data-action="setField"][data-field="reps"][data-ex="${el.dataset.ex}"][data-set="${el.dataset.set}"]`);
    if (repsInput) repsInput.focus();
    return;
  }
  if (action === "setField" && el.dataset.field === "reps" && el.value !== "") {
    const routine = routineForDay(day);
    startRestTimer(routine.restSeconds || DEFAULT_REST_SECONDS);
    return;
  }
  if (action === "setCoreField" && (el.dataset.field === "reps" || el.dataset.field === "seconds") && el.value !== "") {
    startRestTimer(CORE_REST_SECONDS);
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
  if (action === "addClimbPhoto") {
    const file = el.files[0];
    const idx = Number(el.dataset.idx);
    if (file) {
      const photoId = "climb_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      savePhoto(photoId, file).then(() => {
        day.workout.boulder.climbs[idx].photoId = photoId;
        saveState();
        render();
      });
    }
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
  state.lastExportAt = new Date().toISOString();
  saveState();
  const payload = { state, photos: photosOut, exportedAt: state.lastExportAt };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ledge-backup-${formatDateKey(new Date())}.json`;
  a.click();
  if (currentTab === "progress") render();
}

function buildHistoryCSV() {
  const rows = [["Date", "Weight AM (lb)", "Weight PM (lb)", "Waist (in)", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)", "Fiber (g)", "Steps", "Water (oz)", "Max Hang Edge (mm)", "Max Hang Weight (lb)", "Max Hang Hold (s)", "Completed"]];
  for (const key of Object.keys(state.days).sort()) {
    const d = state.days[key];
    const t = dayTotals(d);
    rows.push([
      key,
      d.weightAM ?? "",
      d.weightPM ?? "",
      d.waist ?? "",
      Math.round(t.cal),
      Math.round(t.protein),
      round1(t.carbs),
      round1(t.fat),
      round1(t.fiber),
      d.steps ?? "",
      d.water?.oz ?? "",
      d.maxHangTest?.edgeMM ?? "",
      d.maxHangTest?.addedWeightLb ?? "",
      d.maxHangTest?.holdSeconds ?? "",
      d.completed ? "yes" : "no",
    ]);
  }
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

function exportCSV() {
  const blob = new Blob([buildHistoryCSV()], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ledge-history-${formatDateKey(new Date())}.csv`;
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
