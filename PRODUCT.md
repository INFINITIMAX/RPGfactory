# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lucian is the primary user. He uses the application locally while working with multiple Pi and Claude Code agents to quickly understand who is working, who is coordinating, who needs intervention, and where blockers or missing data exist.

## Product Purpose

RPG Factory is a local observability and profile-management console for real agents. Success means the fleet state can be understood at a glance and an agent, project, task, or incident can be inspected without reading raw transcripts.

## Positioning

The product projects real Pi and Claude Code runs—with persistent identity, provenance, and operational truth—into a 2D medieval world where a repository is a kingdom and a specialist is a stable character. The map is not decoration: it is a navigable projection of the fleet.

## Operating Context

- runs locally on loopback in the browser;
- the Pi/Claude planner directs the work; RPG Factory observes and explains rather than becoming a scheduler;
- profile, run, process, hierarchy, activity, attention, and freshness are distinct concepts;
- missing data remains `unknown`/unavailable rather than being invented;
- Bot Crossing is the primary functional reference, adapted to 2D.

## Capabilities and Constraints

- Available: Node server, SQLite, profiles/configurations, associable runs, Claude Code and Pi adapters, a live Pi kingdom with hierarchy/freshness/attention, plus allowlisted mission/proof reading and persistence.
- Still missing: visible mission/proof data in the kingdom, visible handoffs, an explicit reporter, complete usage/cost, interventions, and complete records.
- Requirement confirmed by Lucian on 16-09-2026: the product must show actual work in progress, not merely that an agent is `running`. Steps/activity are shown only when they come from a real integration; until the Pi adapter supplies them, they remain explicitly unavailable.
- One repository is one kingdom that can expand through adjacent hexagons.
- The required order is single-kingdom-first: one project must be demonstrated as complete and alive before multi-kingdom navigation.
- The first kingdom shows real Pi runs and their real hierarchy; mining appears only for confirmed work, and gold represents discrete, inspectable evidence.
- The map is dominant, with a compact operations HUD on the right and an inspector shared by map/list selection.
- All specialists initially use the Pawn form; future size scaling uses only recent own usage, up to 2×.
- Functions are not removed to simplify appearance.
- The existing stack remains Node + HTML/CSS/JavaScript + Canvas 2D; no new framework without a demonstrated reason.
- The product is desktop-first; narrow viewports must remain readable and usable without redefining the primary experience.

## Brand Commitments

- Name: RPG Factory.
- A top-down 2D medieval world with slightly frontal characters and buildings.
- Tiny Swords is the established art direction and locally available asset; its custom license does not permit implicit publication.
- Menus use the locally available Tiny Swords assets (WoodTable, papers, banners, ribbons, buttons, and bars), not a separate generic modern layer.
- Operational text, tables, and statuses remain highly readable, accessible DOM content over the medieval composition.
- Preferred structural palette: blue planner, yellow direct agent, purple subagent; attention states use shape/symbol rather than changing these color meanings.

## Evidence on Hand

- Confirmed requirements: `intent.md`, `docs/DECISIONS.md`.
- Technical contract: `spec.md`.
- Current audit: `docs/AUDIT-16-09-2026.md`.
- Parity inventory: `docs/PARITY.md`.
- Live implementation at `http://127.0.0.1:5311/`.
- Local sprites in `public/sprites/`; they are not on GitHub.
- Live Pi hierarchy is available when explicit roots are configured; visible mission/proof data is added in RF-K01d. Tasks, unconfirmed handoffs, and missing usage must not be simulated as truth.

## Product Principles

1. Operational truth before spectacle.
2. Agent work must be inspectable while it happens; a simple `running` light is not enough.
3. One complete and convincing kingdom precedes any multi-kingdom expansion.
4. The map is an orientation and selection tool, not a decorative background.
5. Unknown, stale, waiting, and blocked remain distinct.
6. Profiles and positions are stable; runs are temporary.
7. Every important state must be understandable without color or animation alone.

## Accessibility & Inclusion

The interface must support keyboard operation, visible focus, a DOM alternative for Canvas information, WCAG AA contrast, and explicit `prefers-reduced-motion` behavior.
