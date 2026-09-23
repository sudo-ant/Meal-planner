# Maia's Recipe & Meal Planner

A lightweight, mobile-first personal meal-planning PWA for choosing or generating food-pack plans, preparing a shopping list, following recipes, and optionally recording weight locally.

## Features

- Choose from premade five- and six-day plans.
- Generate a plan with optional must-have recipes.
- Review recipes and tick completed food packs.
- Generate, group, copy, and tick off shopping-list items.
- Search and filter the recipe collection.
- Record optional weight check-ins on the current device.
- Install and use the app offline after its resources are cached.

## Architecture

The project intentionally uses static HTML, vanilla JavaScript, CSS, JSON data, `localStorage`, and a service worker. It has no dependencies, package manager, build step, backend, or database, and is designed for GitHub Pages.

## Repository structure

```text
Meal-planner/
|- AGENTS.md                 Development and contribution guidance
|- PROJECT.md                Current product and architecture reference
|- CHANGELOG.md              Historical release notes
|- README.md                 Repository overview and operating instructions
|- index.html                Application shell
|- styles.css                Application styles
|- app.js                    Rendering, interactions, and local state
|- manifest.json             PWA metadata
|- service-worker.js         Offline asset and data caching
|- scripts/
|  `- validate-data.mjs      Zero-dependency data validator
|- data/
|  |- recipes.json           Recipe collection
|  `- plans.json             Premade plans
`- icons/                    PWA icons
```

## Running locally

Serve the repository over HTTP so `fetch()` and service-worker behaviour work correctly. Do not open `index.html` directly with a `file://` URL.

No installation is required. One optional approach, when Python is available, is:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Data

Recipes are stored in `data/recipes.json`. Premade plans are stored in `data/plans.json`, with each plan day referencing a recipe by its recipe ID.

## Data validation

With Node.js available, validate both data files and their plan-to-recipe references with:

```sh
node scripts/validate-data.mjs
```

The validator uses only built-in Node.js functionality and requires no installation.

## Local storage

Plan selection, completion ticks, shopping state, the hide-bought preference, generated plans, and weight entries are stored in the current browser with `localStorage`. There is no account or cross-device synchronisation, and clearing browser or site data can remove this state.

## Offline/PWA behaviour

The service worker caches the application shell and JSON data for offline use. Changes to cached runtime files or data should account for the cache/update strategy. Documentation-only changes do not require a cache bump.

## Deployment

The repository can be served directly with GitHub Pages. Publish the repository root and preserve the existing relative file paths, including `data/recipes.json` and `data/plans.json`. No build command or generated output is required.

## Development guidance

- Read `AGENTS.md` before making changes.
- Use `PROJECT.md` for the current product behaviour and review areas.
- Use `CHANGELOG.md` for release history.
