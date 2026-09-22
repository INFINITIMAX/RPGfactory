# RPG Factory

RPG Factory is a local 2D medieval observability console for real Pi and Claude Code agents. It projects verified lifecycle, hierarchy, freshness, missions, proofs, and confirmed handoffs into **The Living Citadel**.

The product favors truth over spectacle:

- only fresh, running nodes animate;
- stale or terminal work is never presented as active;
- each allowlisted proof maps to exactly one gold object;
- handoffs appear only when the source data confirms their order;
- native IDs, paths, prompts, outputs, private URLs, and proof targets stay out of the public API and UI.

## Requirements

- Node.js 24+
- A local `.env` file
- Optional explicit Pi run and mission roots
- Local art assets for the full visual presentation

## Run

```powershell
npm start
```

The default local address is:

```text
http://127.0.0.1:5311/
```

The server is loopback-only. Pi integration is opt-in through absolute paths in `.env`:

```text
PI_SUBAGENTS_ROOTS=
PI_SUBAGENTS_MISSION_ROOT=
```

Do not commit `.env` or runtime data.

## Test

```powershell
npm test
```

Tests use temporary storage and ephemeral ports. Environment-dependent symlink coverage may be skipped on Windows when the OS denies symlink creation.

## Architecture

- Native Node.js HTTP server
- SQLite through `node:sqlite`
- Canvas 2D world with an accessible DOM registry
- Bounded, read-only Pi artifact readers
- Opaque public identifiers and allowlisted projections
- Legacy `/game.html` surface retained for compatibility

## Art and privacy

Tiny Swords assets, exported sprites, private inspiration, databases, sessions, logs, screenshots, and `.env` files are intentionally excluded from Git. A clean clone runs the public code but does not reproduce the locally licensed visual assets automatically.

RPG Factory is behaviorally inspired by [Bot Crossing](https://github.com/Station-Sciences/bot-crossing). Selective reuse must preserve its MIT attribution. RPG Factory does not copy Bot Crossing's 3D renderer or data model.

## Current status

The single-kingdom release, mission board, Living Citadel redesign, and English product UI are published on `master`. The next operational milestone is a bounded live Pi workflow demonstration using explicit read-only roots.
