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

let recipes = [];
let ingredients = [];
let recipesById = {};
let ingredientsById = {};
let currentWeek = null;
let atHome = null;
let activeRecipeFilter = "all";

function loadJson(path) {
  return fetch(path).then(response => {
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  });
}

function getStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function setStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createEmptyWeek() {
  return {
    version: 2,
    createdAt: new Date().toISOString(),
    selections: [],
    boughtIngredientIds: []
  };
}

function getBatch(recipe, batchId) {
  return recipe?.batchOptions.find(batch => batch.id === batchId) || recipe?.batchOptions[0] || null;
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
  if (!value || value.version !== 2 || !Array.isArray(value.selections)) {
    return createEmptyWeek();
  }

  const seenRecipes = new Set();
  const selections = [];

  value.selections.forEach(selection => {
    const recipe = recipesById[selection?.recipeId];
    if (!recipe || seenRecipes.has(recipe.id)) return;

    const batch = getBatch(recipe, selection.batchId);
    if (!batch) return;

    seenRecipes.add(recipe.id);
    selections.push({
      recipeId: recipe.id,
      batchId: batch.id,
      cooked: Boolean(selection.cooked),
      choiceSelections: normaliseChoiceSelections(batch, selection.choiceSelections)
    });
  });

  return {
    version: 2,
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

function saveCurrentWeek() {
  setStoredJson(STORAGE_KEYS.currentWeek, currentWeek);
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
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  document.querySelectorAll(".panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `${tabName}Panel`);
  });
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
      cooked: false,
      choiceSelections: normaliseChoiceSelections(batch)
    });
  }

  saveCurrentWeek();
  renderAll();
}

function changeRecipeBatch(recipeId, batchId) {
  const selection = getSelection(recipeId);
  const recipe = recipesById[recipeId];
  const batch = getBatch(recipe, batchId);
  if (!selection || !batch) return;

  selection.batchId = batch.id;
  selection.choiceSelections = normaliseChoiceSelections(batch, selection.choiceSelections);
  saveCurrentWeek();
  renderAll();
}

function removeRecipeFromWeek(recipeId) {
  currentWeek.selections = currentWeek.selections.filter(selection => selection.recipeId !== recipeId);
  saveCurrentWeek();
  renderAll();
}

function startNewWeek() {
  const hasState = currentWeek.selections.length > 0 || currentWeek.boughtIngredientIds.length > 0;
  if (hasState && !window.confirm("Start a new week? This clears the current plan, cooked ticks and bought ticks.")) {
    return;
  }

  currentWeek = createEmptyWeek();
  saveCurrentWeek();
  renderAll();
}

