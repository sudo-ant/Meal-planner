# Changelog

## Unreleased

- Replaced predefined plans and the automatic Builder with manual weekly recipe selection.
- Added explicit recipe batch selection, approximate weekly yields, and recipe choices.
- Replaced Shopping with a canonical-ingredient Shop flow containing To buy, At home, and Optional sections.
- Added weekly pack recommendations calculated after ingredient aggregation.
- Added persistent At-home markers and week-specific Bought state.
- Added a Cook view containing only the current week's selected recipes.
- Updated recipe search to use multi-word AND matching across recipe and ingredient data.
- Replaced the recipe catalogue with the approved 43-recipe v2 data and added 68 canonical ingredients.
- Retired `data/plans.json` from the runtime and repository.
- Updated data validation for batches, choices, yields, storage, packs, tags, and ingredient references.
- Updated the service-worker cache for the redesigned runtime and data files.
- Preserved existing local Weight history and ignored legacy plan storage keys.
- Added repository-level development guidance in `AGENTS.md`.
- Added a current product and architecture reference in `PROJECT.md`.
- Added a zero-dependency data validator, now updated for v2 recipe and ingredient data.
- Reworked the README as concise current documentation and moved historical release notes here.

## v5.6 fixed

- Weight check-in moved to its own Weight tab.
- Removed duplicate / misplaced Weight block from the Plan tab.
- Recipes tab preserved.
- Service worker cache bumped to v5.6-fixed.

## v5.5

- Quick Plan Builder now has three optional must-have recipe selectors.
- Added a minimal Weight check-in at the bottom of the Plan tab:
  - manual kg entry
  - latest weight display
  - previous-entry change
  - saved only on this device via localStorage
- Service worker cache bumped to v5.5.

## v5.4 details fixed

- Details buttons use event delegation so they work after dynamic rendering.
- Details buttons now have a distinct full-width outline style.
- Details panels have stable target ids.
- Hidden panels use a stronger `.hidden` rule.
- Service worker cache bumped to v5.4-details-fixed.

## v5.3 plan details

- Plan cards no longer show general search tags.
- Plan cards now include one Details / Hide details button.
- Plan card details show Ingredients, Steps and Notes together.
- The Light Ideas label is kept where relevant.
- Service worker cache bumped to v5.3-plan-details.

## v5.2 details

- Recipe cards now use one Details / Hide details button.
- Ingredients, Steps and Notes open together.
- Service worker cache bumped to v5.2-details.

## v5

- Includes the full 35-recipe set, including light/summer recipes.
- Added short "Lighter ideas" notes where genuinely useful.
- Added a visible "🌿 Lighter ideas" label on relevant recipes.
- Tightened food pack guidance:
  - 2+ portions → lunch + dinner
  - 1 portion → add side or combine
- Service worker cache bumped to v5.

## v4 fixed

- Added recipe filter buttons.
- Updated plan language to food packs.
- Quick Plan Builder preserved and now favours 2-portion recipes.
- Service worker cache bumped to v4-fixed.

## v3

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

## v2

- Fixed half quantities, e.g. `0.5 tsp` now displays as `½ tsp`, not `0½ tsp`.
- Added supermarket-style category ordering.
- Added meal progress percentage.
- Highlighted the next unticked meal.
- Added hide-bought-items toggle.
- Added copy shopping list button.
- Bumped the service worker cache to v2.
