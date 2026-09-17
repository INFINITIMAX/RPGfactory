# RF-K01b3a r3 — raport Coder

## Fișiere modificate

- `pi-ingestion.js`
- `docs/handoff/RF-K01b3a-r3-coder-raport.md`

## Corecții aplicate

- Am adăugat `INVALID_STEP_NODE` în allowlist-ul warningurilor. Lista este aliniată complet la codurile emise de `adapters/pi-subagents-contract.js`; nu au fost introduse coduri noi.
- Am aplicat limita de 128 de caractere pentru `workflowKey`. `agent` păstrează limita de 128, iar `childId` și `childRunId` păstrează limita de 256.

Corecțiile r2 rămân nemodificate: cursor v1, regresie atomică respinsă, câmpuri obligatorii per kind, rezultat fără query post-commit, CHECK-uri SQL și opțiuni sanitizate.

## Riscuri și limite

- Nu am modificat testele; testerul trebuie să acopere snapshotul cu `INVALID_STEP_NODE` și limitele 128/129 pentru `workflowKey`.
- Nu am rulat validare runtime, teste sau comenzi; rezultatul suitei și compatibilitatea SQLite rămân de verificat izolat.
- Integrarea Pi reală rămâne intenționat în afara acestui scope.

## Comenzi și teste

Confirm explicit că nu am rulat comenzi, teste, servere sau procese.