function batchSelectMarkup(recipe, selectedBatchId, className, labelText = "Choose batch size") {
  const options = recipe.batchOptions.map(batch => `
    <option value="${escapeHtml(batch.id)}" ${batch.id === selectedBatchId ? "selected" : ""}>
      ${escapeHtml(batch.label)} — ${escapeHtml(formatYield(batch))}
    </option>
  `).join("");

  return `
    <label class="field-label">
      <span>${escapeHtml(labelText)}</span>
      <select class="${className}" data-recipe-id="${escapeHtml(recipe.id)}">${options}</select>
    </label>
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

function renderPlan() {
  const summary = document.getElementById("planSummary");
  const weekList = document.getElementById("weekList");

  if (!currentWeek.selections.length) {
    summary.textContent = "No recipes selected yet.";
    weekList.innerHTML = `<div class="card empty">Add recipes below to build this week.</div>`;
  } else {
    const totals = currentWeek.selections.reduce((result, selection) => {
      const { batch } = getSelectedRecipeData(selection);
      result.min += batch.yield.min;
      result.max += batch.yield.max;
      return result;
    }, { min: 0, max: 0 });
    const portions = totals.min === totals.max ? totals.min : `${totals.min}–${totals.max}`;
    summary.textContent = `${currentWeek.selections.length} recipe${currentWeek.selections.length === 1 ? "" : "s"} · about ${portions} portions`;

    weekList.innerHTML = currentWeek.selections.map(selection => {
      const { recipe, batch } = getSelectedRecipeData(selection);
      return `
        <article class="card plan-item">
          <div class="section-heading">
            <div>
              <h3>${escapeHtml(recipe.title)}</h3>
              <p class="meta">${escapeHtml(recipe.group)} · ${escapeHtml(batch.label)} · ${escapeHtml(formatYield(batch))}</p>
            </div>
            <button class="ghost small" type="button" data-action="remove-recipe" data-recipe-id="${escapeHtml(recipe.id)}">Remove</button>
          </div>
          ${recipe.batchOptions.length > 1
            ? batchSelectMarkup(recipe, batch.id, "plan-batch-select", "Change batch")
            : `<p class="batch-label"><strong>${escapeHtml(batch.label)}</strong> · ${escapeHtml(formatYield(batch))}</p>`}
          ${choiceControlsMarkup(selection, batch)}
          ${storageMarkup(batch)}
        </article>
      `;
    }).join("");
  }

  renderPlanRecipeBrowser();
}

function recipeSearchBlob(recipe) {
  const ingredientNames = recipe.batchOptions.flatMap(batch => [
    ...batch.ingredients,
    ...batch.choices.flatMap(choice => choice.options.flatMap(option => option.ingredients))
  ]).map(reference => ingredientsById[reference.ingredientId]?.name || reference.ingredientId);

  return [recipe.title, recipe.group, ...(recipe.tags || []), ...ingredientNames].join(" ").toLowerCase();
}

function matchesSearch(recipe, query) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const searchable = recipeSearchBlob(recipe);
  return tokens.every(token => searchable.includes(token));
}

function addRecipeCardMarkup(recipe, source) {
  const selection = getSelection(recipe.id);
  const defaultBatch = recipe.batchOptions[0];
  const control = selection
    ? `<button class="secondary in-plan-button" type="button" data-action="view-plan">In this week's plan</button>`
    : `
      ${recipe.batchOptions.length > 1 ? batchSelectMarkup(recipe, defaultBatch.id, "add-batch-select") : ""}
      <button type="button" data-action="add-recipe" data-recipe-id="${escapeHtml(recipe.id)}" data-source="${escapeHtml(source)}">
        Add to week${recipe.batchOptions.length === 1 ? ` · ${escapeHtml(defaultBatch.label)}` : ""}
      </button>
    `;

  return `
    <article class="card recipe-card" data-recipe-card="${escapeHtml(recipe.id)}">
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(recipe.title)}</h3>
          <p class="meta">${escapeHtml(recipe.group)} · ${recipe.batchOptions.length} batch option${recipe.batchOptions.length === 1 ? "" : "s"}</p>
        </div>
        ${recipe.trial ? `<span class="tag trial-tag">Trial</span>` : ""}
      </div>
      <div class="tags">${recipe.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="recipe-action">${control}</div>
      ${recipeDetailsMarkup(recipe)}
    </article>
  `;
}

