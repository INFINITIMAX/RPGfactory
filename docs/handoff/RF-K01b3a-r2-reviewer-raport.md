## Review

**Verdict:** `REJECT`
**Merge:** `BLOCKED`

### Corect

- `INVALID_STEP_NODE` este acum acceptat în allowlist-ul ledgerului la `pi-ingestion.js:7-13`. Testul folosește output real din `normalizePiSubagentsStatus`, verifică warning-ul și persistă snapshot-ul la `test/pi-ingestion.test.mjs:125-136`.
- `workflowKey` are limita corectă de 128, distinctă de `childId`/`childRunId` la `pi-ingestion.js:137-140`; granița 128/129 este exercitată la `test/pi-ingestion.test.mjs:125-131`.
- Fixture-ul `run_completed` este construit independent prin normalizator și nu mai conține `mode`: `test/pi-ingestion.test.mjs:39-43`.
- Cele 15 kind-uri sunt generate prin `normalizePiSubagentsEvent` și persistate într-un singur commit: `test/pi-ingestion.test.mjs:39-54`, `test/pi-ingestion.test.mjs:95-105`.
- Replay-ul verifică usage neschimbat și canonicalizare nested: `test/pi-ingestion.test.mjs:140-150`. Cursorul same-file forward, regresia cu rollback și rotația sunt distincte: `test/pi-ingestion.test.mjs:154-167`.
- CHECK-urile SQL nu mai pot trece fals prin FK: testul creează run-uri valide înainte de cazurile `file_key`, `offset` și discard, iar `event_type` folosește run-ul existent: `test/pi-ingestion.test.mjs:186-200`.
- Migrația rămâne aditivă și definește PK/FK/CHECK/indexurile necesare: `migrations/005-pi-ingestion.sql:3-41`.
- Implementarea tranzacțională păstrează canonicalizarea, deduplicarea, regresia cursorului, lifecycle-ul autoritar și rollback-ul: `pi-ingestion.js:204-256`.
- Logul Planner-ului conține exit code 0 pentru syntax implementation/test, targeted, full și diff-check: `docs/handoff/RF-K01b3a-planner-validation.txt:2-3`, `:22`, `:734-735`. PID-ul este același înainte și după, 40652: `:1`, `:806`.
- Rularea furnizată raportează targeted 10/10 și full 657 pass, 0 fail, 2 skip din 659: `docs/handoff/RF-K01b3a-planner-validation.txt:14-22`, `:726-734`.

### Findings

1. **P1 — Matricea negativă a câmpurilor obligatorii este incompletă și contrazice raportul Tester-ului.**
   Brief-ul cere eliminarea pe rând a câmpurilor obligatorii pentru step/control/child-status la `docs/handoff/RF-K01b3a-r2-tester.md:14-16`, iar raportul afirmă că aceasta s-a făcut pentru fiecare formă la `docs/handoff/RF-K01b3a-r2-tester-raport.md:11-12`. În realitate, matricea de la `test/pi-ingestion.test.mjs:109-121` include numai `step_started` și `step_completed`; lipsesc `step_failed`, `step_paused` și `step_stopped`. Pentru formele incluse sunt eliminate numai câmpurile specifice, nu și câmpurile obligatorii comune precum `schemaVersion`, `source`, `kind`, `ts` și `runId`.
   **Impact:** mutații ale validării pentru trei dintre cele cinci forme step sau pentru câmpurile comune pot rămâne verzi. Întrebarea obligatorie 4 nu este demonstrată integral.
   **Fix minim:** extinderea matricei la toate cele cinci kind-uri step și eliminarea pe rând a tuturor câmpurilor obligatorii pentru fiecare formă step/control/child-status.

