import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

async function loadJson(relativePath) {
  const fullPath = resolve(projectRoot, relativePath);

  try {
    const contents = await readFile(fullPath, "utf8");
    return JSON.parse(contents);
  } catch (error) {
    errors.push(`${relativePath}: could not be read and parsed (${error.message})`);
    return null;
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRecipes(recipes) {
  if (!Array.isArray(recipes)) {
    errors.push("data/recipes.json: top-level value must be an array");
    return new Set();
  }

  const recipeIds = new Set();

  recipes.forEach((recipe, recipeIndex) => {
    const location = `data/recipes.json recipe ${recipeIndex + 1}`;

    if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
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

    if (!isNonEmptyString(recipe.title)) {
      errors.push(`${location}: title must be a non-empty string`);
    }

    if (!Array.isArray(recipe.ingredients)) {
      errors.push(`${location}: ingredients must be an array`);
    } else {
      recipe.ingredients.forEach((ingredient, ingredientIndex) => {
        if (!ingredient || typeof ingredient !== "object" || !isNonEmptyString(ingredient.item)) {
          errors.push(`${location}, ingredient ${ingredientIndex + 1}: item must be a non-empty string`);
        }
      });
    }

    if (!Array.isArray(recipe.steps)) {
      errors.push(`${location}: steps must be an array`);
    }
  });

  return recipeIds;
}

function validatePlans(plans, recipeIds) {
  if (!Array.isArray(plans)) {
    errors.push("data/plans.json: top-level value must be an array");
    return 0;
  }

  const planIds = new Set();
  let referenceCount = 0;

  plans.forEach((plan, planIndex) => {
    const location = `data/plans.json plan ${planIndex + 1}`;

    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      errors.push(`${location}: must be an object`);
      return;
    }

    if (!isNonEmptyString(plan.id)) {
      errors.push(`${location}: id must be a non-empty string`);
    } else if (planIds.has(plan.id)) {
      errors.push(`${location}: duplicate plan id "${plan.id}"`);
    } else {
      planIds.add(plan.id);
    }

    if (!isNonEmptyString(plan.title)) {
      errors.push(`${location}: title must be a non-empty string`);
    }

    if (!Array.isArray(plan.days)) {
      errors.push(`${location}: days must be an array`);
      return;
    }

    plan.days.forEach((day, dayIndex) => {
      const dayLocation = `${location}, day ${dayIndex + 1}`;

      if (!day || typeof day !== "object" || Array.isArray(day)) {
        errors.push(`${dayLocation}: must be an object`);
        return;
      }

      if (!isNonEmptyString(day.day)) {
        errors.push(`${dayLocation}: day must be a non-empty string`);
      }

      if (!isNonEmptyString(day.meal)) {
        errors.push(`${dayLocation}: meal must be a non-empty string`);
      } else {
        referenceCount += 1;
        if (!recipeIds.has(day.meal)) {
          errors.push(`${dayLocation}: meal references unknown recipe id "${day.meal}"`);
        }
      }
    });
  });

  return referenceCount;
}

const [recipes, plans] = await Promise.all([
  loadJson("data/recipes.json"),
  loadJson("data/plans.json"),
]);

const recipeIds = validateRecipes(recipes);
const referenceCount = validatePlans(plans, recipeIds);

if (errors.length > 0) {
  console.error(`Data validation failed with ${errors.length} error${errors.length === 1 ? "" : "s"}:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Recipes validated: ${recipes.length}`);
  console.log(`Plans validated: ${plans.length}`);
  console.log(`Plan-day recipe references validated: ${referenceCount}`);
  console.log("Success: all data is valid.");
}