function renderPlanRecipeBrowser() {
  const query = document.getElementById("planRecipeSearch").value;
  const group = document.getElementById("planGroupFilter").value;
  const filtered = recipes.filter(recipe =>
    matchesSearch(recipe, query) && (group === "all" || recipe.group === group)
  );

  document.getElementById("planRecipeList").innerHTML = filtered
    .map(recipe => addRecipeCardMarkup(recipe, "plan"))
    .join("") || `<div class="card empty">No recipes found.</div>`;
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
          entry[amountKey] += reference.amount;
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

function shoppingRequirementMarkup(entry) {
  const unit = entry.ingredient.aggregation.unit;
  const required = entry.requiredAmount > 0
    ? `${formatAmount(entry.requiredAmount, unit)} required`
    : entry.requiredPresence ? "Required" : "";
  const optional = entry.optionalAmount > 0
    ? `${formatAmount(entry.optionalAmount, unit)} optional`
    : entry.optionalPresence ? "Optional" : "";
  const optionalSources = [...entry.optionalSources];

  return `
    ${required ? `<span>${escapeHtml(required)}</span>` : ""}
    ${optional && !required ? `<span>${escapeHtml(optional)}</span>` : ""}
    ${optionalSources.length ? `<small class="meta">Optional for ${escapeHtml(optionalSources.join(", "))}</small>` : ""}
  `;
}

function shoppingEntryMarkup(entry, section) {
  const ingredientId = entry.ingredient.id;
  const bought = currentWeek.boughtIngredientIds.includes(ingredientId);
  const amountForPack = entryHasRequired(entry) ? entry.requiredAmount : entry.optionalAmount;
  const pack = packRecommendation(entry, amountForPack);
  const sourceSet = new Set([...entry.requiredSources, ...entry.optionalSources]);

  return `
    <div class="shopping-item ${section === "home" ? "home-item" : ""} ${bought ? "done" : ""}">
      ${section === "home" ? "" : `<input class="checkbox bought-check" type="checkbox" data-ingredient-id="${escapeHtml(ingredientId)}" ${bought ? "checked" : ""} aria-label="Mark ${escapeHtml(entry.ingredient.name)} as bought">`}
      <div class="shopping-item-copy">
        <strong>${escapeHtml(entry.ingredient.name)}</strong>
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
      ${items.length ? orderedCategoryEntries(groups).map(([category, categoryItems]) => `
        <section class="card shopping-category">
          <h3 class="category-title">${escapeHtml(category)}</h3>
          ${categoryItems.map(item => shoppingEntryMarkup(item, section)).join("")}
        </section>
      `).join("") : `<div class="card empty">${escapeHtml(emptyText)}</div>`}
    </section>
  `;
}

function renderShoppingList() {
  const allEntries = collectShoppingEntries();
  const atHomeIds = new Set(atHome.ingredientIds);
  const boughtIds = new Set(currentWeek.boughtIngredientIds);
  const hideBought = localStorage.getItem(STORAGE_KEYS.hideBought) === "true";

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

  document.getElementById("shoppingList").innerHTML = currentWeek.selections.length
    ? [
        shoppingSectionMarkup("To buy", toBuy, "buy", hideBought && toBuyAll.length ? "All required items are bought." : "Nothing required to buy."),
        shoppingSectionMarkup("At home", atHomeItems, "home", "No required items are marked At home."),
        shoppingSectionMarkup("Optional", optional, "optional", hideBought && optionalAll.length ? "All optional items are bought." : "No optional items this week.")
      ].join("")
    : `<div class="card empty">Add recipes in Plan to build the shopping list.</div>`;
}

function shoppingTextLine(entry) {
  const container = document.createElement("div");
  container.innerHTML = shoppingRequirementMarkup(entry);
  const requirement = container.textContent.trim();
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

function renderCook() {
  const cookedCount = currentWeek.selections.filter(selection => selection.cooked).length;
  document.getElementById("cookSummary").textContent = currentWeek.selections.length
    ? `${cookedCount} of ${currentWeek.selections.length} cooking occasion${currentWeek.selections.length === 1 ? "" : "s"} completed.`
    : "Only recipes in this week's plan appear here.";

  document.getElementById("cookList").innerHTML = currentWeek.selections.length
    ? currentWeek.selections.map(selection => {
        const { recipe, batch } = getSelectedRecipeData(selection);
        const ingredientGroups = getBatchIngredientGroups(selection);
        return `
          <article class="card cook-card ${selection.cooked ? "cooked" : ""}">
            <div class="section-heading">
              <div>
                <h2>${escapeHtml(recipe.title)}</h2>
                <p class="meta">${escapeHtml(batch.label)} · ${escapeHtml(formatYield(batch))}</p>
              </div>
              <label class="cook-toggle">
                <input class="checkbox cooked-check" type="checkbox" data-recipe-id="${escapeHtml(recipe.id)}" ${selection.cooked ? "checked" : ""}>
                <span>${selection.cooked ? "Cooked" : "Mark cooked"}</span>
              </label>
            </div>
            ${storageMarkup(batch)}
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
          </article>
        `;
      }).join("")
    : `<div class="card empty">Add recipes in Plan before you start cooking.</div>`;
}

function renderRecipeFilters() {
  const groups = ["all", ...new Set(recipes.map(recipe => recipe.group))];
  document.getElementById("recipeFilters").innerHTML = groups.map(group => `
    <button class="filter-chip ${activeRecipeFilter === group ? "active" : ""}" type="button" data-action="filter-recipes" data-filter="${escapeHtml(group)}">
      ${escapeHtml(group === "all" ? "All" : group)}
    </button>
  `).join("");
}

function renderRecipes() {
  renderRecipeFilters();
  const query = document.getElementById("recipeSearch").value;
  const filtered = recipes.filter(recipe =>
    matchesSearch(recipe, query) && (activeRecipeFilter === "all" || recipe.group === activeRecipeFilter)
  );

  document.getElementById("recipeList").innerHTML = filtered
    .map(recipe => addRecipeCardMarkup(recipe, "recipes"))
    .join("") || `<div class="card empty">No recipes found.</div>`;
}

function getWeightEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.weightEntries)) || [];
  } catch {
    return [];
  }
}

