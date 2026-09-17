# RF-K01b2a — corecție Tester r2

Data: 16-09-2026

## Sarcină

Modifică exclusiv `test/adapters/pi-subagents-events-contract.test.mjs` și actualizează la final `docs/handoff/RF-K01b2a-tester-raport.md`.

Adaugă strict cele trei acoperiri cerute de Reviewer:

1. Pentru `run.completed`, verifică `lifecycleArtifactVersion` la limitele valide 1 și 1000 și invalide 0 și 1001 (ramura distinctă a normalizatorului).
2. Adaugă mismatch direct pentru un eveniment lifecycle run: `raw.runId` valid, dar diferit de `expectedRunId`, cu `RUN_ID_MISMATCH`.
3. Pentru `subagent.child-status.childRunId`, verifică lungimile 256 validă și 257 invalidă, plus control characters invalid.

## Constrângeri

- Nu modifica implementarea sau alte fișiere.
- Folosește numai date sintetice.
- Fără filesystem, home/config, DB, rețea, server sau child process.
- Nu rula comenzi sau teste; Planner-ul le rulează.
- Nu adăuga teste redundante în afara celor trei goluri.
- Raportul trebuie să enumere exact ce ai adăugat și să precizeze explicit că nu ai rulat validarea.
