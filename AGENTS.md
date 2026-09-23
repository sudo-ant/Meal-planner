# Development Instructions

## Project purpose

Maia's Recipe & Meal Planner is a lightweight, mobile-first personal meal-planning PWA. Its simple architecture is intentional.

## Project reference

Before significant product or functional changes, read `PROJECT.md` for the current product behaviour, architecture, and known review areas. It describes the current state and does not override an explicit new user instruction to change that behaviour.

## Architecture

The application currently uses:

- static HTML
- vanilla JavaScript
- CSS
- JSON data
- `localStorage`
- a service worker
- GitHub Pages

Do not introduce frameworks, backends, databases, build systems, or external dependencies unless a future functional requirement genuinely requires them and the user explicitly agrees.

## Development principles

- Preserve GitHub Pages compatibility.
- Preserve mobile-first behaviour.
- Preserve offline and PWA functionality.
- Prefer the smallest clear implementation.
- Avoid unrelated refactoring.
- Avoid modifying recipe or plan data unless the task requires it.
- Preserve existing `localStorage` state where reasonably possible.
- Consider migration and backwards compatibility before changing storage keys or stored structures.
- Safely handle content if it becomes user-entered or externally sourced in the future.
- Maintain accessibility, including semantic structure, keyboard use, labels, focus behaviour, and readable contrast.
- Do not silently invent significant product behaviour.
- If material ambiguity would meaningfully affect the product outcome, report it with the relevant options or proposed assumption.
- Resolve minor implementation details using the smallest reasonable approach consistent with the task and existing product behaviour.

## Git workflow

- Inspect the current branch and working-tree status before starting work.
- Do not commit, push, merge, or deploy unless explicitly instructed.
- Keep changes scoped to the requested work.
- Inspect the final diff before handing work back.
- Avoid destructive Git operations.

## Validation

For relevant changes, consider:

- JavaScript errors
- JSON validity
- affected user flows
- mobile and desktop behaviour
- offline and service-worker implications
- data validation with `node scripts/validate-data.mjs`

Scale validation to the change. Documentation-only work does not require application runtime changes.

## Service worker

The service worker caches the application shell and JSON data for offline use. Changes to cached runtime assets or data must consider the service-worker cache and update strategy so users receive the new files. Documentation-only changes do not require a service-worker cache bump.
