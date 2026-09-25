# Project Reference

This document describes the application's current product state and existing decisions. It is a reference for future work, not an immutable specification; explicit future requirements may intentionally change the behaviour documented here.

## Purpose

Maia's Recipe & Meal Planner supports choosing the recipes Maia intends to cook during a week, consolidating their ingredients into a practical shopping list, and keeping the selected cooking instructions easy to reach. It is designed for straightforward personal use rather than multi-user administration.

## Product principles

- Simple personal use
- Mobile-first operation
- Quick to operate
- Offline-capable
- Minimal administrative overhead
- Avoid unnecessary complexity

## Current user journey

1. Add recipes to the current week and choose an approved batch for each.
2. Review the combined Shop list and mark ingredients as Bought or At home.
3. Use Cook for the selected recipes, choices, ingredients, and instructions.
4. Browse the complete recipe library when required.
5. Optionally record weight locally.
6. Start a New week while keeping persistent At-home and Weight data.

## Current areas

### Plan

Plan is a manual list of recipes to cook during the current week. Recipes can be searched and added without weekday assignments. Each recipe appears once, has an explicit approved batch size, and can include required or optional recipe choices.

### Shop

Shop aggregates requirements from the selected recipes by canonical ingredient ID. It separates required To buy items, persistent At home items, and Optional items. Compatible supermarket pack sizes are recommended after weekly aggregation. Bought ticks belong only to the current week.

### Cook

Cook contains only recipes selected for the current week. It shows the chosen batch, approximate yield, selected choices, approved ingredient display text, steps, notes, storage metadata, and a cooked tick.

### Recipes

Recipes contains the complete 43-recipe library. Search uses AND token matching across titles, groups, tags, and ingredient names. Recipes can be added directly to the current week, and recipe details expose the approved batches and instructions.

### Weight

Weight provides an optional minimal weight check-in. Existing entries and the latest change are stored only in the current browser.

## Batch model

Recipes define one or more explicit `batchOptions`. Each batch has its own approximate yield, ingredients, choices, storage metadata, and optional notes. The application does not automatically scale recipes or infer substitutions from prose.

## Shopping and At home

Ingredients have canonical identities in `data/ingredients.json`. Weekly requirements are aggregated before compatible supermarket pack recommendations are calculated. Presence items such as spices are not quantity-optimised.

At home is a persistent yes/no marker, not inventory tracking. Marking an ingredient At home removes it from To buy and clears its Bought state. Starting a New week preserves At home but clears Bought state.

Required and optional quantities remain separate. Leftover-only requirements do not create new shopping items.

## Data

- `data/recipes.json` contains 43 recipes, explicit batches, ingredients, choices, yields, storage metadata, steps, and notes.
- `data/ingredients.json` contains canonical ingredient identities, shopping metadata, aggregation rules, and supermarket packs.

Run `node scripts/validate-data.mjs` to validate both files and all cross-references.

## Local state

The application keeps the following current state in `localStorage`:

- `studentFoodPlanner.currentWeek`: selected recipes, batches, choices, cooked ticks, and Bought state
- `studentFoodPlanner.atHome`: persistent At-home ingredient IDs
- `studentFoodPlanner.hideBought`: persistent hide-bought preference
- `studentFoodPlanner.weightEntries`: existing local Weight history

There is no account, backend, cloud storage, or cross-device synchronisation. Clearing browser or site data can remove saved state. Legacy predefined-plan keys may remain for compatibility but no longer drive the application.

## New week

New week clears selected recipes, batches, choices, cooked ticks, and Bought state. It preserves At home, Weight history, and the hide-bought preference. Confirmation is requested only when current-week state would be lost.

## Offline behaviour

The service worker caches the application shell, recipes, and ingredient catalogue. Cache names must change whenever cached runtime files or data change so installed copies receive the new application.

## Known review areas

- Practical usefulness of supermarket pack recommendations after real shopping trips
- Whether optional ingredients need additional selection controls
- How often At-home markers become stale in real use
- Whether recipe filters need refinement as the catalogue grows
- Whether cooked history is useful beyond the current week
- Safe rendering if future content becomes user-entered
