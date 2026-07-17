// Cut Plan Tracker — all app logic. Vanilla JS, no build step.

const STORAGE_KEY = "cutPlanState";
const PHOTO_DB = "cutPlanPhotos";
const PHOTO_STORE = "photos";

let state = loadState();
let currentTab = "today";
let viewDate = formatDateKey(new Date());

// ---------- persistence ----------

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.todos) parsed.todos = [];
      return parsed;
    } catch (e) { /* fall through to fresh state */ }
  }
  return {
    meta: { startDate: PLAN_START, endDateTarget: PLAN_END_TARGET },
    targets: { ...DEFAULT_TARGETS },
    days: {},
    checkIns: [],
    todos: [],
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
  for (const mealName of Object.keys(MEAL_TEMPLATES)) {
    meals[mealName] = {};
    for (const id of Object.keys(MEAL_TEMPLATES[mealName])) meals[mealName][id] = 0;
  }
  return meals;
}

function getOrCreateDay(dateKey) {
  if (!state.days[dateKey]) {
    const dow = parseKey(dateKey).getDay();
    const scheduled = WEEKLY_SCHEDULE[dow];
    state.days[dateKey] = {
      scheduledActivity: scheduled,
      meals: emptyMealsFromTemplate(),
      water: { quarterBottles: 0 },
      supplements: Object.fromEntries(SUPPLEMENTS.map(s => [s.id, false])),
      workout: {
        type: scheduled || null,
        exercises: scheduled === "resistance" ? RESISTANCE_EXERCISES.map(name => ({ name, sets: [] })) : [],
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
    saveState();
  }
  return state.days[dateKey];
}

function isTrainingDay(day) {
  return day.workout.type === "resistance" || day.workout.type === "run" || day.workout.type === "boulder";
}

function mealTotals(meal) {
  let cal = 0, protein = 0;
  for (const [id, qty] of Object.entries(meal)) {
    const item = ITEM_CATALOG[id];
    if (!item || !qty) continue;
    cal += item.cal * qty;
    protein += item.protein * qty;
  }
  return { cal, protein };
}

function dayTotals(day) {
  let cal = 0, protein = 0;
  for (const mealName of Object.keys(day.meals)) {
    const t = mealTotals(day.meals[mealName]);
    cal += t.cal;
    protein += t.protein;
  }
  return { cal, protein };
}

// ---------- rendering shell ----------

function render() {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === currentTab));
  const root = document.getElementById("view-root");
  const day = getOrCreateDay(viewDate);
  document.getElementById("day-counter").textContent =
    `Day ${dayNumberFor(viewDate)} of ${TOTAL_DAYS} · ${niceDate(viewDate)}`;

  if (currentTab === "today") root.innerHTML = renderToday(day);
  else if (currentTab === "workouts") root.innerHTML = renderWorkouts();
  else if (currentTab === "progress") root.innerHTML = renderProgressShell();
  else if (currentTab === "checkin") root.innerHTML = renderCheckin();
  else if (currentTab === "todo") root.innerHTML = renderTodo();

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

function formatKgLb(kg) {
  return `${kg} kg (${kgToLb(kg)} lb)`;
}

function activityLabel(type) {
  return { resistance: "Resistance", run: "Run + Core", boulder: "Bouldering", rest: "Rest" }[type] || "Not set";
}

function workoutCompletionPct(day) {
  const w = day.workout;
  if (!w.type || w.type === "rest") return 100;
  if (w.type === "resistance") {
    if (!w.exercises.length) return 0;
    const done = w.exercises.filter(ex => ex.sets.length > 0).length;
    return Math.round((done / w.exercises.length) * 100);
  }
  if (w.type === "run") {
    const cardioPct = (Number(w.run.miles) > 0 && Number(w.run.minutes) > 0) ? 100 : 0;
    const corePct = w.core.length ? (w.core.filter(ex => ex.sets.length > 0).length / w.core.length) * 100 : 0;
    return Math.round((cardioPct + corePct) / 2);
  }
  if (w.type === "boulder") return Number(w.boulder.minutes) > 0 ? 100 : 0;
  return 0;
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

function renderMealInner(day, mealName, title) {
  const meal = day.meals[mealName];
  const template = MEAL_TEMPLATES[mealName] || {};
  const totals = mealTotals(meal);
  const entries = Object.entries(meal);
  const rows = entries.length ? entries.map(([id, qty]) => {
    const item = ITEM_CATALOG[id];
    const planned = template[id];
    return `
      <div class="meal-item">
        <div>
          <div class="meal-item-label">${item.label}</div>
          <div class="meal-item-macro">${item.cal * qty} cal · ${item.protein * qty}g protein${planned ? ` · planned ${planned}` : ""}</div>
        </div>
        <div class="stepper">
          <button data-action="mealQty" data-meal="${mealName}" data-item="${id}" data-delta="-1">−</button>
          <div class="qty">${qty}</div>
          <button data-action="mealQty" data-meal="${mealName}" data-item="${id}" data-delta="1">+</button>
        </div>
      </div>`;
  }).join("") : `<div class="empty-state">Nothing planned — add an item below</div>`;

  const notInMeal = Object.keys(ITEM_CATALOG).filter(id => !(id in meal));
  const options = notInMeal.map(id => `<option value="${id}">${ITEM_CATALOG[id].label}</option>`).join("");
  const hasTemplate = Object.keys(template).length > 0;

  return `
    <div class="row"><h3>${title}</h3><span class="meal-item-macro">${totals.cal} cal · ${totals.protein}g</span></div>
    ${rows}
    <div class="add-item-row" style="display:flex; gap:8px;">
      <select data-action="mealAdd" data-meal="${mealName}" style="flex:1;">
        <option value="">+ add item…</option>
        ${options}
      </select>
      ${hasTemplate ? `<button class="btn secondary" data-action="mealLogPlanned" data-meal="${mealName}">Log as planned</button>` : ""}
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

  const workoutPct = workoutCompletionPct(day);
  const calPct = Math.min(100, Math.round((totals.cal / calTarget) * 100));
  const proteinPct = Math.min(100, Math.round((totals.protein / proteinTarget) * 100));
  const stepsPct = Math.min(100, Math.round(((day.steps || 0) / STEP_TARGET.max) * 100));
  const overallPct = Math.round((workoutPct + calPct + proteinPct + stepsPct) / 4);

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
        <h2 style="margin:0;">Today's progress</h2>
        <span class="meal-item-macro">${overallPct}%${day.completed ? " · ✓ Complete" : ""}</span>
      </div>
      <div class="day-progress-track"><div class="day-progress-fill" style="width:${overallPct}%"></div></div>
      <div class="progress-trio">
        <div class="mini-metric">
          <div class="mini-label">Workout</div>
          <div class="mini-track"><div class="mini-fill" style="width:${workoutPct}%"></div></div>
          <div class="mini-pct">${workoutPct}%</div>
        </div>
        <div class="mini-metric">
          <div class="mini-label">Calories</div>
          <div class="mini-track"><div class="mini-fill" style="width:${calPct}%"></div></div>
          <div class="mini-pct">${totals.cal} / ${calTarget}</div>
        </div>
        <div class="mini-metric">
          <div class="mini-label">Protein</div>
          <div class="mini-track"><div class="mini-fill" style="width:${proteinPct}%"></div></div>
          <div class="mini-pct">${Math.round(totals.protein)} / ${proteinTarget}g</div>
        </div>
        <div class="mini-metric">
          <div class="mini-label">Steps</div>
          <div class="mini-track"><div class="mini-fill" style="width:${stepsPct}%"></div></div>
          <div class="mini-pct">${day.steps || 0} / ${STEP_TARGET.max}</div>
        </div>
      </div>
      <div class="row" style="margin-top:14px;">
        ${day.completed
          ? `<button class="btn secondary" data-action="reopenDay" style="width:100%;">Reopen day</button>`
          : `<button class="btn" data-action="closeDay" style="width:100%;">Close out day →</button>`}
      </div>
    </div>

    <div class="card">
      <h2>Daily checklist</h2>
      ${SUPPLEMENTS.map(s => `
        <div class="meal-item">
          <button class="todo-check ${day.supplements[s.id] ? "checked" : ""}" data-action="toggleSupplement" data-id="${s.id}"></button>
          <div class="todo-label">${s.label}</div>
        </div>
      `).join("")}
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
      <div class="water-track"><div class="water-fill" style="width:${stepsPct}%"></div></div>
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

function progressionNote(last) {
  if (!last) return "No previous session yet — log your starting weight/reps.";
  const when = niceDate(last.dateKey);
  const w = formatKgLb(last.weight);
  if (last.reps >= REP_TARGET.max) return `Last: ${w} × ${last.reps} (${when}) — hit the top of the rep range, try +${WEIGHT_STEP_KG} kg this session.`;
  if (last.reps < REP_TARGET.min) return `Last: ${w} × ${last.reps} (${when}) — aim for ${REP_TARGET.min}+ reps at this weight before adding more.`;
  return `Last: ${w} × ${last.reps} (${when}) — add a rep or two, or +${WEIGHT_STEP_KG} kg if it felt easy.`;
}

function coreFieldsFor(type) {
  if (type === "reps") return [{ field: "reps", placeholder: `${CORE_REP_TARGET.min}-${CORE_REP_TARGET.max}` }];
  if (type === "duration") return [{ field: "seconds", placeholder: `${CORE_DURATION_TARGET.min}-${CORE_DURATION_TARGET.max}` }];
  return [{ field: "weight", placeholder: "kg" }, { field: "reps", placeholder: `${CORE_REP_TARGET.min}-${CORE_REP_TARGET.max}` }]; // weighted-reps
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
          ${fields.map(f => `<input type="number" inputmode="decimal" placeholder="${f.placeholder}" data-action="setCoreField" data-ex="${exIdx}" data-set="${sIdx}" data-field="${f.field}" value="${s[f.field] ?? ""}">`).join("")}
          <button class="remove-set" data-action="removeCoreSet" data-ex="${exIdx}" data-set="${sIdx}">✕</button>
        </div>
      `).join("")}
      <button class="btn secondary" data-action="addCoreSet" data-ex="${exIdx}">+ Add set</button>
    </div>
  `;
}

function renderWorkoutBody(day) {
  const w = day.workout;
  if (w.type === "resistance") {
    return w.exercises.map((ex, exIdx) => {
      const last = lastSessionFor(ex.name, viewDate);
      return `
      <div class="exercise-block">
        <h3>${ex.name}</h3>
        <div class="meal-item-macro">Target: ${SET_TARGET.min}-${SET_TARGET.max} sets × ${REP_TARGET.min}-${REP_TARGET.max} reps</div>
        <div class="meal-item-macro" style="margin-bottom:8px;">${progressionNote(last)}</div>
        ${ex.sets.map((s, sIdx) => `
          <div class="set-row">
            <div class="set-num">${sIdx + 1}</div>
            <input type="number" inputmode="decimal" placeholder="kg" data-action="setField" data-ex="${exIdx}" data-set="${sIdx}" data-field="weight" value="${s.weight ?? ""}">
            <input type="number" inputmode="numeric" placeholder="${REP_TARGET.min}-${REP_TARGET.max}" data-action="setField" data-ex="${exIdx}" data-set="${sIdx}" data-field="reps" value="${s.reps ?? ""}">
            <button class="remove-set" data-action="removeSet" data-ex="${exIdx}" data-set="${sIdx}">✕</button>
          </div>
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

function renderWorkouts() {
  const exerciseBlocks = RESISTANCE_EXERCISES.map(name => {
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
  }).join("");

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
    <div class="card"><h2>Resistance progression</h2></div>
    ${exerciseBlocks}
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

function pendingCheckinDayNumber() {
  const today = dayNumberFor(formatDateKey(new Date()));
  const doneNumbers = new Set(state.checkIns.map(c => c.dayNumber));
  for (let n = CHECKIN_INTERVAL_DAYS; n <= TOTAL_DAYS; n += CHECKIN_INTERVAL_DAYS) {
    if (n <= today && !doneNumbers.has(n)) return n;
  }
  return null;
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
    ${pendingBlock || `<div class="card"><h2>Check-in</h2><div class="empty-state">Next check-in at day ${(() => {
      const done = new Set(state.checkIns.map(c => c.dayNumber));
      for (let n = CHECKIN_INTERVAL_DAYS; n <= TOTAL_DAYS; n += CHECKIN_INTERVAL_DAYS) if (!done.has(n)) return n;
      return TOTAL_DAYS;
    })()}</div></div>`}
    <div class="card">
      <h2>Current targets</h2>
      <div class="meal-item-macro">Rest day: ${state.targets.calRest} cal · Training day: ${state.targets.calTrain} cal · Protein: ${state.targets.protein}g</div>
    </div>
    <div class="card">
      <h2>Check-in history</h2>
      ${history ? `<table class="hist-table"><tr><th>Checkpoint</th><th>Rate</th><th>Adjustment</th></tr>${history}</table>` : `<div class="empty-state">No check-ins yet</div>`}
    </div>
  `;
}

// ---------- To-Do tab (perpetual, not tied to any day) ----------

function renderTodo() {
  const items = state.todos.slice().reverse();
  const rows = items.length ? items.map(t => `
    <div class="meal-item">
      <button class="todo-check" data-action="checkTodo" data-id="${t.id}"></button>
      <div class="todo-label">${t.text}</div>
    </div>
  `).join("") : `<div class="empty-state">Nothing on your list — add something below</div>`;

  return `
    <div class="card">
      <h2>To-Do</h2>
      <div class="meal-item-macro" style="margin-bottom:10px;">Sticks around until you check it off, then it's gone. Not tied to a specific day.</div>
      <div class="add-item-row" style="display:flex; gap:8px;">
        <input type="text" id="todo-input" placeholder="Add a task…" style="flex:1;">
        <button class="btn secondary" data-action="addTodo">Add</button>
      </div>
    </div>
    <div class="card">
      ${rows}
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
    render(); return;
  }
  if (action === "jumpToday") {
    viewDate = formatDateKey(new Date());
    mealTabIndex = 0;
    render(); return;
  }
  if (action === "setMealTab") {
    mealTabIndex = Number(el.dataset.idx);
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
    const isTemplateItem = id in (MEAL_TEMPLATES[mealName] || {});
    const next = (meal[id] || 0) + Number(el.dataset.delta);
    if (next <= 0) { if (isTemplateItem) meal[id] = 0; else delete meal[id]; }
    else meal[id] = next;
    saveState(); render(); return;
  }
  if (action === "mealLogPlanned") {
    const mealName = el.dataset.meal;
    day.meals[mealName] = { ...day.meals[mealName], ...MEAL_TEMPLATES[mealName] };
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
      day.workout.exercises = RESISTANCE_EXERCISES.map(name => ({ name, sets: [] }));
    }
    if (type === "run" && (!day.workout.core || day.workout.core.length === 0)) {
      day.workout.core = CORE_EXERCISES.map(ce => ({ name: ce.name, type: ce.type, sets: [] }));
    }
    saveState(); render(); return;
  }
  if (action === "addSet") {
    const ex = day.workout.exercises[Number(el.dataset.ex)];
    let suggestedWeight = "";
    if (ex.sets.length && ex.sets[ex.sets.length - 1].weight !== "") {
      suggestedWeight = ex.sets[ex.sets.length - 1].weight;
    } else {
      const last = lastSessionFor(ex.name, viewDate);
      if (last) suggestedWeight = last.reps >= REP_TARGET.max ? last.weight + WEIGHT_STEP_KG : last.weight;
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
  if (action === "addTodo") { addTodoFromInput(); return; }
  if (action === "checkTodo") {
    state.todos = state.todos.filter(t => String(t.id) !== el.dataset.id);
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
  if (action === "setField") {
    const ex = day.workout.exercises[Number(el.dataset.ex)];
    ex.sets[Number(el.dataset.set)][el.dataset.field] = el.value === "" ? "" : Number(el.value);
    saveState(); return;
  }
  if (action === "setCoreField") {
    const ex = day.workout.core[Number(el.dataset.ex)];
    ex.sets[Number(el.dataset.set)][el.dataset.field] = el.value === "" ? "" : Number(el.value);
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
  if (e.key === "Enter" && e.target.id === "todo-input") {
    e.preventDefault();
    addTodoFromInput();
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
  render();
});

function addTodoFromInput() {
  const input = document.getElementById("todo-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  state.todos.push({ id: Date.now() + Math.random(), text });
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
}

// ---------- init ----------

render();
