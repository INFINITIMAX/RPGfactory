# RF-K01b1 r2 — brief Reviewer read-only

Data: 16-09-2026

## Rol

Re-review read-only al implementării și testelor după verdictul REJECT. Nu modifica fișiere și nu rula comenzi. Întoarce verdictul integral; planner-ul îl transcrie.

## Citește

- `docs/handoff/RF-K01b1-reviewer-raport.md` — findings inițiale și decizia planner;
- `docs/handoff/RF-K01b1-r2-coder.md` și raportul r2;
- `docs/handoff/RF-K01b1-r2-tester.md`, fix-ul și raportul r2;
- `adapters/pi-subagents-files.js`;
- `test/adapters/pi-subagents-files.test.mjs`;
- gates RF-K01b1 din `GATES.md` și contractul din `spec.md`.

## Schimbarea r2

- `status.json` este deschis cu FD stabil, `O_RDONLY | O_NOFOLLOW` când constanta există;
- `fstat` verifică regular file și identitatea `dev`/`ino` față de `lstat`;
- citirea folosește numai FD-ul și buffer `maxStatusBytes + 1`;
- FD-ul este închis în `finally`;
- testele noi simulează swap-ul directorului către junction extern înainte de open, creșterea după fstat, închiderea FD pe respingere și link candidat care consumă buget.

## Dovezi planner

- probe adversariale proprii TOCTOU/growth/candidate-link: PASS;
- prima țintită r2: 14 pass, 1 fixture fail (65 bytes la limită 64), 1 skip; server PID 40652;
- după corecția fixture-ului: țintit 16 total, 15 pass, 0 fail, 1 skip explicit file-symlink `EPERM`;
- complet: 611 total, 610 pass, 0 fail, 1 skip;
- PID server înainte/după: 40652;
- `node --check` implementare/teste și `git diff --check`: PASS.

## Verifică explicit

1. Finding-ul MAJOR TOCTOU este rezolvat real, inclusiv când `O_NOFOLLOW` lipsește.
2. Citirea nu poate depăși `maxStatusBytes + 1`, nici dacă fișierul crește.
3. Identity check, mapping-ul warning-urilor și close-ul descriptorului sunt corecte pe toate ramurile.
4. Finding-ul MINOR candidate-link/buget este acoperit semnificativ.
5. Monkeypatch-urile testelor sunt restaurate sigur și testele nu pot trece indiferent de cod.
6. Nu există regresie de API, privacy, determinism, scope sau side effects.
7. Identifică orice blocker/major/minor nou cu fișier și linii.

## Format obligatoriu

- `VERDICT: ACCEPT` sau `VERDICT: REJECT`;
- findings ordonate după severitate;
- evaluare Coder și Tester;
- residual risks;
- `Merge verdict: OK` sau `Merge verdict: BLOCKED`.
