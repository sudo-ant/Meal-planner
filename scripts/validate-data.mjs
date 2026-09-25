import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const counters = {
  recipes: 0,
  ingredients: 0,
  batchOptions: 0,
  choiceGroups: 0,
  ingredientReferences: 0
};

const CONTROLLED_TAGS = new Set([
  "batch",
  "freezer-friendly",
  "leftovers",
  "light",
  "one-pot",
  "pan",
  "quick",
  "summer",
  "trial"
]);
const CONTROLLED_GROUPS = new Set([
  "Beef",
  "Chicken",
  "Fish",
  "Light / Summer",
  "Turkey",
  "Vegetarian / Eggs"
]);
const AGGREGATION_MODES = new Set(["sum", "presence", "none"]);
const INGREDIENT_STATUSES = new Set(["required", "optional"]);
const STORAGE_SIZES = new Set(["normal", "large_batch"]);
const FREEZER_VALUES = new Set(["yes", "no", "conditional"]);
const SHOPPING_BEHAVIOURS = new Set(["leftover"]);

async function loadJson(relativePath) {
  try {
    return JSON.parse(await readFile(resolve(projectRoot, relativePath), "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: could not be read and parsed (${error.message})`);
    return null;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateIngredients(ingredients) {
  const ingredientMap = new Map();
  const packIds = new Set();

  if (!Array.isArray(ingredients)) {
    errors.push("data/ingredients.json: top-level value must be an array");
    return { ingredientMap, packIds };
  }

  counters.ingredients = ingredients.length;

  ingredients.forEach((ingredient, index) => {
    const location = `data/ingredients.json ingredient ${index + 1}`;
    if (!isObject(ingredient)) {
      errors.push(`${location}: must be an object`);
      return;
    }

    if (!isNonEmptyString(ingredient.id)) {
      errors.push(`${location}: id must be a non-empty string`);
    } else if (ingredientMap.has(ingredient.id)) {
      errors.push(`${location}: duplicate ingredient id "${ingredient.id}"`);
    } else {
      ingredientMap.set(ingredient.id, ingredient);
    }

    if (!isNonEmptyString(ingredient.name)) errors.push(`${location}: name must be a non-empty string`);
    if (!isNonEmptyString(ingredient.category)) errors.push(`${location}: category must be a non-empty string`);
    if (typeof ingredient.shopping !== "boolean") errors.push(`${location}: shopping must be boolean`);
    if (typeof ingredient.atHomeCandidate !== "boolean") errors.push(`${location}: atHomeCandidate must be boolean`);

    if (!isObject(ingredient.aggregation) || !AGGREGATION_MODES.has(ingredient.aggregation.mode)) {
      errors.push(`${location}: aggregation.mode must be one of ${[...AGGREGATION_MODES].join(", ")}`);
    } else if (ingredient.aggregation.mode === "sum" && !isNonEmptyString(ingredient.aggregation.unit)) {
      errors.push(`${location}: sum aggregation requires a unit`);
    }

    if (ingredient.packs !== undefined && !Array.isArray(ingredient.packs)) {
      errors.push(`${location}: packs must be an array when present`);
      return;
    }

    (ingredient.packs || []).forEach((pack, packIndex) => {
      const packLocation = `${location}, pack ${packIndex + 1}`;
      if (!isObject(pack)) {
        errors.push(`${packLocation}: must be an object`);
        return;
      }
      if (!isNonEmptyString(pack.id)) {
        errors.push(`${packLocation}: id must be a non-empty string`);
      } else if (packIds.has(pack.id)) {
        errors.push(`${packLocation}: duplicate pack id "${pack.id}"`);
      } else {
        packIds.add(pack.id);
      }
      if (!isNonEmptyString(pack.label)) errors.push(`${packLocation}: label must be a non-empty string`);
      if (typeof pack.amount !== "number" || pack.amount <= 0) errors.push(`${packLocation}: amount must be a positive number`);
      if (!isNonEmptyString(pack.unit)) errors.push(`${packLocation}: unit must be a non-empty string`);
      if (pack.preferred !== undefined && typeof pack.preferred !== "boolean") errors.push(`${packLocation}: preferred must be boolean when present`);
    });
  });

  return { ingredientMap, packIds };
}

function validateIngredientReference(reference, location, ingredientMap) {
  counters.ingredientReferences += 1;

  if (!isObject(reference)) {
    errors.push(`${location}: must be an object`);
    return;
  }

  const ingredient = ingredientMap.get(reference.ingredientId);
  if (!isNonEmptyString(reference.ingredientId)) {
    errors.push(`${location}: ingredientId must be a non-empty string`);
  } else if (!ingredient) {
    errors.push(`${location}: unknown ingredientId "${reference.ingredientId}"`);
  }

  if (!INGREDIENT_STATUSES.has(reference.status)) {
    errors.push(`${location}: status must be required or optional`);
  }
  if (!isNonEmptyString(reference.display)) {
    errors.push(`${location}: display must be a non-empty string`);
  }
  if (reference.amount !== undefined && (typeof reference.amount !== "number" || reference.amount <= 0)) {
    errors.push(`${location}: amount must be a positive number when present`);
  }
  if (reference.amount !== undefined && !isNonEmptyString(reference.unit)) {
    errors.push(`${location}: unit is required when amount is present`);
  }
  if (ingredient?.aggregation.mode === "sum" && reference.amount !== undefined && reference.unit !== ingredient.aggregation.unit) {
    errors.push(`${location}: unit "${reference.unit}" does not match ${reference.ingredientId} aggregation unit "${ingredient.aggregation.unit}"`);
  }
  if (reference.shoppingBehaviour !== undefined && !SHOPPING_BEHAVIOURS.has(reference.shoppingBehaviour)) {
    errors.push(`${location}: unsupported shoppingBehaviour "${reference.shoppingBehaviour}"`);
  }
  if (reference.leftoverPreferred !== undefined && typeof reference.leftoverPreferred !== "boolean") {
    errors.push(`${location}: leftoverPreferred must be boolean when present`);
  }

  if (reference.preferredPackId !== undefined) {
    const validPack = ingredient?.packs?.some(pack => pack.id === reference.preferredPackId);
    if (!validPack) errors.push(`${location}: preferredPackId "${reference.preferredPackId}" is not a pack for ${reference.ingredientId}`);
  }
}

function validateRecipes(recipes, ingredientMap) {
  if (!Array.isArray(recipes)) {
    errors.push("data/recipes.json: top-level value must be an array");
    return;
  }

  counters.recipes = recipes.length;
  if (recipes.length !== 43) errors.push(`data/recipes.json: expected exactly 43 recipes, found ${recipes.length}`);
  const recipeIds = new Set();

  recipes.forEach((recipe, recipeIndex) => {
    const location = `data/recipes.json recipe ${recipeIndex + 1}`;
    if (!isObject(recipe)) {
      errors.push(`${location}: must be an object`);
      return;
    }

    if (!isNonEmptyString(recipe.id)) {
      errors.push(`${location}: id must be a non-empty string`);
    } else if (recipeIds.has(recipe.id)) {
      errors.push(`${location}: duplicate recipe id "${recipe.id}"`);
    } else {
      recipeIds.add(recipe.id);
    }

    if (!isNonEmptyString(recipe.title)) errors.push(`${location}: title must be a non-empty string`);
    if (!CONTROLLED_GROUPS.has(recipe.group)) errors.push(`${location}: unsupported group "${recipe.group}"`);
    if (typeof recipe.trial !== "boolean") errors.push(`${location}: trial must be boolean`);

    if (!Array.isArray(recipe.tags)) {
      errors.push(`${location}: tags must be an array`);
    } else {
      recipe.tags.forEach(tag => {
        if (!CONTROLLED_TAGS.has(tag)) errors.push(`${location}: unsupported tag "${tag}"`);
      });
    }

    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0 || recipe.steps.some(step => !isNonEmptyString(step))) {
      errors.push(`${location}: steps must be a non-empty array of strings`);
    }
    if (!Array.isArray(recipe.notes) || recipe.notes.some(note => !isNonEmptyString(note))) {
      errors.push(`${location}: notes must be an array of strings`);
    }
    if (!Array.isArray(recipe.batchOptions) || recipe.batchOptions.length === 0) {
      errors.push(`${location}: must contain at least one batch option`);
      return;
    }

    const batchIds = new Set();
    recipe.batchOptions.forEach((batch, batchIndex) => {
      counters.batchOptions += 1;
      const batchLocation = `${location}, batch ${batchIndex + 1}`;
      if (!isObject(batch)) {
        errors.push(`${batchLocation}: must be an object`);
        return;
      }

      if (!isNonEmptyString(batch.id)) {
        errors.push(`${batchLocation}: id must be a non-empty string`);
      } else if (batchIds.has(batch.id)) {
        errors.push(`${batchLocation}: duplicate batch id "${batch.id}" within recipe ${recipe.id}`);
      } else {
        batchIds.add(batch.id);
      }
      if (!isNonEmptyString(batch.label)) errors.push(`${batchLocation}: label must be a non-empty string`);

      if (!isObject(batch.yield) || typeof batch.yield.min !== "number" || typeof batch.yield.max !== "number" ||
        batch.yield.min <= 0 || batch.yield.max < batch.yield.min) {
        errors.push(`${batchLocation}: yield must contain a positive min and max with max >= min`);
      }
      if (!isObject(batch.storage) || !STORAGE_SIZES.has(batch.storage.size) || !FREEZER_VALUES.has(batch.storage.freezer)) {
        errors.push(`${batchLocation}: storage must use a valid size and freezer value`);
      }

      if (!Array.isArray(batch.ingredients)) {
        errors.push(`${batchLocation}: ingredients must be an array`);
      } else {
        batch.ingredients.forEach((reference, index) => {
          validateIngredientReference(reference, `${batchLocation}, ingredient ${index + 1}`, ingredientMap);
        });
      }

      if (!Array.isArray(batch.choices)) {
        errors.push(`${batchLocation}: choices must be an array`);
        return;
      }

      const choiceIds = new Set();
      batch.choices.forEach((choice, choiceIndex) => {
        counters.choiceGroups += 1;
        const choiceLocation = `${batchLocation}, choice ${choiceIndex + 1}`;
        if (!isObject(choice)) {
          errors.push(`${choiceLocation}: must be an object`);
          return;
        }
        if (!isNonEmptyString(choice.id)) {
          errors.push(`${choiceLocation}: id must be a non-empty string`);
        } else if (choiceIds.has(choice.id)) {
          errors.push(`${choiceLocation}: duplicate choice id "${choice.id}" within batch ${batch.id}`);
        } else {
          choiceIds.add(choice.id);
        }
        if (!isNonEmptyString(choice.label)) errors.push(`${choiceLocation}: label must be a non-empty string`);
        if (typeof choice.required !== "boolean") errors.push(`${choiceLocation}: required must be boolean`);
        if (!Array.isArray(choice.options) || choice.options.length === 0) {
          errors.push(`${choiceLocation}: options must be a non-empty array`);
          return;
        }

        const optionIds = new Set();
        choice.options.forEach((option, optionIndex) => {
          const optionLocation = `${choiceLocation}, option ${optionIndex + 1}`;
          if (!isObject(option)) {
            errors.push(`${optionLocation}: must be an object`);
            return;
          }
          if (!isNonEmptyString(option.id)) {
            errors.push(`${optionLocation}: id must be a non-empty string`);
          } else if (optionIds.has(option.id)) {
            errors.push(`${optionLocation}: duplicate option id "${option.id}"`);
          } else {
            optionIds.add(option.id);
          }
          if (!isNonEmptyString(option.label)) errors.push(`${optionLocation}: label must be a non-empty string`);
          if (!Array.isArray(option.ingredients) || option.ingredients.length === 0) {
            errors.push(`${optionLocation}: ingredients must be a non-empty array`);
          } else {
            option.ingredients.forEach((reference, index) => {
              validateIngredientReference(reference, `${optionLocation}, ingredient ${index + 1}`, ingredientMap);
            });
          }
        });

        if (choice.required && !isNonEmptyString(choice.defaultOptionId)) {
          errors.push(`${choiceLocation}: required choice must have defaultOptionId`);
        }
        if (choice.defaultOptionId !== undefined && !optionIds.has(choice.defaultOptionId)) {
          errors.push(`${choiceLocation}: defaultOptionId "${choice.defaultOptionId}" does not match an option`);
        }
      });

      if (batch.notes !== undefined && (!Array.isArray(batch.notes) || batch.notes.some(note => !isNonEmptyString(note)))) {
        errors.push(`${batchLocation}: notes must be an array of strings when present`);
      }
    });
  });
}

const [ingredients, recipes] = await Promise.all([
  loadJson("data/ingredients.json"),
  loadJson("data/recipes.json")
]);

const { ingredientMap } = validateIngredients(ingredients);
validateRecipes(recipes, ingredientMap);

if (errors.length) {
  console.error(`Data validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Recipes validated: ${counters.recipes}`);
  console.log(`Ingredients validated: ${counters.ingredients}`);
  console.log(`Batch options validated: ${counters.batchOptions}`);
  console.log(`Choice groups validated: ${counters.choiceGroups}`);
  console.log(`Ingredient references validated: ${counters.ingredientReferences}`);
  console.log("Success: all v2 data is valid.");
}
