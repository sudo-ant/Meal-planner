const DATA_PATHS = {
  recipes: "data/recipes.json",
  ingredients: "data/ingredients.json"
};

const STORAGE_KEYS = {
  currentWeek: "studentFoodPlanner.currentWeek",
  atHome: "studentFoodPlanner.atHome",
  hideBought: "studentFoodPlanner.hideBought",
  weightEntries: "studentFoodPlanner.weightEntries"
};

const CATEGORY_ORDER = [
  "Meat",
  "Fish",
  "Eggs",
  "Pulses",
  "Vegetables",
  "Fruit",
  "Dairy",
  "Frozen",
  "Dry goods",
  "Tinned goods",
  "Herbs",
  "Condiments",
  "Seasoning",
  "Oil & cooking fats",
  "Other"
];

const RECIPE_GROUPS = [
  "all",
  "Chicken",
  "Turkey",
  "Beef",
  "Fish",
  "Vegetarian / Eggs",
  "Light / Summer"
];

const RECIPE_STYLES = [
  "all",
  "Asian",
  "Mediterranean",
  "Italian",
  "Latin American",
  "European",
  "Everyday"
];

let recipes = [];
let ingredients = [];
let recipesById = {};
let ingredientsById = {};
let currentWeek = null;
let atHome = null;
let hideBought = false;
let weightEntries = [];
const storageRecords = new Map();
const pendingStorageWrites = new Map();
let weekSaveDependsOnAtHome = false;
let activePlanFilter = "all";
let activePlanStyleFilter = "all";
let activeRecipeFilter = "all";
let activeRecipeStyleFilter = "all";
const recipeListState = new Map();
const recipeCardsByList = new Map();
const recipeSearchText = new Map();

function loadJson(path) {
  return fetch(path).then(response => {
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  });
}

function isStringList(value) {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function readStoredValue(key, fallback, isValid) {
  const record = { status: "unreadable" };
  storageRecords.set(key, record);
  try {
    record.raw = localStorage.getItem(key);
  } catch {
    return fallback;
  }
  record.status = "invalid";
  try {
    const value = record.raw === null ? fallback : JSON.parse(record.raw);
    if (record.raw === null || isValid(value)) {
      record.status = "ready";
      return value;
    }
  } catch {
    // Keep the original value intact if it cannot be decoded.
  }
  return fallback;
}

function updateStorageStatus() {
  const records = [...storageRecords.values()];
  const hasUnsavedEdits = [...pendingStorageWrites.values()].some(write => write.userChange);
  const messages = [];
  if (records.some(record => record.status === "unreadable")) {
    messages.push("Browser storage could not be read. Some saved data may be missing from this session. Reload when storage is available to restore it.");
  }
  if (records.some(record => record.status === "invalid")) {
    messages.push("Some saved data is invalid. The original data has been kept.");
  }
  if (records.some(record => record.status === "changed")) {
    messages.push("Saved data became available or changed outside this session. Reload to use the saved copy.");
  }
  if (records.some(record => record.status === "write-failed")) {
    messages.push(hasUnsavedEdits
      ? "Browser storage could not save your changes. The app will try again the next time you make a change."
      : "Browser storage could not finish updating the saved plan. The original plan is still saved.");
  }
  if (hasUnsavedEdits) {
    messages.push("Unsaved changes are available only in this session. Closing or reloading the page will lose them.");
  }

  const status = document.getElementById("storageStatus");
  const message = messages.join(" ");
  if (status.textContent === message) return;
  status.textContent = message;
  status.classList.toggle("warning", Boolean(message));
  const active = document.activeElement;
  if (message && active?.matches(":focus-visible") && active.closest(".panel")) {
    keepControlInView(active);
  }
}

function removingAtHomeWouldRestoreBought() {
  const savedHome = storageRecords.get(STORAGE_KEYS.atHome).raw;
  if (!savedHome) return false;
  const removed = JSON.parse(savedHome).ingredientIds.filter(id => !atHome.ingredientIds.includes(id));
  if (!removed.length) return false;
  const savedWeek = storageRecords.get(STORAGE_KEYS.currentWeek);
  if (["invalid", "unreadable", "changed"].includes(savedWeek.status)) return true;
  const rawWeek = savedWeek.raw ?? null;
  try {
    if (localStorage.getItem(STORAGE_KEYS.currentWeek) !== rawWeek) return true;
  } catch {
    return true;
  }
  const bought = JSON.parse(rawWeek)?.boughtIngredientIds ?? [];
  return removed.some(id => bought.includes(id));
}

function flushStorageWrites() {
  const { atHome: atHomeKey, currentWeek: weekKey, hideBought: hideBoughtKey, weightEntries: weightKey } = STORAGE_KEYS;
  const homeNeedsWeek = pendingStorageWrites.has(atHomeKey) &&
    !["invalid", "changed"].includes(storageRecords.get(atHomeKey).status) &&
    removingAtHomeWouldRestoreBought();
  // Keep the saved At home marker until the weekly Bought clear can be saved.
  const stockKeys = homeNeedsWeek ? [weekKey, atHomeKey] : [atHomeKey, weekKey];
  for (const key of [...stockKeys, hideBoughtKey, weightKey]) {
    if (!pendingStorageWrites.has(key)) continue;
    if (key === weekKey && !homeNeedsWeek && weekSaveDependsOnAtHome && pendingStorageWrites.has(atHomeKey)) continue;
    if (key === atHomeKey && homeNeedsWeek && removingAtHomeWouldRestoreBought()) continue;

    const record = storageRecords.get(key);
    if (record.status === "invalid" || record.status === "changed") continue;
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      record.status = "unreadable";
      continue;
    }
    // A session that started without a readable copy may only save into a missing key.
    if (raw !== (record.raw ?? null)) {
      record.status = "changed";
      continue;
    }

    const { raw: next } = pendingStorageWrites.get(key);
    try {
      if (raw !== next) localStorage.setItem(key, next);
    } catch {
      record.status = "write-failed";
      continue;
    }
    record.status = "ready";
    record.raw = next;
    pendingStorageWrites.delete(key);
    if (key === weekKey) weekSaveDependsOnAtHome = false;
  }
  updateStorageStatus();
}

function queueStoredJson(key, value, userChange) {
  const existing = pendingStorageWrites.get(key);
  pendingStorageWrites.set(key, { raw: JSON.stringify(value), userChange: userChange || existing?.userChange });
}

function setStoredJson(key, value, userChange = true) {
  queueStoredJson(key, value, userChange);
  flushStorageWrites();
}

function createEmptyWeek() {
  return {
    version: 3,
    createdAt: new Date().toISOString(),
    selections: [],
    boughtIngredientIds: []
  };
}

function getBatch(recipe, batchId) {
  return recipe?.batchOptions.find(batch => batch.id === batchId) || recipe?.batchOptions[0] || null;
}

function canRepeatRecipe(recipe) {
  return Boolean(recipe?.batchOptions.length) && recipe.batchOptions.every(batch => batch.yield.max < 6);
}

function normaliseRepeatCount(recipe, value) {
  return canRepeatRecipe(recipe) && value === 2 ? 2 : 1;
}

function normaliseCookedCount(value, repeatCount) {
  const cookedCount = Number.isInteger(value) ? value : 0;
  return Math.min(repeatCount, Math.max(0, cookedCount));
}

function normaliseChoiceSelections(batch, values = {}) {
  const selections = {};

  (batch?.choices || []).forEach(choice => {
    const chosen = choice.options.some(option => option.id === values[choice.id])
      ? values[choice.id]
      : choice.defaultOptionId;

    if (chosen && choice.options.some(option => option.id === chosen)) {
      selections[choice.id] = chosen;
    }
  });

  return selections;
}

