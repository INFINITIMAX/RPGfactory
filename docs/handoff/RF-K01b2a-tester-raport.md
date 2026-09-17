# RF-K01b2a — raport Tester

Data: 16-09-2026

## Fișiere create

- `test/adapters/pi-subagents-events-contract.test.mjs`
- `docs/handoff/RF-K01b2a-tester-raport.md`

## Matrice independentă

Testele exercită contractul direct cu obiecte sintetice inline și acoperă:

1. opțiuni, raw și type invalide, fără throw și cu `INVALID_EVENT` exact;
2. `UNSUPPORTED_EVENT` pentru tip necunoscut fără echo al payload-ului;
3. toate cele 15 proiecții allowlisted și envelope-ul exact versionat;
4. modurile/versiunea pentru run start și stările/durata pentru run completion;
5. run paused/stopped/timed_out/repaired, inclusiv lipsa stării inventate pentru timed-out/repaired;
6. process-terminal observed/unknown, proof invalid și mismatch nested;
7. toate tranzițiile step, limite de index/agent/exit/duration, `exitCode:null` omis;
8. child-status, câmpurile opționale, limitele și excluderea metadata de control/path;
9. control attention, ambele stări, reason/index, mismatch nested și excluderea wrapper/payload privat;
10. truncation marker ancorat la expected run, cu runId lipsă/egal/diferit/invalid;
11. mismatch direct pentru run/step/child și nested pentru process/control;
12. whitespace/control chars/lungimi și NaN/Infinity/fractional/unsafe integers;
13. plain objects cu prototype null acceptate și arrays/class instances respinse unde este necesar obiect plain;
14. agregat ostil pentru message/prompt/output/error/cwd/path/session/args/tool/usage/cost/diagnostics și dovada că outputul serializat nu le conține;
15. mutarea obiectului raw nested după normalizare, demonstrând că outputul nu păstrează referințe brute.

## Corecție acoperire după rularea planner-ului

Planner-ul a rulat prima suită: 13/13 țintit și 627 total, 626 pass, 0 fail, 1 skip moștenit RF-K01b1; serverul a rămas PID 40652. Codul nu a fost indicat ca defect, însă am completat coverage-ul cerut:

- `durationMs` invalid pentru pași terminali: negativ, fractional, NaN, Infinity și unsafe;
- `ts` invalid pentru un eveniment direct normal (`subagent.run.paused`);
- limite explicite 256/257 pentru expected/direct run ID și child ID, C1 pentru run ID, 128/129 pentru workflow key și agent opțional, 1_000_000/1_000_001 pentru child step index;
- `to` și `index` invalide pentru control și toate cele nouă reason-uri allowlisted, plus reason necunoscut.

Nu am slăbit aserțiuni și nu am modificat implementarea.

## Izolare

Fișierul de test importă numai `node:test`, `assert/strict`, `node:module` și modulul contractului. Nu importă sau folosește filesystem, tmp, DB, rețea, server ori procese copil. Nu conține artefacte sau date Pi reale.

## Limite intenționate

Nu testează JSON parsing, citirea `events.jsonl`, cursor, hash/deduplicare, rotație sau SQLite; acestea aparțin RF-K01b2b/RF-K01b3.

## Execuție

Nu am rulat comenzi sau teste și nu am accesat artefacte Pi reale.

## Corecție Tester r2

Am modificat exclusiv `test/adapters/pi-subagents-events-contract.test.mjs` și acest raport. Am adăugat exact următoarele acoperiri cerute de Reviewer:

1. `subagent.run.completed`: `lifecycleArtifactVersion` 1 și 1000 sunt proiectate ca valide; 0 și 1001 returnează exact `INVALID_EVENT`.
2. `subagent.run.completed`: un `raw.runId` valid (`other`), diferit de `expectedRunId`, returnează exact `RUN_ID_MISMATCH`.
3. `subagent.child-status.childRunId`: lungimea 256 este acceptată și proiectată; 257 și un NUL control character returnează exact `INVALID_EVENT`.

Nu am modificat implementarea și nu am adăugat acoperiri în afara acestor trei goluri. Nu am rulat validarea, comenzi sau teste; Planner-ul trebuie să le ruleze.
