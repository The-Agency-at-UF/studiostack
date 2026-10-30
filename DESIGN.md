# StudioStack design system

StudioStack is The Agency at UF’s daily production desk. Use the Nerve identity in a bold black frame around calm, readable white work surfaces. Operate mode: tasks, status and actions lead; no marketing heroes in the workspace.

## Authority

The approved UI overhaul and `docs/brand-guidelines.md` govern this system. Nerve book pages establish black/white, purple #5302D8 and lavender #AB9BFF; red is reserved for error/destruction in product UI. GradientDeck is installed at `.agents/skills/gradientdeck`; its page contract is `.gradientdeck/pages/workspace.md`.

## Tokens and type

`src/styles/tokens.css` is the source of truth for colors, spacing, typography, radii, control heights and motion. Prefer licensed Gentona Book/Bold; files are not supplied. Use Franklin Gothic/Arial consistently as the fallback. Do not fetch unlicensed fonts. White surfaces, a cool neutral canvas and 1px dividers replace cream, graph paper and offset shadows. Dark purple has white text; lavender is for black surfaces. Semantic success/warning/danger colors have readable text variants.

## Structure

A 240px desktop rail groups Overview, Production, Equipment, Workspace and Administration. Below 1024px it becomes a modal drawer with focus containment and Escape dismissal. Preserve route identity, mounted links, sessions, deep links and current authorization. One primary action per page; account and sign-out sit at the rail’s bottom. The working column uses 32px gutters, 32px titles and 14–16px text. Touch controls are at least 44px.

## Working patterns

Shared primitives live in `src/components/workspace/WorkspaceUI.tsx`. Page headers establish location and action. Tables and compact queues use dividers, aligned headers and accessible row actions. Filters show active state, result counts and reset. Forms use explicit save with an unsaved indicator; do not introduce autosave. Details keep context with a secondary inspector which stacks on narrower screens. Existing statuses, APIs and validation remain authoritative.

## States and accessibility

Every read distinguishes loading, empty and error. Failed data never becomes a zero count. Cached content stays usable during refresh, and organization changes reset it. Status text never relies on color alone. Keep focus visible, trap drawer focus, restore the trigger on dismissal, honor reduced motion, and retain useful print output without chrome. Check 1440, 768 and 390px.

## Assets and content

Keep the existing StudioStack wordmark intact. Nerve motifs belong only in brand/authentication areas; no illustrations behind operational data. Demo content remains explicitly labeled preview data. Do not invent production activity, counts or customer claims.
