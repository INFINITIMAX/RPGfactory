# RF-L10N-01 — final Planner validation

Date: 20-09-2026 (EET)

## Production localization

- 35 active production/current-public-document files checked.
- JavaScript syntax: PASS.
- Romanian diacritic lines in production scope: 0.
- Known Romanian user-facing phrase scan: 0 findings.
- Two references to immutable migration filename `001-profiluri.sql` are intentional contract exceptions.

## Automated tests

- Targeted localization/UI/legacy suite: **170 pass / 0 fail / 0 skip**.
- Full suite: **723 pass / 0 fail / 3 skip out of 726**.
- `git diff --check`: PASS; only LF→CRLF notices.
- Staged files: 0.
- Historical Romanian test titles/comments remain in unaffected internal tests. Affected expected messages/fixtures were updated, and permanent English-only shipping UI coverage was added in `test/localization-contract.test.mjs`.

## Browser

Current UI (`/`), 1440×900:
- `lang=en`;
- title `RPG Factory — The Living Citadel`;
- visible/accessibility copy English;
- horizontal overflow 0;
- Operations Registry modal opens with the world inert;
- console 0 errors / 0 warnings.

Legacy UI (`/game.html`), 1440×900:
- `lang=en`;
- title and heading `RPG Factory — Legacy Map`;
- visible copy English;
- horizontal overflow 0;
- console 0 errors / 0 warnings after adding a data favicon.

Evidence:
- `docs/handoff/RF-L10N-01-current-ui.png`
- `docs/handoff/RF-L10N-01-legacy-ui.png`

## Detector

Impeccable ran once as required. It was degraded because HTML parser modules are unavailable and returned existing visual-style warnings about thick decorative borders. These are unrelated to localization and do not identify mixed-language copy, overflow, accessibility-name mismatch or runtime errors. Artifact: `docs/handoff/RF-L10N-01-impeccable.json`.

## Runtime

- Server restarted with explicit prior authorization to load translated backend code.
- HTTP 200 on port 5311; server PID 49348.
- `.env` was not changed.
- Pi live-root configuration remains paused until localization/publication is complete.

## Publication

No commit or push has occurred yet. Publication waits for Reviewer verdict and exact safe manifest inspection.
