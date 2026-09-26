# Maia's Recipe & Meal Planner

A lightweight, mobile-first personal meal-planning PWA for choosing what to cook this week, building a consolidated shopping list, and keeping cooking instructions close at hand.

## Features

- Build the current week manually from a 48-recipe catalogue.
- Choose explicit recipe-specific batch sizes and substitutions.
- See approximate weekly yield without assigning recipes to weekdays.
- Aggregate required ingredients by canonical identity.
- Calculate supermarket pack recommendations after weekly aggregation.
- Keep persistent At-home markers without tracking inventory quantities.
- Tick Bought items, hide bought items, and copy To buy plus Optional lists.
- Cook from a focused view containing only this week's recipes.
- Search recipes using multi-word AND matching.
- Preserve optional local Weight history.
- Install and use the app offline after its resources are cached.

## Architecture

The project intentionally uses static HTML, vanilla JavaScript, CSS, JSON data, `localStorage`, and a service worker. It has no dependencies, package manager, build step, backend, database, account, or cloud synchronisation. It is designed for GitHub Pages.

## Repository structure

```text
Meal-planner/
|- AGENTS.md                 Development and contribution guidance
|- PROJECT.md                Current product and architecture reference
|- CHANGELOG.md              Historical release notes
|- README.md                 Repository overview and operating instructions
|- index.html                Application shell
|- styles.css                Application styles
|- app.js                    Rendering, shopping logic, and local state
|- manifest.json             PWA metadata
|- service-worker.js         Offline asset and data caching
|- scripts/
|  `- validate-data.mjs      Zero-dependency v2 data validator
|- data/
|  |- recipes.json           Approved recipe and batch catalogue
|  `- ingredients.json       Canonical ingredients and supermarket packs
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

`data/recipes.json` contains 48 recipes with explicit approved batches, approximate yields, ingredient requirements, choices, storage metadata, steps, and notes. The catalogue includes eight trial recipes added during Maia's recipe review and excludes three recipes removed in that review. `data/ingredients.json` provides 81 stable ingredient identities, aggregation rules, shopping flags, and supermarket pack metadata.

Recipe amounts are not scaled automatically. The application always uses one of the batch options supplied in the data.

## Data validation

With Node.js available, validate both data files and their references with:

```sh
node scripts/validate-data.mjs
```

The validator uses only built-in Node.js functionality and requires no installation.

## Local storage

The current week, At-home ingredient markers, hide-bought preference, and Weight entries are stored in the current browser. New week clears only current-week selections and progress. Existing `studentFoodPlanner.weightEntries` data is preserved unchanged.

Legacy predefined-plan keys are ignored by the current runtime and may remain for one release.

## Offline/PWA behaviour

The service worker caches the application shell, recipe catalogue, and ingredient catalogue for offline use. Runtime or data changes require a cache version update.

## Deployment

The repository can be served directly with GitHub Pages. Publish the repository root and preserve the existing relative paths. No build command or generated output is required.

## Development guidance

- Read `AGENTS.md` before making changes.
- Use `PROJECT.md` for the current product behaviour and review areas.
- Use `CHANGELOG.md` for release history.
