const DATA_PATHS = {
  recipes: "data/recipes.json",
  plans: "data/plans.json"
};

const STORAGE_KEYS = {
  selectedPlan: "studentFoodPlanner.selectedPlan",
  mealTicks: "studentFoodPlanner.mealTicks",
  shoppingTicks: "studentFoodPlanner.shoppingTicks"
};

let recipes = [];
let plans = [];
let selectedPlanId = null;

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
  return String(value).replace(".5", "½").replace(".25", "¼").replace(".75", "¾");
}

function normaliseItemKey(ingredient) {
  return `${ingredient.item.toLowerCase()}|${ingredient.unit || ""}|${ingredient.category || "Other"}`;
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
      const key = normaliseItemKey(ingredient);

      if (canSum(ingredient)) {
        if (!map.has(key)) {
          map.set(key, {
            mode: "sum",
            item: ingredient.item,
            category: ingredient.category || "Other",
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
        const countKey = `${ingredient.item.toLowerCase()}|count|${ingredient.category || "Other"}`;
        if (!map.has(countKey)) {
          map.set(countKey, {
            mode: "count",
            item: ingredient.item,
            category: ingredient.category || "Other",
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
    const cat = a.category.localeCompare(b.category);
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

function getSelectedPlan() {
  return plans.find(plan => plan.id === selectedPlanId) || plans[0];
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
  select.innerHTML = plans.map(plan => `<option value="${plan.id}">${plan.title}</option>`).join("");
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

  const fillers = plan.fillers?.length
    ? `<h3>Fillers</h3><ul class="filler-list">${plan.fillers.map(filler => `<li>${filler}</li>`).join("")}</ul>`
    : "";

  summary.innerHTML = `
    <div class="card">
      <h2>${plan.title}</h2>
      <p>${plan.days.length} planned recipe days.</p>
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
    const tags = recipe.tags?.slice(0, 5).map(tag => `<span class="tag">${tag}</span>`).join("") || "";

    return `
      <article class="card meal-card">
        <input class="checkbox meal-check" type="checkbox" ${checked} data-key="${tickKey}" aria-label="Mark ${recipe.title} as cooked">
        <div>
          <p class="meta">${day.day}</p>
          <h3 class="meal-title">${recipe.title}</h3>
          <p class="meta">${recipe.servings || 1} portion${recipe.servings === 1 ? "" : "s"} · ${recipe.group || "Recipe"}</p>
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
    });
  });
}

function renderShoppingList() {
  const plan = getSelectedPlan();
  const shoppingTicks = getStoredObject(STORAGE_KEYS.shoppingTicks);
  const container = document.getElementById("shoppingList");

  if (!plan) {
    container.innerHTML = `<div class="card empty">Choose a plan first.</div>`;
    return;
  }

  const items = buildShoppingList(plan);
  const groups = groupByCategory(items);

  container.innerHTML = Object.entries(groups).map(([category, groupItems]) => `
    <section class="card">
      <h3 class="category-title">${category}</h3>
      ${groupItems.map(item => {
        const key = `${plan.id}:${item.category}:${item.item}:${item.unit || item.detail || ""}`;
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
  `).join("");

  document.querySelectorAll(".shopping-check").forEach(input => {
    input.addEventListener("change", event => {
      const ticks = getStoredObject(STORAGE_KEYS.shoppingTicks);
      ticks[event.target.dataset.key] = event.target.checked;
      setStoredObject(STORAGE_KEYS.shoppingTicks, ticks);
      renderShoppingList();
    });
  });
}

function renderRecipes() {
  const query = document.getElementById("recipeSearch").value.trim().toLowerCase();
  const filtered = recipes.filter(recipe => {
    const blob = [
      recipe.title,
      recipe.group,
      ...(recipe.tags || []),
      ...(recipe.ingredients || []).map(i => i.item)
    ].join(" ").toLowerCase();

    return blob.includes(query);
  });

  const container = document.getElementById("recipeList");

  container.innerHTML = filtered.map(recipe => `
    <article class="card">
      <h3>${recipe.title}</h3>
      <p>${recipe.servings || 1} portion${recipe.servings === 1 ? "" : "s"} · ${recipe.group || "Recipe"}</p>
      <div class="tags">${(recipe.tags || []).slice(0, 6).map(tag => `<span class="tag">${tag}</span>`).join("")}</div>
      <h4>Ingredients</h4>
      <ul>
        ${recipe.ingredients.map(ingredient => `
          <li>${formatQuantity(ingredient.quantity)} ${ingredient.unit || ""} ${ingredient.item}${ingredient.optional ? " (optional)" : ""}</li>
        `).join("")}
      </ul>
      <h4>Steps</h4>
      <ol class="steps">
        ${recipe.steps.map(step => `<li>${step}</li>`).join("")}
      </ol>
    </article>
  `).join("") || `<div class="card empty">No recipes found.</div>`;
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

  selectedPlanId = localStorage.getItem(STORAGE_KEYS.selectedPlan) || plans[0]?.id || null;

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

  document.getElementById("clearPlanBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.selectedPlan);
    localStorage.removeItem(STORAGE_KEYS.mealTicks);
    localStorage.removeItem(STORAGE_KEYS.shoppingTicks);
    selectedPlanId = plans[0]?.id || null;
    renderAll();
  });

  document.getElementById("recipeSearch").addEventListener("input", renderRecipes);

  renderAll();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

init().catch(error => {
  document.body.innerHTML = `<main class="app-shell"><div class="card"><h1>Could not load app</h1><p>${error.message}</p></div></main>`;
});
