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


## v4 fixed changes

- Added recipe filter buttons.
- Updated plan language to food packs.
- Quick Plan Builder preserved and now favours 2-portion recipes.
- Service worker cache bumped to v4-fixed.


## v5 changes

- Includes the full 35-recipe set, including light/summer recipes.
- Added short “Lighter ideas” notes where genuinely useful.
- Added a visible “🌿 Lighter ideas” label on relevant recipes.
- Tightened food pack guidance:
  - 2+ portions → lunch + dinner
  - 1 portion → add side or combine
- Service worker cache bumped to v5.


## v5.2-details changes

- Recipe cards now use one Details / Hide details button.
- Ingredients, Steps and Notes open together.
- Service worker cache bumped to v5.2-details.


## v5.3 plan details changes

- Plan cards no longer show general search tags.
- Plan cards now include one Details / Hide details button.
- Plan card details show Ingredients, Steps and Notes together.
- The Light Ideas label is kept where relevant.
- Service worker cache bumped to v5.3-plan-details.