function normaliseCurrentWeek(value) {
  if (!value || ![2, 3].includes(value.version) || !Array.isArray(value.selections)) {
    return createEmptyWeek();
  }

  const seenRecipes = new Set();
  const selections = [];

  value.selections.forEach(selection => {
    const recipe = recipesById[selection?.recipeId];
    if (!recipe?.batchOptions || seenRecipes.has(recipe.id)) return;

    const batch = getBatch(recipe, selection.batchId);
    if (!batch) return;

    const repeatCount = value.version === 3
      ? normaliseRepeatCount(recipe, selection.repeatCount)
      : 1;
    const cookedCount = value.version === 3
      ? normaliseCookedCount(selection.cookedCount, repeatCount)
      : selection.cooked ? 1 : 0;

    seenRecipes.add(recipe.id);
    selections.push({
      recipeId: recipe.id,
      batchId: batch.id,
      repeatCount,
      cookedCount,
      choiceSelections: normaliseChoiceSelections(batch, selection.choiceSelections)
    });
  });

  return {
    version: 3,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    selections,
    boughtIngredientIds: Array.isArray(value.boughtIngredientIds)
      ? [...new Set(value.boughtIngredientIds.filter(id => ingredientsById[id]))]
      : []
  };
}

function normaliseAtHome(value) {
  return {
    version: 1,
    ingredientIds: Array.isArray(value?.ingredientIds)
      ? [...new Set(value.ingredientIds.filter(id => ingredientsById[id]))]
      : []
  };
}

function saveCurrentWeek(userChange = true) {
  setStoredJson(STORAGE_KEYS.currentWeek, currentWeek, userChange);
}

function saveAtHome() {
  setStoredJson(STORAGE_KEYS.atHome, atHome);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatQuantity(value) {
  if (value === undefined || value === null || value === "") return "";
  if (Number.isInteger(value)) return String(value);

  const whole = Math.trunc(value);
  const fraction = Math.round((value - whole) * 100) / 100;
  const fractionMap = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

  if (fractionMap[fraction]) {
    return whole === 0 ? fractionMap[fraction] : `${whole}${fractionMap[fraction]}`;
  }

  return String(Math.round(value * 100) / 100);
}

function pluraliseUnit(unit, quantity) {
  if (!unit) return "";
  if (quantity === 1) return unit;

  const pluralMap = {
    piece: "pieces",
    clove: "cloves",
    cube: "cubes",
    tin: "tins",
    bag: "bags",
    mug: "mugs"
  };

  return pluralMap[unit] || unit;
}

function formatAmount(quantity, unit) {
  if (typeof quantity !== "number") return "";
  const displayUnit = pluraliseUnit(unit, quantity);
  return `${formatQuantity(quantity)}${displayUnit ? ` ${displayUnit}` : ""}`;
}

function formatYield(batch) {
  const { min, max } = batch.yield;
  return min === max ? `about ${min} portions` : `about ${min}–${max} portions`;
}

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category || "Other");
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function groupByCategory(items) {
  return items.reduce((groups, item) => {
    const category = item.ingredient.category || "Other";
    if (!groups[category]) groups[category] = [];
    groups[category].push(item);
    return groups;
  }, {});
}

function orderedCategoryEntries(groups) {
  return Object.entries(groups).sort(([a], [b]) => {
    const difference = categoryRank(a) - categoryRank(b);
    return difference || a.localeCompare(b);
  });
}

function getSelection(recipeId) {
  return currentWeek.selections.find(selection => selection.recipeId === recipeId) || null;
}

function getSelectedOption(choice, selection) {
  const optionId = selection.choiceSelections?.[choice.id] || choice.defaultOptionId;
  return choice.options.find(option => option.id === optionId) || null;
}

function getSelectedRecipeData(selection) {
  const recipe = recipesById[selection.recipeId];
  const batch = getBatch(recipe, selection.batchId);
  return { recipe, batch };
}

function getBatchIngredientGroups(selection) {
  const { batch } = getSelectedRecipeData(selection);
  if (!batch) return [];

  const groups = [{ label: "Ingredients", ingredients: batch.ingredients }];
  batch.choices.forEach(choice => {
    const option = getSelectedOption(choice, selection);
    if (option) groups.push({ label: `${choice.label}: ${option.label}`, ingredients: option.ingredients });
  });
  return groups;
}

function setActiveTab(tabName) {
  const focusedPanel = document.activeElement?.closest(".panel");
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  document.querySelectorAll(".panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `${tabName}Panel`);
  });
  if (focusedPanel && !focusedPanel.classList.contains("active")) {
    document.querySelector(".tab.active").focus({ preventScroll: true });
  }
}

function canRestoreFocus(control) {
  return control && !control.matches(":disabled") && control.getClientRects().length > 0;
}

function keepControlInView(control) {
  const toolbarBottom = Math.max(0, document.querySelector(".app-toolbar").getBoundingClientRect().bottom);
  const { top, bottom } = control.getBoundingClientRect();
  const delta = top < toolbarBottom ? top - toolbarBottom : Math.max(0, bottom - window.innerHeight);
  if (delta) window.scrollBy(0, delta);
}

function restoreListFocus(control, keyboardFocus) {
  if (!control) return;
  control.focus({ preventScroll: true });
  if (keyboardFocus) keepControlInView(control);
}

function controlKey(control) {
  if (control.type === "radio") return `${control.name}:${control.value}`;
  if (control.dataset.choiceId) return `choice:${control.dataset.choiceId}`;
  if (control.classList.contains("stock-button")) return "stock";
  if (control.classList.contains("bought-check")) return "bought";
  return control.dataset.action || control.id || control.tagName;
}

function findListControl(row, key) {
  return [...(row?.querySelectorAll("button, input, select, summary") ?? [])].find(control =>
    (key === undefined || controlKey(control) === key) && canRestoreFocus(control));
}

function listFallback(id) {
  const control = id ? document.getElementById(id) : document.querySelector(".tab.active");
  return canRestoreFocus(control) ? control : null;
}

function replaceList(id, markup, fallbackId) {
  const list = document.getElementById(id);
  const rowSelector = "[data-recipe-card], [data-ingredient-row]";
  const rowKey = row => row.dataset.recipeCard ?? row.dataset.ingredientRow;
  const oldRows = [...list.querySelectorAll(rowSelector)];
  const active = document.activeElement;
  const activeRow = list.contains(active) ? active.closest(rowSelector) : null;
  const keyboardFocus = activeRow && active.matches(":focus-visible");
  // Keep each list's state for recipes temporarily absent from the results.
  const state = recipeListState.get(id) ?? new Map();

  for (const row of oldRows) {
    const details = row.querySelector("details");
    const batch = row.querySelector(".add-batch-option:checked");
    if (details) state.set(rowKey(row), { open: details.open, batch: batch?.value });
  }
  if (state.size) recipeListState.set(id, state);
  list.innerHTML = markup;
  const rows = new Map([...list.querySelectorAll(rowSelector)].map(row => [rowKey(row), row]));
  for (const [key, row] of rows) {
    const previous = state.get(key);
    if (!previous) continue;
    const details = row.querySelector("details");
    if (details) details.open = previous.open;
    const batch = [...row.querySelectorAll(".add-batch-option")].find(input => input.value === previous.batch);
    if (batch) batch.checked = true;
  }

  if (!activeRow) return;
  const key = controlKey(active);
  const sameRow = rows.get(rowKey(activeRow));
  const matching = findListControl(sameRow, key) ?? findListControl(sameRow);
  if (matching) {
    restoreListFocus(matching, keyboardFocus);
    return;
  }

  const index = oldRows.indexOf(activeRow);
  const neighbours = [...oldRows.slice(index + 1), ...oldRows.slice(0, index).reverse()];
  let target;
  for (const row of neighbours) {
    target = findListControl(rows.get(rowKey(row)), key);
    if (target) break;
  }
  target ??= listFallback(fallbackId);
  restoreListFocus(target, keyboardFocus);
}

