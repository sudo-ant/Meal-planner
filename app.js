const DATA_PATHS = {
  recipes: "data/recipes.json",
  plans: "data/plans.json"
};

const STORAGE_KEYS = {
  selectedPlan: "studentFoodPlanner.selectedPlan",
  mealTicks: "studentFoodPlanner.mealTicks",
  shoppingTicks: "studentFoodPlanner.shoppingTicks",
  hideBought: "studentFoodPlanner.hideBought",
  generatedPlan: "studentFoodPlanner.generatedPlan"
};

const CUPBOARD_CATEGORIES = [
  "Tinned goods",
  "Dry goods",
  "Condiments",
  "Seasoning",
  "Oil & cooking fats"
];

const CATEGORY_ORDER = [
  "Vegetables",
  "Fruit",
  "Meat",
  "Fish",
  "Dairy",
  "Eggs",
  "Frozen",
  "Cupboard",
  "Other"
];

let recipes = [];
let plans = [];
let selectedPlanId = null;
let activeRecipeFilter = "all";

const recipeById = () => Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]));

function loadJson(path) {
  return fetch(path).then(response => {
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  });
}

function getStoredObject(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function setStoredObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatQuantity(value) {
  if (value === undefined || value === null || value === "") return "";
  if (Number.isInteger(value)) return String(value);

  const whole = Math.trunc(value);
  const fraction = Math.round((value - whole) * 100) / 100;
  const fractionMap = {
    0.25: "¼",
    0.5: "½",
    0.75: "¾"
  };

  if (fractionMap[fraction]) {
    return whole === 0 ? fractionMap[fraction] : `${whole}${fractionMap[fraction]}`;
  }

  return String(value);
}

function displayCategory(category) {
  return CUPBOARD_CATEGORIES.includes(category) ? "Cupboard" : (category || "Other");
}

function shouldSkipIngredient(ingredient) {
  return (ingredient.item || "").toLowerCase() === "water";
}

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category || "Other");
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function shoppingItemKey(plan, item) {
  return `${plan.id}:${item.category}:${item.item}:${item.unit || item.detail || ""}`;
}

function normaliseItemKey(ingredient) {
  const category = displayCategory(ingredient.category);
  return `${ingredient.item.toLowerCase()}|${ingredient.unit || ""}|${category}`;
}

function canSum(ingredient) {
  const unit = (ingredient.unit || "").toLowerCase();
  return [
    "g", "kg", "ml", "l", "tsp", "tbsp", "mug", "mugs",
    "piece", "pieces", "clove", "cloves", "cube", "cubes",
    "tin", "tins", "fillet", "fillets", "portion", "portions",
    "400g tin"
  ].includes(unit) && typeof ingredient.quantity === "number";
}

function pluraliseUnit(unit, qty) {
  if (!unit) return "";
  if (qty === 1) return unit;
  const pluralMap = {
    "piece": "pieces",
    "clove": "cloves",
    "cube": "cubes",
    "tin": "tins",
    "fillet": "fillets",
    "portion": "portions",
    "mug": "mugs"
  };
  return pluralMap[unit] || unit;
}

function displayIngredientLine(entry) {
  if (entry.mode === "count") {
    return `${entry.item}: ${entry.count} x ${entry.detail}`;
  }

  const unit = pluraliseUnit(entry.unit, entry.quantity);
  const qty = formatQuantity(entry.quantity);
  const optional = entry.optional ? " (optional)" : "";
  return `${entry.item}: ${qty}${unit ? " " + unit : ""}${optional}`;
}

function buildShoppingList(plan) {
  const map = new Map();
  const lookup = recipeById();

  plan.days.forEach(day => {
    const recipe = lookup[day.meal];
    if (!recipe) return;

    recipe.ingredients.forEach(ingredient => {
      if (shouldSkipIngredient(ingredient)) return;
      const key = normaliseItemKey(ingredient);
      const category = displayCategory(ingredient.category);

      if (canSum(ingredient)) {
        if (!map.has(key)) {
          map.set(key, {
            mode: "sum",
            item: ingredient.item,
            category,
            unit: ingredient.unit || "",
            quantity: 0,
            optional: Boolean(ingredient.optional),
            sources: []
          });
        }
        const entry = map.get(key);
        entry.quantity += ingredient.quantity;
        entry.optional = entry.optional && Boolean(ingredient.optional);
        entry.sources.push(recipe.title);
      } else {
        const countKey = `${ingredient.item.toLowerCase()}|count|${category}`;
        if (!map.has(countKey)) {
          map.set(countKey, {
            mode: "count",
            item: ingredient.item,
            category,
            count: 0,
            detail: `${formatQuantity(ingredient.quantity)} ${ingredient.unit || ""}`.trim(),
            sources: []
          });
        }
        const entry = map.get(countKey);
        entry.count += 1;
        entry.sources.push(recipe.title);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const cat = categoryRank(a.category) - categoryRank(b.category);
    if (cat !== 0) return cat;
    return a.item.localeCompare(b.item);
  });
}

function groupByCategory(items) {
  return items.reduce((groups, item) => {
    const category = item.category || "Other";
    if (!groups[category]) groups[category] = [];
    groups[category].push(item);
    return groups;
  }, {});
}

function orderedCategoryEntries(groups) {
  return Object.entries(groups).sort(([a], [b]) => {
    const cat = categoryRank(a) - categoryRank(b);
    if (cat !== 0) return cat;
    return a.localeCompare(b);
  });
}

function getGeneratedPlan() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.generatedPlan));
  } catch {
    return null;
  }
}