2. **P1 — Tester r2 a slăbit matricea obligatorie existentă pentru replay, limite și input ostil.**
   Brief-ul inițial cere explicit revision neschimbată, rezultatul inserted/duplicate și canonicalizarea eventului la `docs/handoff/RF-K01b3a-tester.md:28-30`. Testul curent verifică doar hash-ul snapshotului, `inserted === 0` și usage-ul la `test/pi-ingestion.test.mjs:140-150`; nu verifică revision, `duplicate`, numărul de event rows sau un event cu chei reordonate.

   Tot brief-ul cere chei necunoscute separat în snapshot/event/cursor, mismatch run, ID gol, limitele >1000 și pragurile >2 MiB/>64 KiB la `docs/handoff/RF-K01b3a-tester.md:34`. Testul curent de la `test/pi-ingestion.test.mjs:204-222` nu conține aceste cazuri. Mai mult, rularea r1 dovedește că exista anterior un test dedicat limitelor de dimensiune la `docs/handoff/RF-K01b3a-targeted-r1.txt:7-8`, în timp ce Tester r2 avea interdicția explicită de a slăbi aserțiile existente la `docs/handoff/RF-K01b3a-r2-tester.md:23`.
   **Impact:** K01B3A-5/K01B3A-8 și întrebarea obligatorie 5 nu au dovada completă cerută, chiar dacă validatorul curent pare corect la inspecția statică.
   **Fix minim:** restaurarea aserțiunilor r1 pentru limite și core commit, plus verificări explicite pentru revision, duplicate count, event canonicalization și toate cazurile ostile enumerate în brief.

### Răspunsuri la întrebările obligatorii

1. **Da.** `INVALID_STEP_NODE` real este acceptat și testat prin normalizator.
2. **Da.** `workflowKey` respectă 128/129 și are test pozitiv/negativ.
3. **Da.** Fixture-ul `run_completed` nu mai conține `mode`.
4. **Parțial.** Toate cele 15 kind-uri sunt generate prin b2a și persistate, dar negative-testing-ul câmpurilor obligatorii este incomplet.
5. **Parțial.** Usage replay, canonicalizarea nested și same-file forward sunt demonstrate; replay-ul complet și toate validările ostile obligatorii nu sunt.
6. **Da.** CHECK-urile sunt testate cu FK valid.
7. **Da.** Logul conține exit codes 0 și același PID înainte/după.
8. **Nu există regresii runtime raportate de suita completă**, dar există o regresie de acoperire prin eliminarea/slăbirea unor aserțiuni obligatorii.

## Matrice RF-K01b3a

| Gate | Status | Motiv |
|---|---|---|
| K01B3A-1 | **PASS** | Migrație aditivă cu PK/FK/CHECK/index; diff-check exit 0 și nicio migrație veche listată ca modificată. |
| K01B3A-2 | **PASS** | Deschidere lazy, opțiuni injectabile și close idempotent. |
| K01B3A-3 | **PASS** | Commit-ul tranzacțional scrie run/snapshot/events/cursor; toate cele 15 kind-uri sunt persistate. |
| K01B3A-4 | **PASS** | Lifecycle-ul provine numai din snapshot, iar snapshotul complet este păstrat. |
| K01B3A-5 | **NEDEMONSTRAT** | Lipsesc aserțiunile obligatorii pentru revision, duplicate count și canonicalizarea eventului. |
| K01B3A-6 | **PASS** | Same-file forward/regression și rotația sunt testate distinct. |
| K01B3A-7 | **PASS** | Rollback după scriere, close/reopen și starea precedentă sunt verificate. |
| K01B3A-8 | **NEDEMONSTRAT** | Validatorul arată coerent static, dar matricea obligatorie pentru required fields, limite și input ostil este incompletă. |
| K01B3A-9 | **FAIL** | Targeted/full sunt verzi și PID-ul este păstrat, însă review-ul nu poate accepta suita obligatorie incompletă. |

## Evaluare cod

Nu am identificat un defect funcțional nou în implementarea curentă. Cele două corecții cerute după primul review sunt aplicate corect, iar tranzacția, canonicalizarea și sanitizarea erorilor rămân coerente.

## Evaluare teste

Noile teste repară fixture-ul invalid și acoperă principalele remedieri, dar nu păstrează integral matricea anterioară și nu îndeplinesc toate cerințele explicite ale brief-urilor Tester. Deoarece brief-ul de re-review declară blocant orice P1 sau gate nedemonstrat, suita nu poate fi acceptată încă.

## Riscuri reziduale

- Starea Git și lipsa fișierelor staged sunt atestate numai prin logul Planner-ului, nu verificate independent de reviewer.
- Suita completă are două skip-uri dependente de mediu.
- Integrarea cu Pi real rămâne intenționat în afara scope-ului.
- Lipsa testelor enumerate lasă posibile regresii viitoare în validator nedetectate.

## Comenzi și modificări

Nu am rulat nicio comandă și nu am modificat niciun fișier.

## Decizia Planner-ului

Respingerea este acceptată integral. Codul este considerat reparat static; cele două P1 privesc exclusiv matricea Tester-ului. RF-K01b3a rămâne deschis și merge la Tester r3, apoi la validare și re-review fresh.