function recipeRow(list, recipeId) {
  return list.querySelector(`[data-recipe-card="${CSS.escape(recipeId)}"]`);
}

function renderWeeklyCards(id, makeCard, emptyMessage, recipeId, fallbackId) {
  const selections = currentWeek.selections;
  if (!recipeId || !selections.length) {
    const markup = selections.map(makeCard).join("") || `<div class="card empty">${emptyMessage}</div>`;
    replaceList(id, markup, fallbackId);
    return;
  }

  const list = document.getElementById(id);
  const row = recipeRow(list, recipeId);
  const selection = getSelection(recipeId);
  const active = document.activeElement;
  const key = row?.contains(active) ? controlKey(active) : null;
  const keyboardFocus = key && active.matches(":focus-visible");
  const next = row?.nextElementSibling;
  const previous = row?.previousElementSibling;
  const details = row?.querySelector("details");
  const state = recipeListState.get(id) ?? new Map();
  if (details) {
    state.set(recipeId, { open: details.open });
    recipeListState.set(id, state);
  }

  let replacement;
  if (selection) {
    const template = document.createElement("template");
    template.innerHTML = makeCard(selection).trim();
    replacement = template.content.firstElementChild;
    if (state.get(recipeId)?.open) replacement.querySelector("details").open = true;
    if (row) row.replaceWith(replacement);
    else {
      if (list.firstElementChild?.classList.contains("empty")) list.firstElementChild.remove();
      list.append(replacement);
    }
  } else {
    row?.remove();
  }

  if (key) restoreListFocus(findListControl(replacement, key) ?? findListControl(replacement) ??
    findListControl(next, key) ?? findListControl(previous, key) ?? listFallback(fallbackId), keyboardFocus);
}

function addRecipeToWeek(recipeId, batchId) {
  const recipe = recipesById[recipeId];
  const batch = getBatch(recipe, batchId);
  if (!recipe || !batch) return;

  const existing = getSelection(recipeId);
  if (existing) {
    existing.batchId = batch.id;
    existing.choiceSelections = normaliseChoiceSelections(batch, existing.choiceSelections);
  } else {
    currentWeek.selections.push({
      recipeId,
      batchId: batch.id,
      repeatCount: 1,
      cookedCount: 0,
      choiceSelections: normaliseChoiceSelections(batch)
    });
  }

  saveCurrentWeek();
  refreshWeeklyRecipe(recipeId);
  updatePickerRecipe(recipeId);
}

function changeRecipeBatch(recipeId, batchId) {
  const selection = getSelection(recipeId);
  const recipe = recipesById[recipeId];
  const batch = getBatch(recipe, batchId);
  if (!selection || !batch) return;

  selection.batchId = batch.id;
  selection.choiceSelections = normaliseChoiceSelections(batch, selection.choiceSelections);
  saveCurrentWeek();
  refreshWeeklyRecipe(recipeId);
}

function changeRecipeRepeatCount(recipeId, value) {
  const selection = getSelection(recipeId);
  const recipe = recipesById[recipeId];
  if (!selection || !recipe) return;

  selection.repeatCount = normaliseRepeatCount(recipe, Number(value));
  selection.cookedCount = normaliseCookedCount(selection.cookedCount, selection.repeatCount);
  saveCurrentWeek();
  refreshWeeklyRecipe(recipeId);
}

function changeCookedCount(recipeId, delta) {
  const selection = getSelection(recipeId);
  if (!selection) return;

  selection.cookedCount = normaliseCookedCount(selection.cookedCount + delta, selection.repeatCount);
  saveCurrentWeek();
  renderCook();
}

function removeRecipeFromWeek(recipeId) {
  currentWeek.selections = currentWeek.selections.filter(selection => selection.recipeId !== recipeId);
  saveCurrentWeek();
  refreshWeeklyRecipe(recipeId);
  updatePickerRecipe(recipeId);
}

function startNewWeek() {
  const hasState = currentWeek.selections.length > 0 || currentWeek.boughtIngredientIds.length > 0;
  if (hasState && !window.confirm("Start a new week? This clears the current plan, cooked ticks and bought ticks.")) {
    return;
  }

  currentWeek = createEmptyWeek();
  weekSaveDependsOnAtHome = false;
  saveCurrentWeek();
  renderWeek(true);
}

function batchOptionsMarkup(recipe, selectedBatchId, className, groupName, labelText = "Choose batch size") {
  const options = recipe.batchOptions.map(batch => `
    <label class="batch-option">
      <input type="radio" class="${className}" name="${escapeHtml(groupName)}" value="${escapeHtml(batch.id)}" data-recipe-id="${escapeHtml(recipe.id)}" ${batch.id === selectedBatchId ? "checked" : ""}>
      <span class="batch-option-copy">
        <strong>${escapeHtml(batch.label)}</strong>
        <small>${escapeHtml(formatYield(batch))}</small>
      </span>
    </label>
  `).join("");

  return `
    <fieldset class="batch-options">
      <legend>${escapeHtml(labelText)}</legend>
      <div class="batch-option-list">${options}</div>
    </fieldset>
  `;
}

function repeatOptionsMarkup(recipe, selection, batch) {
  if (!canRepeatRecipe(recipe)) return "";

  const options = [1, 2].map(count => `
    <label class="repeat-option">
      <input type="radio" class="repeat-count-option" name="repeat-${escapeHtml(recipe.id)}" value="${count}" data-recipe-id="${escapeHtml(recipe.id)}" ${selection.repeatCount === count ? "checked" : ""}>
      <span>${count}×</span>
    </label>
  `).join("");
  const weeklyMin = batch.yield.min * selection.repeatCount;
  const weeklyMax = batch.yield.max * selection.repeatCount;
  const weeklyPortions = weeklyMin === weeklyMax ? weeklyMin : `${weeklyMin}–${weeklyMax}`;

  return `
    <fieldset class="repeat-options">
      <legend>Times this week</legend>
      <div class="repeat-option-list">${options}</div>
    </fieldset>
    ${selection.repeatCount === 2
      ? `<p class="repeat-note">2 separate cooks · about ${escapeHtml(weeklyPortions)} portions across the week</p>`
      : ""}
  `;
}

function storageMarkup(batch) {
  const spaceWarning = batch.storage.size === "large_batch"
    ? `<p class="warning">Check you have enough fridge/freezer space.</p>`
    : "";
  const freezerLabel = batch.storage.freezer.charAt(0).toUpperCase() + batch.storage.freezer.slice(1);
  return `${spaceWarning}<p class="meta">Freezer: ${escapeHtml(freezerLabel)}</p>`;
}

