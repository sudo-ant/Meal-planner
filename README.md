# Student Food Planner

A static, mobile-first meal planning and shopping app.

## Features

- Select a premade 5-day or 6-day plan
- View the week's recipes
- Tick meals off when cooked
- Generate a hybrid shopping list
- Tick shopping items off
- Reset meal or shopping ticks
- Search all recipes
- Installable PWA
- Works on GitHub Pages

## Files

```text
student_food_planner_app/
├─ index.html
├─ styles.css
├─ app.js
├─ manifest.json
├─ service-worker.js
├─ data/
│  ├─ recipes.json
│  └─ plans.json
└─ icons/
```

## Shopping list logic

The app uses a hybrid approach.

It sums clear quantities such as:

- mugs of rice
- tins of beans
- grams of turkey mince
- eggs
- chicken breasts
- frozen vegetable mugs

It keeps items grouped by Continente-style sections such as Meat, Frozen, Dry goods, Tinned goods, Dairy, Eggs and Seasoning.

## Deployment

Upload the folder contents to a GitHub Pages repository.

For best results, keep the data files at:

```text
data/recipes.json
data/plans.json
```

## Editing recipes

Edit `data/recipes.json`.

Each recipe needs:

- id
- title
- group
- servings
- tags
- ingredients
- steps

## Editing plans

Edit `data/plans.json`.

Each plan uses recipe IDs from `recipes.json`.


## v2 changes

- Fixed half quantities, e.g. `0.5 tsp` now displays as `½ tsp`, not `0½ tsp`.
- Added supermarket-style category ordering.
- Added meal progress percentage.
- Highlighted the next unticked meal.
- Added hide-bought-items toggle.
- Added copy shopping list button.
- Bumped the service worker cache to v2.


## v3 changes

- Renamed app to `Maia's Recipe & Meal Planner`.
- Weekly plans now show whether they are 5-day or 6-day plans.
- Shopping list categories simplified:
  - Tinned goods, dry goods, condiments, seasoning and oil now show as Cupboard.
- Water is excluded from the shopping list.
- Added Quick Plan Builder:
  - choose 5 or 6 days
  - optionally choose 1–2 must-have recipes
  - generate a balanced plan
  - use generated plan as the active plan
