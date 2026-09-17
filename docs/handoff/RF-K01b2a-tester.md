# RF-K01b2a — brief Tester

Data: 16-09-2026

## Sarcina

Scrie teste independente pentru `adapters/pi-subagents-events-contract.js` conform spec/gates/brief Coder. Planner-ul a verificat sintaxa; o probă matrix inline a fost blocată de guardrail înainte de execuție și nu a fost reluată. Testele tale sunt prima dovadă comportamentală completă.

## Fișiere permise

- creează `test/adapters/pi-subagents-events-contract.test.mjs`;
- opțional fixture-uri exclusiv sintetice sub `test/fixtures/pi-subagents-events/`;
- scrie `docs/handoff/RF-K01b2a-tester-raport.md`.

Nu modifica implementarea sau alte fișiere.

## Acoperire obligatorie

Folosește `node:test` și `assert/strict`. Fără filesystem, os/tmp, DB, rețea, server sau procese copil; contractul este pur și fixture-urile pot fi inline.

1. options/raw/type lipsă sau tipuri greșite → exact `INVALID_EVENT`, fără throw;
2. tip string necunoscut → exact `UNSUPPORTED_EVENT`, fără ecou de payload;
3. toate cele 15 kinds definite în brief au caz pozitiv și envelope exact/versionat;
4. run started: toate modurile, artifact version valid/invalid, cwd/task private omise;
5. run completed: `complete→completed`, fiecare status permis, status necunoscut invalid, duration/version bounds;
6. paused/stopped/timed_out/repaired: output exact; message/timeout/deadline/pid/resultPath omise; timed_out/repaired nu inventează state;
7. process-terminal: observed/unknown, runId nested mismatch, proof invalid, diagnostic/process IDs/reason omise;
8. cele cinci step events: index/agent bounds, terminal exit/duration, `exitCode:null` omis, NaN/Infinity/out-of-range invalide, tokens/task/output/error omise;
9. child-status: version/status obligatorii; câmpurile opționale valide; child ID/run ID/workflow key/control chars/bounds; reason/phase/label/source/asyncDir omise;
10. control: citește numai `event`; ambele attention values, reason enum, index; runId nested mismatch; message/taskPreview/recentFailure/currentPath/tool/counters/workflow labels și wrapper notice/channels/targets omise;
11. truncation marker: se ancorează din expectedRunId fără raw runId; raw runId egal acceptat, diferit mismatch, invalid invalid; maxBytes/dropped type omise;
12. mismatch direct pe run/step/child și nested pe process/control → exact `RUN_ID_MISMATCH`;
13. IDs/string-uri: empty, whitespace exterior, C0/C1, peste limită; numerice: negative, fractional, NaN, Infinity, unsafe;
14. un test hostile agregat pune markeri privați în fiecare familie exclusă și dovedește că nu apar nicăieri în output serializat;
15. input cu prototype null este acceptat dacă valid; arrays/class instances sunt respinse ca obiecte nested unde plain object este cerut;
16. output-ul nu păstrează nicio referință nested brută care poate fi mutată după normalizare.

Nu testa JSON parsing, files, cursor, hash/dedup, rotație sau SQLite — aparțin b2b/b3.

## Constrângeri

- Nu rula comenzi/teste; planner-ul rulează și transmite rezultatul.
- Nu importa/folosi `fs`, `os`, `child_process`, network sau server modules.
- Nu copia date reale Pi.
- Testele trebuie să eșueze dacă implementarea face spread/copiază payload privat sau relaxează mismatch/limitele.

## Raport

În `docs/handoff/RF-K01b2a-tester-raport.md` descrie matricea, privacy/mismatch/bounds, independența și confirmă că nu ai rulat nimic.
