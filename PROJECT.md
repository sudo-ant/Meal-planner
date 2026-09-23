# Project Reference

This document describes the application's current product state and existing decisions. It is a reference for future work, not an immutable specification; explicit future requirements may intentionally change the behaviour documented here.

## Purpose

Maia's Recipe & Meal Planner supports planning practical meals from food packs, turning a selected or generated plan into recipe guidance and a combined shopping list. It is designed for straightforward personal use rather than multi-user administration.

## Product principles

- Simple personal use
- Mobile-first operation
- Quick to operate
- Offline-capable
- Minimal administrative overhead
- Avoid unnecessary complexity

## Current user journey

1. Choose an existing plan or create one with Builder.
2. Review the planned food packs.
3. Use the generated shopping list.
4. Prepare meals and tick food packs off.
5. Browse recipes when required.
6. Optionally record weight locally.

## Current areas

### Plan

Selects and displays a premade or generated plan. Each food pack can be expanded for recipe details and ticked off as it is used.

### Shopping

Builds a categorized list from the active plan, aggregates compatible quantities, supports bought-item ticks and hiding bought items, and can copy the list to the clipboard.

### Builder

Creates a five- or six-day plan from the recipe collection. It supports optional must-have recipes and uses current scoring and ordering rules to produce a practical mix.

### Recipes

Provides searchable, filterable access to the full recipe collection, with ingredients, steps, and notes available in expandable details.

### Weight

Provides an optional minimal weight check-in. Entries and the latest change are stored only in the current browser.

## Food-pack concept

The current product generally treats a recipe with two or more portions as supporting lunch plus dinner. A one-portion recipe may need a side or combination with another item. Builder favours practical meal-prep recipes, and generated ordering currently puts fish and meat earlier where practical. These are descriptions of current behaviour, not immutable product rules.

## Data

- `data/recipes.json` contains recipe definitions, ingredients, steps, tags, servings, and related display information.
- `data/plans.json` contains the premade plans.
- Plan days reference recipes by recipe ID.

Run `node scripts/validate-data.mjs` to check the current structural requirements and recipe references.

## Local state

The application currently keeps the following state in `localStorage`:

- selected plan
- meal ticks
- shopping ticks
- hide-bought preference
- generated plan
- weight entries

This means there is no account, cloud storage, or cross-device synchronisation. Clearing browser or site data can remove the saved state. That device-local model is an intentional part of the application's current simplicity rather than a defect.

## Offline behaviour

The service worker caches the application shell and JSON data. After the required resources have been cached, the app can load without a network connection. Runtime or data changes need an appropriate cache/update strategy; documentation-only changes do not require a cache bump.

## Known review areas

These areas are recorded for future product review, not resolved by this documentation foundation:

- Builder behaviour and scoring
- Builder must-have behaviour
- Meaning of Clear Plan
- Clear Plan and generated-plan persistence
- Scope and meaning of reset actions
- Multi-word recipe search
- Shopping-list aggregation
- Usefulness and scope of Weight
- Generated-plan history and persistence
- Whether cross-device storage is ever needed
- Safe handling if future content becomes user-entered