function choiceControlsMarkup(selection, batch) {
  if (!batch.choices.length) return "";

  return `<div class="choice-controls">${batch.choices.map(choice => {
    const selected = selection.choiceSelections?.[choice.id] || choice.defaultOptionId || "";
    const emptyOption = choice.required ? "" : `<option value="">Not selected</option>`;
    const options = choice.options.map(option => `
      <option value="${escapeHtml(option.id)}" ${option.id === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>
    `).join("");

    return `
      <label class="field-label">
        <span>${escapeHtml(choice.label)}${choice.required || /optional/i.test(choice.label) ? "" : " (optional)"}</span>
        <select class="choice-select" data-recipe-id="${escapeHtml(selection.recipeId)}" data-choice-id="${escapeHtml(choice.id)}">
          ${emptyOption}${options}
        </select>
      </label>
    `;
  }).join("")}</div>`;
}

function renderPlan(recipeId) {
  const summary = document.getElementById("planSummary");

  if (!currentWeek.selections.length) {
    summary.textContent = "No recipes selected yet.";
  } else {
    const totals = currentWeek.selections.reduce((result, selection) => {
      const { batch } = getSelectedRecipeData(selection);
      result.min += batch.yield.min * selection.repeatCount;
      result.max += batch.yield.max * selection.repeatCount;
      result.occasions += selection.repeatCount;
      return result;
    }, { min: 0, max: 0, occasions: 0 });
    const portions = totals.min === totals.max ? totals.min : `${totals.min}–${totals.max}`;
    const recipeCount = currentWeek.selections.length;
    const recipeLabel = `${recipeCount} recipe${recipeCount === 1 ? "" : "s"}`;
    summary.textContent = totals.occasions > recipeCount
      ? `${recipeLabel} · ${totals.occasions} cooking occasions · about ${portions} portions`
      : `${recipeLabel} · about ${portions} portions`;
  }
  renderWeeklyCards("weekList", planItemMarkup, "Add recipes below to build this week.", recipeId, "planRecipeSearch");
}

function planItemMarkup(selection) {
  const { recipe, batch } = getSelectedRecipeData(selection);
  return `
    <article class="card plan-item selected-recipe" data-recipe-card="${escapeHtml(recipe.id)}">
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(recipe.title)}</h3>
          <p class="meta">${escapeHtml(recipe.group)} · ${escapeHtml(batch.label)} · ${escapeHtml(formatYield(batch))}</p>
        </div>
        <button class="ghost small" type="button" data-action="remove-recipe" data-recipe-id="${escapeHtml(recipe.id)}">Remove</button>
      </div>
      ${recipe.batchOptions.length > 1
        ? batchOptionsMarkup(recipe, batch.id, "plan-batch-option", `plan-batch-${recipe.id}`, "Change batch")
        : `<p class="batch-label"><strong>${escapeHtml(batch.label)}</strong> · ${escapeHtml(formatYield(batch))}</p>`}
      ${repeatOptionsMarkup(recipe, selection, batch)}
      ${choiceControlsMarkup(selection, batch)}
      ${storageMarkup(batch)}
    </article>
  `;
}

function recipeSearchBlob(recipe) {
  const ingredientNames = recipe.batchOptions.flatMap(batch => [
    ...batch.ingredients,
    ...batch.choices.flatMap(choice => choice.options.flatMap(option => option.ingredients))
  ]).map(reference => ingredientsById[reference.ingredientId]?.name || reference.ingredientId);

  return [recipe.title, recipe.group, recipe.style, ...(recipe.tags || []), ...ingredientNames].join(" ").toLowerCase();
}

function filterRecipes(query, group, style) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return recipes.filter(recipe => {
    if (group !== "all" && recipe.group !== group) return false;
    if (style !== "all" && recipe.style !== style) return false;
    if (!tokens.length) return true;
    if (!recipeSearchText.has(recipe.id)) recipeSearchText.set(recipe.id, recipeSearchBlob(recipe));
    const searchable = recipeSearchText.get(recipe.id);
    return tokens.every(token => searchable.includes(token));
  });
}

function pickerActionMarkup(recipe, selection) {
  const defaultBatch = recipe.batchOptions[0];
  return selection
      ? `<button class="secondary in-plan-button" type="button" data-action="view-plan">In this week's plan</button>`
      : `
        ${recipe.batchOptions.length > 1 ? batchOptionsMarkup(recipe, defaultBatch.id, "add-batch-option", `add-batch-plan-${recipe.id}`) : ""}
        <button type="button" data-action="add-recipe" data-recipe-id="${escapeHtml(recipe.id)}" data-source="plan">
          Add to week${recipe.batchOptions.length === 1 ? ` · ${escapeHtml(defaultBatch.label)} · ${escapeHtml(formatYield(defaultBatch))}` : ""}
        </button>
      `;
}

function updatePickerRecipe(recipeId) {
  const row = recipeCardsByList.get("planRecipeList")?.get(recipeId);
  if (!row) return;

  const action = row.querySelector(".recipe-action");
  const active = document.activeElement;
  const hadFocus = action.contains(active);
  const keyboardFocus = hadFocus && active.matches(":focus-visible");
  const selection = getSelection(recipeId);
  row.classList.toggle("selected-recipe", Boolean(selection));
  action.innerHTML = pickerActionMarkup(recipesById[recipeId], selection);
  if (hadFocus) restoreListFocus(findListControl(action, selection ? "view-plan" : "add-recipe"), keyboardFocus);
}

function recipeCardMarkup(recipe, source) {
  const isPlanPicker = source === "plan";
  const selection = isPlanPicker ? getSelection(recipe.id) : null;
  const control = isPlanPicker ? pickerActionMarkup(recipe, selection) : "";

  return `
    <article class="card recipe-card ${selection ? "selected-recipe" : ""}" data-recipe-card="${escapeHtml(recipe.id)}">
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(recipe.title)}</h3>
          <p class="meta">${escapeHtml(recipe.group)} · ${escapeHtml(recipe.style)} · ${recipe.batchOptions.length} batch option${recipe.batchOptions.length === 1 ? "" : "s"}</p>
        </div>
        ${recipe.trial ? `<span class="tag trial-tag">Trial</span>` : ""}
      </div>
      <div class="tags">${recipe.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      ${control ? `<div class="recipe-action">${control}</div>` : ""}
      ${recipeDetailsMarkup(recipe)}
    </article>
  `;
}

function renderPlanRecipeBrowser() {
  const query = document.getElementById("planRecipeSearch").value;
  renderFilterChips("planRecipeFilters", RECIPE_GROUPS, activePlanFilter, "filter-plan-recipes");
  renderFilterChips("planStyleFilters", RECIPE_STYLES, activePlanStyleFilter, "filter-plan-style");
  const filtered = filterRecipes(query, activePlanFilter, activePlanStyleFilter);
  renderRecipeCards("planRecipeList", filtered, "plan", "planRecipeSearch");
}

