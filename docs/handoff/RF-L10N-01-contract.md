# RF-L10N-01 — English-only product contract

Date: 19-09-2026 (EET)

## Intent

RPG Factory has no Romanian target audience. Every shipping surface and actively maintained public repository surface must use English consistently.

## In scope

1. Current RF-K02 UI: `public/index.html`, `public/hud.js`, `public/world.js`, user-visible CSS comments when maintained.
2. Legacy UI: `public/game.html`, `public/game.js`, `public/game.css`, plus actively maintained helper comments in `public/merge-state.js` and `public/zones.js`.
3. User/developer-facing runtime messages in production JavaScript: API validation/conflict/internal messages, console diagnostics and startup output.
4. Current tests: fixtures and exact expectations affected by translated contracts, plus permanent English-only UI regression coverage. Existing historical test titles/comments may remain as internal evidence when translating them would create a high-risk, non-product diff.
5. Public/current documentation: `README.md`, `public/fonts/README.md`, `PRODUCT.md`, `DESIGN.md`.
6. HTML locale metadata and every accessible name/status/help/error/loading/empty-state string.

## Explicit exceptions

- Do not edit existing migration files or rename them: their digests and filenames are database history.
- Do not translate user-provided/stored values such as profile names, specializations, projects or external role/activity values.
- Do not rewrite historical evidence: `docs/handoff/`, historical audits, `JURNAL.md` entries, `TASKS.md` history and archived governance remain source records. New coordination records may remain Romanian for Lucian.
- Do not rename API fields, event names, enum values, database columns/tables, DOM IDs, CSS classes or opaque IDs.

## Terminology

- Cetatea vie → The Living Citadel
- Regatul Pi → Pi Kingdom
- Registru → Registry
- Registru operațional → Operations Registry
- Jurnalul misiunii → Mission Ledger
- Predări confirmate → Confirmed Handoffs
- Seiful dovezilor → Evidence Vault
- Ierarhie și stare → Hierarchy and Status
- Specialist / Profil → Specialist / Profile
- Sesiune observată → Observed Run
- Dovadă → Evidence
- Proiect local → Local project
- Centru → Center

Use `run`, not `session`, when referring to canonical observed runs in the new UI. The legacy screen may retain `session` where it directly opens a harness session.

## UX rules

- Controls use direct verb + object labels.
- Errors state what failed and, when possible, what to do next.
- Loading/empty/stale/disconnected remain distinct and truthful.
- Accessible names match visible labels and outcomes.
- No concatenated Romanian fragments remain in rendered text.
- External data remains literal and safe via `textContent`/existing safe paths.

## Gates

- `lang="en"` on both shipped HTML documents.
- No Romanian user-visible strings in current or legacy UI.
- No Romanian runtime error/validation/startup messages in production JS.
- Current production source comments are English; affected test contracts are English and historical test prose is explicitly non-shipping/internal.
- Tests preserve privacy and behavior; translation must not restore native IDs, raw private errors or targets.
- Full suite passes.
- Browser checks current UI and legacy UI with zero console errors/warnings caused by localization.
- Reviewer confirms no mixed-language UI and no contract drift.

## Hard constraints

No backend shape/schema/behavior change, no data migration, no `.env` change, no server restart, no commit/merge/push. Only Planner runs commands.
