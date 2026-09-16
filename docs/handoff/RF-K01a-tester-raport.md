# RF-K01a — raport Tester independent

Data: 16-09-2026

## Fișiere scrise

- `test/adapters/pi-subagents-contract.test.mjs`
- `test/fixtures/pi-subagents/single.json`
- `test/fixtures/pi-subagents/workflow-nested.json`
- `test/fixtures/pi-subagents/terminal.json`
- `test/fixtures/pi-subagents/hostile.json`
- `test/fixtures/pi-subagents/limits.json`

Toate fixture-urile sunt obiecte JSON sintetice, create pentru acest contract. Nu conțin conversații, căi sau artefacte Pi reale.

## Acoperire independentă

1. **Single** verifică forma versionată, `source`, `observedAt`, root separat, listă goală de copii și proiecția exactă allowlisted a unui root cu `TokenUsage` complet.
2. **Workflow + nested** verifică schema Pi: `status`/`tokens` numai pentru step, `state`/`totalTokens` pentru root și nested, `activityState`, `children`, ordinea flatten deterministică și relațiile parent. Aliasurile `usage`, `nested` și booleenele legacy sunt capcane explicite care trebuie ignorate.
3. **Terminal** verifică maparea stărilor canonice, inclusiv `complete`/`completed`, plus faptul că `partial` și `rejected` devin `unknown` cu warning, nu succes.
4. **Usage/activity** verifică câmpurile token allowlisted, valori finite nenegative, omiterea valorilor invalide, lipsa de agregare între scope-uri, scalar invalid, activity/model absent și warning-ul pentru usage invalid.
5. **Identitate** verifică fallback-uri deterministe pentru step/nested, prioritatea `parentRunId` valid și omiterea duplicatelor cu warning.
6. **Limits** verifică truncarea de adâncime și număr, precum și fallback-urile sigure și warning-urile pentru opțiuni invalide.
7. **Input invalid** verifică obiecte/formate lipsă sau invalide, răspunsul exact `{ ok:false, error:{ code:'INVALID_STATUS' } }`, lipsa throw-ului și lipsa ecoului de conținut brut în eroare.
8. **Hostile** verifică allowlist-ul la root, step și nested contra prompt/task/description/args/output/error/căi/chei necunoscute; verifică eliminarea tool-urilor care seamănă a path sau conțin control chars și truncarea textului bounded.

Aceste teste ar detecta, între altele, regresia la proprietățile Pi greșite (`state` pe step, `usage`, `nested`, booleene legacy), agregarea tokenurilor, expunerea accidentală a datelor private, acceptarea scalarilor de usage, pierderea părintelui structural, suprascrierea duplicatelor și ignorarea limitelor.

## Izolare

Testul importă numai modulul pur și fixture-uri JSON statice din repo. Nu conține acces la sesiuni Pi reale, home directory, artefacte lifecycle, SQLite, rețea, server, UI sau procese.

## Rulare

Nu am rulat comenzi, teste, procese sau servere. Nu afirm că testele trec; planner-ul trebuie să execute probele și suita.