function renderRecipeCards(id, filtered, source, fallbackId) {
  const list = document.getElementById(id);
  const emptyMarkup = `<div class="card empty">No recipes found.</div>`;
  const cards = recipeCardsByList.get(id);
  if (!cards) {
    list.innerHTML = filtered.map(recipe => recipeCardMarkup(recipe, source)).join("") || emptyMarkup;
    recipeCardsByList.set(id, new Map([...list.querySelectorAll("[data-recipe-card]")].map(row =>
      [row.dataset.recipeCard, row])));
    return;
  }

  const wanted = new Set(filtered.map(recipe => recipe.id));
  const previousRows = [...list.children];
  const active = document.activeElement;
  const activeRow = list.contains(active) ? active.closest("[data-recipe-card]") : null;
  const focusRemoved = activeRow && !wanted.has(activeRow.dataset.recipeCard);
  const keyboardFocus = focusRemoved && active.matches(":focus-visible");
  const key = focusRemoved && controlKey(active);

  // Detaching a card keeps its native disclosure and radio state intact.
  for (const row of previousRows) {
    if (!wanted.has(row.dataset.recipeCard) && (filtered.length || row.dataset.recipeCard)) row.remove();
  }
  if (!filtered.length && !list.firstElementChild) list.innerHTML = emptyMarkup;

  // Results always follow catalogue order, so surviving cards can stay where they are.
  let next = null;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const recipe = filtered[i];
    let row = cards.get(recipe.id);
    if (!row) {
      const template = document.createElement("template");
      template.innerHTML = recipeCardMarkup(recipe, source).trim();
      row = template.content.firstElementChild;
      cards.set(recipe.id, row);
    }
    if (row.parentElement !== list) list.insertBefore(row, next);
    next = row;
  }

  if (focusRemoved) {
    const index = previousRows.indexOf(activeRow);
    const neighbours = [...previousRows.slice(index + 1), ...previousRows.slice(0, index).reverse()];
    let target;
    for (const row of neighbours) {
      if (row.parentElement !== list) continue;
      target = findListControl(row, key);
      if (target) break;
    }
    restoreListFocus(target ?? listFallback(fallbackId), keyboardFocus);
  }
}

