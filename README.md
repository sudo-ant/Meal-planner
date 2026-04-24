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
