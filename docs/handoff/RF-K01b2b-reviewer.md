# RF-K01b2b — brief Reviewer read-only

Data: 16-09-2026

## Rol

Review read-only asupra implementării și testelor. Nu modifica fișiere și nu rula comenzi. Întoarce verdictul integral; Planner-ul îl transcrie.

## Citește

- `spec.md`, RF-K01b2b;
- `GATES.md`, K01B2B-1…8;
- `docs/handoff/RF-K01b2b-coder.md`, `RF-K01b2b-r2-coder.md`, `RF-K01b2b-r3-coder.md` și raportul Coder;
- `docs/handoff/RF-K01b2b-tester.md`, `RF-K01b2b-tester-fix.md` și raportul Tester;
- `adapters/pi-subagents-events-file.js`;
- `adapters/pi-subagents-events-contract.js`;
- `test/adapters/pi-subagents-events-file.test.mjs`.

## Dovezi Planner

- prima rulare Tester: 15 total, 13 pass, 2 fail din fixture-uri lexically-outside, implementarea neindicată ca defectă;
- după corecție: țintit 16 total, 15 pass, 0 fail, 1 skip explicit (`events.jsonl` file symlink, Windows EPERM);
- complet: 644 total, 642 pass, 0 fail, 2 skip (skip-ul b2b + skip-ul b1 existent);
- syntax și `git diff --check`: PASS;
- server PID înainte/după: 40652;
- numai filesystem temporar sintetic; fără Pi real, home/config, DB, rețea, server sau child process.

## Verifică explicit

1. Opțiuni/cursor și shape versionat, path-free; cursorul nu conține payload.
2. Root/run/file containment și identitate, TOCTOU, `O_NOFOLLOW`, descriptor-only read și close garantat.
3. Limitele bytes/event/lines și faptul că input invalid consumă buget înainte de parse.
4. Cursor fără loss/replay pentru complete/incomplete/window/line limit.
5. Oversized incremental, inclusiv EOF, mai multe ferestre și revenirea la evenimentul imediat următor fără offset dublu.
6. Rotation/truncation/read failure/premature read și păstrarea cursorului/reset-ului corect.
7. UTF-8/JSON/normalizare b2a și absența paths, raw errors, payload privat și unknown fields.
8. Snapshot-ul rămâne autoritar; fără DB/server/UI/discovery implicit/write side effects.
9. Calitatea testelor: semnalează teste redundante/always-pass, fixture-uri fragile sau coverage declarat dar necertificat. Evaluează explicit dacă testul combinat de link-uri, marcat integral skip când file-symlink primește EPERM după ce root/run assertions au rulat, trebuie separat pentru dovadă clară.
10. Identifică findings cu severitate, fișier și linii; nu accepta doar fiindcă suitele trec.

## Format obligatoriu

- `VERDICT: ACCEPT` sau `VERDICT: REJECT`;
- findings ordonate după severitate;
- evaluare separată Coder/Tester;
- residual risks;
- `Merge verdict: OK` sau `Merge verdict: BLOCKED`.