function recipeDetailsMarkup(recipe) {
  return `
    <details class="recipe-details">
      <summary>Recipe details</summary>
      ${recipe.batchOptions.map(batch => `
        <section class="recipe-detail-block">
          <h4>${escapeHtml(batch.label)} · ${escapeHtml(formatYield(batch))}</h4>
          ${storageMarkup(batch)}
          <h5>Ingredients</h5>
          <ul>${batch.ingredients.map(ingredientLineMarkup).join("")}</ul>
          ${batch.choices.map(choice => `
            <div class="choice-description">
              <h5>${escapeHtml(choice.label)}${choice.required || /optional/i.test(choice.label) ? "" : " (optional)"}</h5>
              ${choice.options.map(option => `
                <p><strong>${escapeHtml(option.label)}:</strong> ${option.ingredients.map(item => escapeHtml(item.display)).join(", ")}</p>
              `).join("")}
            </div>
          `).join("")}
          ${(batch.notes || []).length ? `<h5>Batch notes</h5><ul>${batch.notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
        </section>
      `).join("")}
      <section class="recipe-detail-block">
        <h4>Steps</h4>
        <ol class="steps">${recipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </section>
      ${recipe.notes.length ? `<section class="recipe-detail-block"><h4>Notes</h4><ul>${recipe.notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul></section>` : ""}
    </details>
  `;
}

function ingredientLineMarkup(reference) {
  const needsOptionalLabel = reference.status === "optional" && !/optional|if using|if needed|to taste/i.test(reference.display);
  return `<li>${escapeHtml(reference.display)}${needsOptionalLabel ? ` <span class="optional-label">Optional</span>` : ""}</li>`;
}

function collectShoppingEntries() {
  const entries = new Map();

  currentWeek.selections.forEach(selection => {
    const { recipe } = getSelectedRecipeData(selection);
    getBatchIngredientGroups(selection).forEach(group => {
      group.ingredients.forEach(reference => {
        const ingredient = ingredientsById[reference.ingredientId];
        if (!ingredient?.shopping || reference.shoppingBehaviour === "leftover") return;

        if (!entries.has(ingredient.id)) {
          entries.set(ingredient.id, {
            ingredient,
            requiredAmount: 0,
            optionalAmount: 0,
            requiredPresence: false,
            optionalPresence: false,
            requiredSources: new Set(),
            optionalSources: new Set(),
            preferredPackIds: new Set()
          });
        }

        const entry = entries.get(ingredient.id);
        const isOptional = reference.status === "optional";
        const amountKey = isOptional ? "optionalAmount" : "requiredAmount";
        const presenceKey = isOptional ? "optionalPresence" : "requiredPresence";
        const sources = isOptional ? entry.optionalSources : entry.requiredSources;

        if (ingredient.aggregation.mode === "sum" && typeof reference.amount === "number") {
          entry[amountKey] += reference.amount * selection.repeatCount;
        } else {
          entry[presenceKey] = true;
        }

        sources.add(recipe.title);
        if (reference.preferredPackId) entry.preferredPackIds.add(reference.preferredPackId);
      });
    });
  });

  return [...entries.values()].sort((a, b) => {
    const categoryDifference = categoryRank(a.ingredient.category) - categoryRank(b.ingredient.category);
    return categoryDifference || a.ingredient.name.localeCompare(b.ingredient.name);
  });
}

function optimisePacks(requiredAmount, packs, preferredPackIds) {
  if (!packs.length || requiredAmount <= 0) return null;
  const smallest = Math.min(...packs.map(pack => pack.amount));
  const maxCount = Math.ceil(requiredAmount / smallest) + 1;
  let best = null;

  function search(index, counts, totalAmount, totalCount, preferredCount) {
    if (index === packs.length) {
      if (totalAmount < requiredAmount || totalCount === 0) return;
      const candidate = {
        counts: [...counts],
        excess: totalAmount - requiredAmount,
        totalCount,
        preferredCount
      };
      if (!best || candidate.excess < best.excess ||
        (candidate.excess === best.excess && candidate.totalCount < best.totalCount) ||
        (candidate.excess === best.excess && candidate.totalCount === best.totalCount && candidate.preferredCount > best.preferredCount)) {
        best = candidate;
      }
      return;
    }

    for (let count = 0; count <= maxCount; count += 1) {
      counts[index] = count;
      search(
        index + 1,
        counts,
        totalAmount + (packs[index].amount * count),
        totalCount + count,
        preferredCount + (preferredPackIds.has(packs[index].id) || packs[index].preferred ? count : 0)
      );
    }
  }

  search(0, Array(packs.length).fill(0), 0, 0, 0);
  return best;
}

function packRecommendation(entry, amount = entry.requiredAmount) {
  const packs = entry.ingredient.packs || [];
  const unit = entry.ingredient.aggregation.unit;
  const compatiblePacks = packs.filter(pack =>
    typeof pack.amount === "number" && pack.unit === unit
  );

  if (entry.ingredient.aggregation.mode === "sum" && amount > 0 && compatiblePacks.length) {
    const result = optimisePacks(amount, compatiblePacks, entry.preferredPackIds);
    if (result) {
      const parts = result.counts
        .map((count, index) => count ? `${count} × ${compatiblePacks[index].label}` : "")
        .filter(Boolean);
      return `Buy ${parts.join(" + ")}`;
    }
  }

  const preferred = packs.find(pack => entry.preferredPackIds.has(pack.id)) || packs.find(pack => pack.preferred);
  return preferred ? `Suggested pack: ${preferred.label}` : "";
}

function entryHasRequired(entry) {
  return entry.requiredAmount > 0 || entry.requiredPresence;
}

function shoppingRequirementText(entry) {
  const unit = entry.ingredient.aggregation.unit;
  const required = entry.requiredAmount > 0
    ? `${formatAmount(entry.requiredAmount, unit)} required`
    : entry.requiredPresence ? "Required" : "";
  const optional = entry.optionalAmount > 0
    ? `${formatAmount(entry.optionalAmount, unit)} optional`
    : entry.optionalPresence ? "Optional" : "";
  const optionalSources = [...entry.optionalSources];
  const optionalFor = optionalSources.length ? `Optional for ${optionalSources.join(", ")}` : "";
  return { required, optional, optionalFor };
}

function shoppingRequirementMarkup(entry) {
  const { required, optional, optionalFor } = shoppingRequirementText(entry);
  return `
    ${required ? `<span>${escapeHtml(required)}</span>` : ""}
    ${optional ? `<span>${escapeHtml(optional)}</span>` : ""}
    ${optionalFor ? `<small class="meta">${escapeHtml(optionalFor)}</small>` : ""}
  `;
}

function shoppingEntryMarkup(entry, section) {
  const ingredientId = entry.ingredient.id;
  const checkboxId = escapeHtml(`bought-${ingredientId}`);
  const ingredientName = escapeHtml(entry.ingredient.name);
  const bought = currentWeek.boughtIngredientIds.includes(ingredientId);
  const amountForPack = entryHasRequired(entry) ? entry.requiredAmount : entry.optionalAmount;
  const pack = packRecommendation(entry, amountForPack);
  const sourceSet = new Set([...entry.requiredSources, ...entry.optionalSources]);

  return `
    <div class="shopping-item ${section === "home" ? "home-item" : ""} ${bought ? "done" : ""}" data-ingredient-row="${escapeHtml(ingredientId)}">
      ${section === "home" ? "" : `
        <label class="bought-target">
          <input id="${checkboxId}" class="checkbox bought-check" type="checkbox" data-ingredient-id="${escapeHtml(ingredientId)}" ${bought ? "checked" : ""} aria-label="Mark ${ingredientName} as bought">
        </label>
      `}
      <div class="shopping-item-copy">
        ${section === "home" ? `<strong>${ingredientName}</strong>` : `<label for="${checkboxId}">${ingredientName}</label>`}
        <div class="requirement-line">${shoppingRequirementMarkup(entry)}</div>
        ${pack && section !== "home" ? `<small class="pack-recommendation">${escapeHtml(pack)}</small>` : ""}
        <small class="meta">Used in: ${escapeHtml([...sourceSet].join(", "))}</small>
      </div>
      <button class="ghost small stock-button" type="button" data-action="${section === "home" ? "remove-home" : "mark-home"}" data-ingredient-id="${escapeHtml(ingredientId)}">
        ${section === "home" ? "Need to buy" : "At home"}
      </button>
    </div>
  `;
}

function shoppingSectionMarkup(title, items, section, emptyText) {
  const groups = groupByCategory(items);
  return `
    <section class="shopping-section" aria-labelledby="${section}-heading">
      <h2 id="${section}-heading" class="shopping-section-title">${escapeHtml(title)} <span>${items.length}</span></h2>
      ${items.length ? orderedCategoryEntries(groups).map(([category, categoryItems]) =>
        shoppingCategoryMarkup(category, categoryItems, section)).join("") : shoppingEmptyMarkup(emptyText)}
    </section>
  `;
}

function shoppingCategoryMarkup(category, items, section) {
  return `
    <section class="card shopping-category" data-shopping-category="${escapeHtml(category)}">
      <h3 class="category-title">${escapeHtml(category)}</h3>
      ${items.map(item => shoppingEntryMarkup(item, section)).join("")}
    </section>
  `;
}

function shoppingEmptyMarkup(message) {
  return `<div class="card empty">${escapeHtml(message)}</div>`;
}

function patchShoppingStock(ingredientId, sections) {
  const rowSelector = `[data-ingredient-row="${CSS.escape(ingredientId)}"]`;
  const list = document.getElementById("shoppingList");
  const oldRow = list.querySelector(rowSelector);
  const active = document.activeElement;
  const hadFocus = oldRow?.contains(active);
  const keyboardFocus = hadFocus && active.matches(":focus-visible");
  const key = hadFocus && controlKey(active);

  for (const { items, id, emptyText } of sections) {
    const heading = document.getElementById(`${id}-heading`);
    const section = heading.parentElement;
    const entry = items.find(item => item.ingredient.id === ingredientId);
    if (!entry && !section.contains(oldRow)) {
      const empty = section.querySelector(".empty");
      if (empty && empty.textContent !== emptyText) empty.textContent = emptyText;
      continue;
    }

    if (section.contains(oldRow)) {
      const category = oldRow.parentElement;
      oldRow.remove();
      if (!category.querySelector("[data-ingredient-row]")) category.remove();
    }
    heading.querySelector("span").textContent = items.length;
    if (!items.length) {
      section.insertAdjacentHTML("beforeend", shoppingEmptyMarkup(emptyText));
    } else if (entry) {
      section.querySelector(".empty")?.remove();
      const groups = orderedCategoryEntries(groupByCategory(items));
      const index = groups.findIndex(([category]) => category === entry.ingredient.category);
      const [category, categoryItems] = groups[index];
      const findCategory = name => section.querySelector(`[data-shopping-category="${CSS.escape(name)}"]`);
      const target = findCategory(category);
      if (target) {
        const next = categoryItems[categoryItems.indexOf(entry) + 1];
        const nextRow = next && target.querySelector(`[data-ingredient-row="${CSS.escape(next.ingredient.id)}"]`);
        if (nextRow) nextRow.insertAdjacentHTML("beforebegin", shoppingEntryMarkup(entry, id));
        else target.insertAdjacentHTML("beforeend", shoppingEntryMarkup(entry, id));
      } else {
        const nextCategory = groups[index + 1] && findCategory(groups[index + 1][0]);
        const markup = shoppingCategoryMarkup(category, [entry], id);
        if (nextCategory) nextCategory.insertAdjacentHTML("beforebegin", markup);
        else section.insertAdjacentHTML("beforeend", markup);
      }
    }
  }
  if (hadFocus) {
    const row = list.querySelector(rowSelector);
    restoreListFocus(findListControl(row, key) ?? findListControl(row) ?? listFallback("hideBoughtToggle"), keyboardFocus);
  }
}

function renderShoppingList(focusedCheckbox, movedIngredientId) {
  const allEntries = collectShoppingEntries();
  const atHomeIds = new Set(atHome.ingredientIds);
  const boughtIds = new Set(currentWeek.boughtIngredientIds);

  const atHomeItems = allEntries.filter(entry => atHomeIds.has(entry.ingredient.id));
  const toBuyAll = allEntries.filter(entry => !atHomeIds.has(entry.ingredient.id) && entryHasRequired(entry));
  const optionalAll = allEntries.filter(entry => !atHomeIds.has(entry.ingredient.id) && !entryHasRequired(entry));
  const toBuy = hideBought ? toBuyAll.filter(entry => !boughtIds.has(entry.ingredient.id)) : toBuyAll;
  const optional = hideBought ? optionalAll.filter(entry => !boughtIds.has(entry.ingredient.id)) : optionalAll;
  const shoppingCount = toBuyAll.length + optionalAll.length;
  const boughtCount = [...toBuyAll, ...optionalAll].filter(entry => boughtIds.has(entry.ingredient.id)).length;

  document.getElementById("shoppingStatus").textContent = currentWeek.selections.length
    ? `Bought ${boughtCount} of ${shoppingCount} · ${atHomeItems.length} at home`
    : "Build this week's plan to create a list.";

  if (focusedCheckbox && !hideBought) {
    focusedCheckbox.closest(".shopping-item").classList.toggle("done", focusedCheckbox.checked);
    return;
  }

  const sections = [
    { id: "buy", title: "To buy", items: toBuy, emptyText: hideBought && toBuyAll.length ? "All required items are bought." : "Nothing required to buy." },
    { id: "optional", title: "Optional", items: optional, emptyText: hideBought && optionalAll.length ? "All optional items are bought." : "No optional items this week." },
    { id: "home", title: "At home", items: atHomeItems, emptyText: "No required items are marked At home." }
  ];
  if (movedIngredientId && currentWeek.selections.length) {
    patchShoppingStock(movedIngredientId, sections);
    return;
  }
  const markup = currentWeek.selections.length
    ? sections.map(({ title, items, id, emptyText }) => shoppingSectionMarkup(title, items, id, emptyText)).join("")
    : `<div class="card empty">Add recipes in Plan to build the shopping list.</div>`;
  replaceList("shoppingList", markup, "hideBoughtToggle");
}

function shoppingTextLine(entry) {
  const { required, optional, optionalFor } = shoppingRequirementText(entry);
  const requirement = [required, optional, optionalFor].filter(Boolean).join(" · ");
  const pack = packRecommendation(entry, entryHasRequired(entry) ? entry.requiredAmount : entry.optionalAmount);
  return `- ${entry.ingredient.name}${requirement ? ` — ${requirement}` : ""}${pack ? ` (${pack})` : ""}`;
}

function buildShoppingListText() {
  const atHomeIds = new Set(atHome.ingredientIds);
  const entries = collectShoppingEntries().filter(entry => !atHomeIds.has(entry.ingredient.id));
  const required = entries.filter(entryHasRequired);
  const optional = entries.filter(entry => !entryHasRequired(entry));
  const lines = ["THIS WEEK", "", "TO BUY"];

  required.forEach(entry => lines.push(shoppingTextLine(entry)));
  lines.push("", "OPTIONAL");
  optional.forEach(entry => lines.push(shoppingTextLine(entry)));
  return lines.join("\n").trim();
}

async function copyShoppingList() {
  if (!currentWeek.selections.length) return;
  try {
    await navigator.clipboard.writeText(buildShoppingListText());
    showCopyStatus("Copied");
  } catch {
    showCopyStatus("Copy failed");
  }
}

function showCopyStatus(message) {
  const status = document.getElementById("copyStatus");
  status.textContent = message;
  window.setTimeout(() => { status.textContent = ""; }, 1800);
}

function renderCookSummary() {
  const totals = currentWeek.selections.reduce((result, selection) => {
    result.completed += selection.cookedCount;
    result.occasions += selection.repeatCount;
    return result;
  }, { completed: 0, occasions: 0 });
  document.getElementById("cookSummary").textContent = currentWeek.selections.length
    ? `${totals.completed} of ${totals.occasions} cooking occasion${totals.occasions === 1 ? "" : "s"} completed.`
    : "Only recipes in this week's plan appear here.";
}

function renderCook(recipeId) {
  renderCookSummary();
  renderWeeklyCards("cookList", cookCardMarkup, "Add recipes in Plan before you start cooking.", recipeId);
}

function cookCardMarkup(selection) {
  const { recipe, batch } = getSelectedRecipeData(selection);
  const ingredientGroups = getBatchIngredientGroups(selection);
  const isComplete = selection.cookedCount === selection.repeatCount;
  const progressControl = selection.repeatCount === 2
    ? `
      <div class="cook-repeat-progress" aria-label="Cooking progress for ${escapeHtml(recipe.title)}">
        <p class="repeat-frequency">2 times this week</p>
        <p><strong>Cooked this week: ${selection.cookedCount} of 2</strong></p>
        <div class="cook-progress-actions">
          <button class="ghost small" type="button" data-action="undo-cooked" data-recipe-id="${escapeHtml(recipe.id)}" ${selection.cookedCount === 0 ? "disabled" : ""}>Undo</button>
          <button class="secondary small" type="button" data-action="mark-one-cooked" data-recipe-id="${escapeHtml(recipe.id)}" ${selection.cookedCount === 2 ? "disabled" : ""}>Mark one cooked</button>
        </div>
      </div>
    `
    : "";
  return `
      <article class="card cook-card ${isComplete ? "cooked" : ""}" data-recipe-card="${escapeHtml(recipe.id)}">
        <div class="section-heading">
          <div>
            <h2>${escapeHtml(recipe.title)}</h2>
            <p class="meta">${escapeHtml(batch.label)} · ${escapeHtml(formatYield(batch))}</p>
          </div>
          ${selection.repeatCount === 1 ? `
            <label class="cook-toggle">
              <input class="checkbox cooked-check" type="checkbox" data-recipe-id="${escapeHtml(recipe.id)}" ${isComplete ? "checked" : ""}>
              <span>${isComplete ? "Cooked" : "Mark cooked"}</span>
            </label>
          ` : ""}
        </div>
        ${progressControl}
        ${storageMarkup(batch)}
        <details class="cook-details">
          <summary><span class="show-recipe-label">Show recipe</span><span class="hide-recipe-label">Hide recipe</span></summary>
          <div class="cook-details-body">
            ${ingredientGroups.map(group => `
              <section class="recipe-detail-block">
                <h3>${escapeHtml(group.label)}</h3>
                <ul>${group.ingredients.map(ingredientLineMarkup).join("")}</ul>
              </section>
            `).join("")}
            <section class="recipe-detail-block">
              <h3>Steps</h3>
              <ol class="steps">${recipe.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
            </section>
            ${(batch.notes || []).length || recipe.notes.length ? `
              <section class="recipe-detail-block">
                <h3>Notes</h3>
                <ul>${[...(batch.notes || []), ...recipe.notes].map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
              </section>
            ` : ""}
          </div>
        </details>
      </article>
    `;
}

function renderFilterChips(containerId, values, activeFilter, action) {
  const container = document.getElementById(containerId);
  if (!container.children.length) container.innerHTML = values.map(value => `
    <button class="filter-chip ${activeFilter === value ? "active" : ""}" type="button" data-action="${escapeHtml(action)}" data-filter="${escapeHtml(value)}" aria-pressed="${activeFilter === value}">
      ${escapeHtml(value === "all" ? "All" : value)}
    </button>
  `).join("");
  for (const button of container.children) {
    const selected = button.dataset.filter === activeFilter;
    if (button.getAttribute("aria-pressed") === String(selected)) continue;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected);
  }
}

function renderRecipes() {
  renderFilterChips("recipeFilters", RECIPE_GROUPS, activeRecipeFilter, "filter-recipes");
  renderFilterChips("recipeStyleFilters", RECIPE_STYLES, activeRecipeStyleFilter, "filter-recipe-style");
  const query = document.getElementById("recipeSearch").value;
  const filtered = filterRecipes(query, activeRecipeFilter, activeRecipeStyleFilter);
  renderRecipeCards("recipeList", filtered, "recipes", "recipeSearch");
}

function saveWeightEntry() {
  const input = document.getElementById("weightInput");
  const message = document.getElementById("weightMessage");
  const value = Number(input.value);

  if (!value || value < 30 || value > 250) {
    input.setAttribute("aria-invalid", "true");
    message.textContent = "Enter a sensible weight in kg.";
    return;
  }

  weightEntries.push({ date: new Date().toISOString(), weight: Math.round(value * 10) / 10 });
  setStoredJson(STORAGE_KEYS.weightEntries, weightEntries);
  input.value = "";
  renderWeightCheckIn();
}

function renderWeightCheckIn() {
  const entries = weightEntries;
  const last = entries[entries.length - 1];
  const previous = entries[entries.length - 2];
  let summary = "No weight recorded yet.";

  if (last && previous) {
    const change = Math.round((last.weight - previous.weight) * 10) / 10;
    summary = `Last: ${last.weight} kg · Previous change: ${change > 0 ? "+" : ""}${change} kg`;
  } else if (last) {
    summary = `Last: ${last.weight} kg`;
  }

  document.getElementById("weightCheckIn").innerHTML = `
    <div class="card weight-card">
      <h2>Weight check-in</h2>
      <p class="meta">Optional, private and saved only on this device.</p>
      <div class="weight-row">
        <label for="weightInput">Weight (kg)</label>
        <input id="weightInput" type="number" inputmode="decimal" step="0.1" min="30" max="250" aria-describedby="weightMessage">
        <button id="saveWeightBtn" class="secondary" type="button">Save</button>
      </div>
      <p class="meta">${escapeHtml(summary)}</p>
      <p id="weightMessage" class="meta" aria-live="polite"></p>
    </div>
  `;
  document.getElementById("saveWeightBtn").addEventListener("click", saveWeightEntry);
}

function renderWeek(updatePicker = false) {
  renderPlan();
  renderShoppingList();
  renderCook();
  if (updatePicker) {
    const cards = recipeCardsByList.get("planRecipeList");
    for (const [id, row] of cards ?? []) {
      if (row.classList.contains("selected-recipe") !== Boolean(getSelection(id))) updatePickerRecipe(id);
    }
    renderPlanRecipeBrowser();
  }
}

function refreshWeeklyRecipe(recipeId) {
  renderPlan(recipeId);
  renderShoppingList();
  renderCook(recipeId);
}

function markIngredientAtHome(ingredientId) {
  if (!atHome.ingredientIds.includes(ingredientId)) atHome.ingredientIds.push(ingredientId);
  if (currentWeek.boughtIngredientIds.includes(ingredientId)) {
    currentWeek.boughtIngredientIds = currentWeek.boughtIngredientIds.filter(id => id !== ingredientId);
    weekSaveDependsOnAtHome = true;
    queueStoredJson(STORAGE_KEYS.currentWeek, currentWeek, true);
  }
  saveAtHome();
  renderShoppingList(null, ingredientId);
}

function removeIngredientAtHome(ingredientId) {
  atHome.ingredientIds = atHome.ingredientIds.filter(id => id !== ingredientId);
  saveAtHome();
  renderShoppingList(null, ingredientId);
}

function setupEvents() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  document.getElementById("newWeekBtn").addEventListener("click", startNewWeek);
  document.getElementById("planRecipeSearch").addEventListener("input", renderPlanRecipeBrowser);
  document.getElementById("recipeSearch").addEventListener("input", renderRecipes);
  document.getElementById("copyShoppingBtn").addEventListener("click", copyShoppingList);

  document.getElementById("resetShoppingBtn").addEventListener("click", () => {
    currentWeek.boughtIngredientIds = [];
    saveCurrentWeek();
    renderShoppingList();
  });

  document.getElementById("hideBoughtToggle").addEventListener("change", event => {
    hideBought = event.target.checked;
    setStoredJson(STORAGE_KEYS.hideBought, hideBought);
    renderShoppingList();
  });

  document.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const recipeId = button.dataset.recipeId;
    const ingredientId = button.dataset.ingredientId;

    if (action === "add-recipe") {
      const card = button.closest("[data-recipe-card]");
      const selectedBatch = card?.querySelector(".add-batch-option:checked")?.value;
      addRecipeToWeek(recipeId, selectedBatch);
    } else if (action === "remove-recipe") {
      removeRecipeFromWeek(recipeId);
    } else if (action === "mark-home") {
      markIngredientAtHome(ingredientId);
    } else if (action === "remove-home") {
      removeIngredientAtHome(ingredientId);
    } else if (action === "view-plan") {
      setActiveTab("plan");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (action === "mark-one-cooked") {
      changeCookedCount(recipeId, 1);
    } else if (action === "undo-cooked") {
      changeCookedCount(recipeId, -1);
    } else if (action === "filter-recipes") {
      activeRecipeFilter = button.dataset.filter;
      renderRecipes();
    } else if (action === "filter-recipe-style") {
      activeRecipeStyleFilter = button.dataset.filter;
      renderRecipes();
    } else if (action === "filter-plan-recipes") {
      activePlanFilter = button.dataset.filter;
      renderPlanRecipeBrowser();
    } else if (action === "filter-plan-style") {
      activePlanStyleFilter = button.dataset.filter;
      renderPlanRecipeBrowser();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.matches(".plan-batch-option")) {
      changeRecipeBatch(event.target.dataset.recipeId, event.target.value);
    } else if (event.target.matches(".repeat-count-option")) {
      changeRecipeRepeatCount(event.target.dataset.recipeId, event.target.value);
    } else if (event.target.matches(".choice-select")) {
      const selection = getSelection(event.target.dataset.recipeId);
      if (!selection) return;
      if (event.target.value) selection.choiceSelections[event.target.dataset.choiceId] = event.target.value;
      else delete selection.choiceSelections[event.target.dataset.choiceId];
      saveCurrentWeek();
      refreshWeeklyRecipe(selection.recipeId);
    } else if (event.target.matches(".bought-check")) {
      const ingredientId = event.target.dataset.ingredientId;
      const bought = new Set(currentWeek.boughtIngredientIds);
      if (event.target.checked) bought.add(ingredientId);
      else bought.delete(ingredientId);
      currentWeek.boughtIngredientIds = [...bought];
      saveCurrentWeek();
      renderShoppingList(event.target);
    } else if (event.target.matches(".cooked-check")) {
      const selection = getSelection(event.target.dataset.recipeId);
      if (!selection) return;
      selection.cookedCount = event.target.checked ? 1 : 0;
      saveCurrentWeek();
      renderCook();
    }
  });
}

async function init() {
  [recipes, ingredients] = await Promise.all([
    loadJson(DATA_PATHS.recipes),
    loadJson(DATA_PATHS.ingredients)
  ]);

  recipesById = Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]));
  ingredientsById = Object.fromEntries(ingredients.map(ingredient => [ingredient.id, ingredient]));
  const savedWeek = readStoredValue(STORAGE_KEYS.currentWeek, null, value =>
    [2, 3].includes(value?.version) && Array.isArray(value.selections) &&
    value.selections.every(selection => typeof selection?.recipeId === "string" &&
      (selection.choiceSelections === undefined ||
        (selection.choiceSelections !== null && typeof selection.choiceSelections === "object" &&
          !Array.isArray(selection.choiceSelections)))) &&
    (value.boughtIngredientIds === undefined || isStringList(value.boughtIngredientIds)));
  currentWeek = normaliseCurrentWeek(savedWeek);
  atHome = normaliseAtHome(readStoredValue(STORAGE_KEYS.atHome, null, value =>
    isStringList(value?.ingredientIds)));
  weightEntries = readStoredValue(STORAGE_KEYS.weightEntries, [], value =>
    Array.isArray(value) && value.every(entry => Number.isFinite(entry?.weight)));
  hideBought = readStoredValue(STORAGE_KEYS.hideBought, false, value =>
    value === true || value === false);
  document.getElementById("hideBoughtToggle").checked = hideBought;

  // At-home state takes precedence if it was saved before a weekly write failed.
  const boughtIds = currentWeek.boughtIngredientIds.filter(id => !atHome.ingredientIds.includes(id));
  const needsBoughtRepair = boughtIds.length !== currentWeek.boughtIngredientIds.length;
  currentWeek.boughtIngredientIds = boughtIds;
  if (savedWeek?.version === 2 || needsBoughtRepair) saveCurrentWeek(false);
  else updateStorageStatus();

  setupEvents();
  renderWeek(true);
  renderRecipes();
  renderWeightCheckIn();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init().catch(error => {
  document.body.innerHTML = `<main class="app-shell"><div class="card"><h1>Could not load app</h1><p>${escapeHtml(error.message)}</p></div></main>`;
});