function saveWeightEntry() {
  const input = document.getElementById("weightInput");
  const message = document.getElementById("weightMessage");
  const value = Number(input.value);

  if (!value || value < 30 || value > 250) {
    message.textContent = "Enter a sensible weight in kg.";
    return;
  }

  const entries = getWeightEntries();
  entries.push({ date: new Date().toISOString(), weight: Math.round(value * 10) / 10 });
  localStorage.setItem(STORAGE_KEYS.weightEntries, JSON.stringify(entries));
  input.value = "";
  renderWeightCheckIn();
}

function renderWeightCheckIn() {
  const entries = getWeightEntries();
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
        <input id="weightInput" type="number" inputmode="decimal" step="0.1" min="30" max="250" placeholder="kg">
        <button id="saveWeightBtn" class="secondary" type="button">Save</button>
      </div>
      <p class="meta">${escapeHtml(summary)}</p>
      <p id="weightMessage" class="meta" aria-live="polite"></p>
    </div>
  `;
  document.getElementById("saveWeightBtn").addEventListener("click", saveWeightEntry);
}

function renderAll() {
  renderPlan();
  renderShoppingList();
  renderCook();
  renderRecipes();
  renderWeightCheckIn();
}

function markIngredientAtHome(ingredientId) {
  if (!atHome.ingredientIds.includes(ingredientId)) atHome.ingredientIds.push(ingredientId);
  currentWeek.boughtIngredientIds = currentWeek.boughtIngredientIds.filter(id => id !== ingredientId);
  saveAtHome();
  saveCurrentWeek();
  renderShoppingList();
}

function removeIngredientAtHome(ingredientId) {
  atHome.ingredientIds = atHome.ingredientIds.filter(id => id !== ingredientId);
  saveAtHome();
  renderShoppingList();
}

function setupEvents() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  document.getElementById("newWeekBtn").addEventListener("click", startNewWeek);
  document.getElementById("planRecipeSearch").addEventListener("input", renderPlanRecipeBrowser);
  document.getElementById("planGroupFilter").addEventListener("change", renderPlanRecipeBrowser);
  document.getElementById("recipeSearch").addEventListener("input", renderRecipes);
  document.getElementById("copyShoppingBtn").addEventListener("click", copyShoppingList);

  document.getElementById("resetShoppingBtn").addEventListener("click", () => {
    currentWeek.boughtIngredientIds = [];
    saveCurrentWeek();
    renderShoppingList();
  });

  document.getElementById("hideBoughtToggle").addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.hideBought, event.target.checked ? "true" : "false");
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
      const selectedBatch = card?.querySelector(".add-batch-select")?.value;
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
    } else if (action === "filter-recipes") {
      activeRecipeFilter = button.dataset.filter;
      renderRecipes();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.matches(".plan-batch-select")) {
      changeRecipeBatch(event.target.dataset.recipeId, event.target.value);
    } else if (event.target.matches(".choice-select")) {
      const selection = getSelection(event.target.dataset.recipeId);
      if (!selection) return;
      if (event.target.value) selection.choiceSelections[event.target.dataset.choiceId] = event.target.value;
      else delete selection.choiceSelections[event.target.dataset.choiceId];
      saveCurrentWeek();
      renderAll();
    } else if (event.target.matches(".bought-check")) {
      const ingredientId = event.target.dataset.ingredientId;
      const bought = new Set(currentWeek.boughtIngredientIds);
      if (event.target.checked) bought.add(ingredientId);
      else bought.delete(ingredientId);
      currentWeek.boughtIngredientIds = [...bought];
      saveCurrentWeek();
      renderShoppingList();
    } else if (event.target.matches(".cooked-check")) {
      const selection = getSelection(event.target.dataset.recipeId);
      if (!selection) return;
      selection.cooked = event.target.checked;
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
  currentWeek = normaliseCurrentWeek(getStoredJson(STORAGE_KEYS.currentWeek, null));
  atHome = normaliseAtHome(getStoredJson(STORAGE_KEYS.atHome, null));
  saveCurrentWeek();
  saveAtHome();

  const groups = [...new Set(recipes.map(recipe => recipe.group))];
  document.getElementById("planGroupFilter").innerHTML = ["all", ...groups]
    .map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group === "all" ? "All groups" : group)}</option>`)
    .join("");
  document.getElementById("hideBoughtToggle").checked = localStorage.getItem(STORAGE_KEYS.hideBought) === "true";

  setupEvents();
  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init().catch(error => {
  document.body.innerHTML = `<main class="app-shell"><div class="card"><h1>Could not load app</h1><p>${escapeHtml(error.message)}</p></div></main>`;
});