function getAllPlans() {
  const generated = getGeneratedPlan();
  return generated ? [generated, ...plans] : plans;
}

function getSelectedPlan() {
  return getAllPlans().find(plan => plan.id === selectedPlanId) || getAllPlans()[0];
}

function setActiveTab(tabName) {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.tab === tabName);
  });
  document.querySelectorAll(".panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `${tabName}Panel`);
  });
}

function renderPlanSelect() {
  const select = document.getElementById("planSelect");
  select.innerHTML = getAllPlans().map(plan => {
    const label = `${plan.title} (${plan.days.length}-day)`;
    return `<option value="${plan.id}">${label}</option>`;
  }).join("");
  select.value = selectedPlanId;
}

function renderPlan() {
  const plan = getSelectedPlan();
  const lookup = recipeById();
  const mealTicks = getStoredObject(STORAGE_KEYS.mealTicks);
  const summary = document.getElementById("planSummary");
  const list = document.getElementById("mealList");

  if (!plan) {
    summary.innerHTML = `<div class="card empty">No plan selected.</div>`;
    list.innerHTML = "";
    return;
  }

  const mealKeys = plan.days.map(day => `${plan.id}:${day.day}:${day.meal}`);
  const completedCount = mealKeys.filter(key => mealTicks[key]).length;
  const progressPercent = plan.days.length ? Math.round((completedCount / plan.days.length) * 100) : 0;
  const nextUntickedIndex = plan.days.findIndex(day => !mealTicks[`${plan.id}:${day.day}:${day.meal}`]);

  const fillers = plan.fillers?.length
    ? `<h3>Fillers</h3><ul class="filler-list">${plan.fillers.map(filler => `<li>${filler}</li>`).join("")}</ul>`
    : "";

  summary.innerHTML = `
    <div class="card">
      <h2>${plan.title}</h2>
      <span class="plan-kind">${plan.days.length}-day plan</span>
      <p>${plan.days.length} planned food pack days.</p>
      <div class="progress-wrap" aria-label="Meal progress">
        <div class="progress-text">Food pack progress: ${completedCount} / ${plan.days.length} food packs (${progressPercent}%)</div>
        <div class="progress-track"><div class="progress-fill" style="width:${progressPercent}%"></div></div>
      </div>
      ${nextUntickedIndex >= 0 ? `<p class="next-meal-note">Next food pack: ${lookup[plan.days[nextUntickedIndex].meal]?.title || plan.days[nextUntickedIndex].meal}</p>` : `<p class="next-meal-note">All planned food packs ticked off.</p>`}
      ${plan.notes ? `<p class="meta">${plan.notes}</p>` : ""}
      ${fillers}
    </div>
  `;

  list.innerHTML = plan.days.map((day, index) => {
    const recipe = lookup[day.meal];
    if (!recipe) {
      return `<div class="card">Missing recipe: ${day.meal}</div>`;
    }

    const tickKey = `${plan.id}:${day.day}:${recipe.id}`;
    const checked = mealTicks[tickKey] ? "checked" : "";
    const nextClass = index === nextUntickedIndex ? " next-meal" : "";
    const tags = recipe.tags?.slice(0, 5).map(tag => `<span class="tag">${tag}</span>`).join("") || "";

    return `
      <article class="card meal-card${nextClass}">
        <input class="checkbox meal-check" type="checkbox" ${checked} data-key="${tickKey}" aria-label="Mark ${recipe.title} as prepared">
        <div>
          <p class="meta">${day.day}</p>
          <h3 class="meal-title">${recipe.title}</h3>
          <p class="meta">${recipe.servings || 1} portion${recipe.servings === 1 ? "" : "s"} · ${recipe.group || "Recipe"}</p>
          <p class="pack-note">${recipe.servings >= 2 ? "Prepare the evening before. Pack lunch + dinner." : "Single portion. Add a filler or side if needed."}</p>
          <div class="tags">${tags}</div>
          <ol class="steps">
            ${recipe.steps.map(step => `<li>${step}</li>`).join("")}
          </ol>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".meal-check").forEach(input => {
    input.addEventListener("change", event => {
      const ticks = getStoredObject(STORAGE_KEYS.mealTicks);
      ticks[event.target.dataset.key] = event.target.checked;
      setStoredObject(STORAGE_KEYS.mealTicks, ticks);
      renderPlan();
    });
  });
}

function renderShoppingList() {
  const plan = getSelectedPlan();
  const shoppingTicks = getStoredObject(STORAGE_KEYS.shoppingTicks);
  const hideBought = localStorage.getItem(STORAGE_KEYS.hideBought) === "true";
  const container = document.getElementById("shoppingList");

  if (!plan) {
    container.innerHTML = `<div class="card empty">Choose a plan first.</div>`;
    return;
  }

  const allItems = buildShoppingList(plan);
  const visibleItems = hideBought
    ? allItems.filter(item => !shoppingTicks[shoppingItemKey(plan, item)])
    : allItems;
  const groups = groupByCategory(visibleItems);

  const totalCount = allItems.length;
  const boughtCount = allItems.filter(item => shoppingTicks[shoppingItemKey(plan, item)]).length;
  const status = document.getElementById("shoppingStatus");
  if (status) status.textContent = `Bought: ${boughtCount} / ${totalCount}`;

  container.innerHTML = orderedCategoryEntries(groups).map(([category, groupItems]) => `
    <section class="card">
      <h3 class="category-title">${category}</h3>
      ${groupItems.map(item => {
        const key = shoppingItemKey(plan, item);
        const checked = shoppingTicks[key] ? "checked" : "";
        const doneClass = shoppingTicks[key] ? "done" : "";
        const sources = [...new Set(item.sources)].slice(0, 3).join(", ");
        return `
          <label class="shopping-item ${doneClass}">
            <input class="checkbox shopping-check" type="checkbox" ${checked} data-key="${key}">
            <span>
              <strong>${displayIngredientLine(item)}</strong>
              <br><small class="meta">Used in: ${sources}${item.sources.length > 3 ? "..." : ""}</small>
            </span>
          </label>
        `;
      }).join("")}
    </section>
  `).join("") || `<div class="card empty">All shopping items are ticked off.</div>`;

  document.querySelectorAll(".shopping-check").forEach(input => {
    input.addEventListener("change", event => {
      const ticks = getStoredObject(STORAGE_KEYS.shoppingTicks);
      ticks[event.target.dataset.key] = event.target.checked;
      setStoredObject(STORAGE_KEYS.shoppingTicks, ticks);
      renderShoppingList();
    });
  });
}

function buildShoppingListText() {
  const plan = getSelectedPlan();
  if (!plan) return "";

  const items = buildShoppingList(plan);
  const groups = groupByCategory(items);
  const lines = [plan.title.toUpperCase(), ""];

  orderedCategoryEntries(groups).forEach(([category, groupItems]) => {
    lines.push(category.toUpperCase());
    groupItems.forEach(item => lines.push(`- ${displayIngredientLine(item)}`));
    lines.push("");
  });

  return lines.join("\n").trim();
}

async function copyShoppingList() {
  const text = buildShoppingListText();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    showCopyStatus("Copied");
  } catch {
    showCopyStatus("Copy failed");
  }
}

function showCopyStatus(message) {
  const status = document.getElementById("copyStatus");
  if (!status) return;
  status.textContent = message;
  window.setTimeout(() => { status.textContent = ""; }, 1800);
}


const RECIPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "light", label: "Light" },
  { key: "chicken", label: "Chicken" },
  { key: "turkey", label: "Turkey" },
  { key: "fish", label: "Fish" },
  { key: "egg", label: "Eggs" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "no-cook", label: "No-cook" },
  { key: "quick", label: "Quick" }
];

function recipeMatchesFilter(recipe, filterKey) {
  if (filterKey === "all") return true;

  const searchable = [
    recipe.title,
    recipe.group,
    ...(recipe.tags || [])
  ].join(" ").toLowerCase();

  if (filterKey === "fish") {
    return searchable.includes("fish") || searchable.includes("tuna") || searchable.includes("salmon") || searchable.includes("sardine");
  }

  if (filterKey === "egg") {
    return searchable.includes("egg");
  }

  return searchable.includes(filterKey);
}

function renderRecipeFilters() {
  const container = document.getElementById("recipeFilters");
  if (!container) return;

  container.innerHTML = RECIPE_FILTERS.map(filter => `
    <button class="filter-chip ${activeRecipeFilter === filter.key ? "active" : ""}" data-filter="${filter.key}">
      ${filter.label}
    </button>
  `).join("");

  container.querySelectorAll(".filter-chip").forEach(button => {
    button.addEventListener("click", () => {
      activeRecipeFilter = button.dataset.filter;
      renderRecipes();
    });
  });
}

function renderRecipes() {
  renderRecipeFilters();

  const query = document.getElementById("recipeSearch").value.trim().toLowerCase();
  const filtered = recipes.filter(recipe => {
    const blob = [
      recipe.title,
      recipe.group,
      ...(recipe.tags || []),
      ...(recipe.ingredients || []).map(i => i.item)
    ].join(" ").toLowerCase();

    return blob.includes(query) && recipeMatchesFilter(recipe, activeRecipeFilter);
  });

  const container = document.getElementById("recipeList");

  container.innerHTML = filtered.map(recipe => {
    const usedIn = typeof findPlansUsingRecipe === "function" ? findPlansUsingRecipe(recipe.id) : [];
    return `
      <article class="card recipe-card">
        <h3>${recipe.title}</h3>
        <p>${recipe.servings || 1} portion${recipe.servings === 1 ? "" : "s"} · ${recipe.group || "Recipe"}</p>
        <p class="pack-note">${recipe.servings >= 2 ? "Good food pack option: lunch + dinner." : "Single portion: useful for light meals, fillers, or flexible days."}</p>
        ${usedIn.length ? `<p class="meta">Used in: ${usedIn.slice(0, 3).join(", ")}${usedIn.length > 3 ? "..." : ""}</p>` : ""}
        <div class="tags">${(recipe.tags || []).slice(0, 6).map(tag => `<span class="tag">${tag}</span>`).join("")}</div>

        <details class="recipe-details">
          <summary>Ingredients</summary>
          <ul>
            ${recipe.ingredients
              .filter(ingredient => typeof shouldSkipIngredient === "function" ? !shouldSkipIngredient(ingredient) : true)
              .map(ingredient => `
                <li>${formatQuantity(ingredient.quantity)} ${ingredient.unit || ""} ${ingredient.item}${ingredient.optional ? " (optional)" : ""}</li>
              `).join("")}
          </ul>
        </details>

        <details class="recipe-details">
          <summary>Steps</summary>
          <ol class="steps">
            ${recipe.steps.map(step => `<li>${step}</li>`).join("")}
          </ol>
        </details>
      </article>
    `;
  }).join("") || `<div class="card empty">No recipes found.</div>`;
}

function renderAll() {
  renderPlanSelect();
  renderPlan();
  renderShoppingList();
  renderRecipes();
}

async function init() {
  [recipes, plans] = await Promise.all([
    loadJson(DATA_PATHS.recipes),
    loadJson(DATA_PATHS.plans)
  ]);

  selectedPlanId = localStorage.getItem(STORAGE_KEYS.selectedPlan) || getAllPlans()[0]?.id || null;

  document.getElementById("planSelect").addEventListener("change", event => {
    selectedPlanId = event.target.value;
    localStorage.setItem(STORAGE_KEYS.selectedPlan, selectedPlanId);
    renderPlan();
    renderShoppingList();
  });

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  document.getElementById("resetProgressBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.mealTicks);
    renderPlan();
  });

  document.getElementById("resetShoppingBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.shoppingTicks);
    renderShoppingList();
  });

  document.getElementById("hideBoughtToggle").addEventListener("change", event => {
    localStorage.setItem(STORAGE_KEYS.hideBought, event.target.checked ? "true" : "false");
    renderShoppingList();
  });

  document.getElementById("copyShoppingBtn").addEventListener("click", copyShoppingList);

  document.getElementById("clearPlanBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.selectedPlan);
    localStorage.removeItem(STORAGE_KEYS.mealTicks);
    localStorage.removeItem(STORAGE_KEYS.shoppingTicks);
    selectedPlanId = getAllPlans()[0]?.id || null;
    renderAll();
  });

  document.getElementById("recipeSearch").addEventListener("input", renderRecipes);
  document.getElementById("generatePlanBtn").addEventListener("click", generateQuickPlan);
  document.getElementById("useGeneratedPlanBtn").addEventListener("click", useGeneratedPlan);

  document.getElementById("hideBoughtToggle").checked = localStorage.getItem(STORAGE_KEYS.hideBought) === "true";

  populateBuilderRecipeSelects();
  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init().catch(error => {
  document.body.innerHTML = `<main class="app-shell"><div class="card"><h1>Could not load app</h1><p>${error.message}</p></div></main>`;
});
