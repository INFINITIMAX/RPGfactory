## Review

**Verdict:** `REJECT`
**Merge:** `BLOCKED`

### Corect

- Migrația este structural aditivă și definește tabele separate pentru snapshot, evenimente și cursor, cu PK/FK, validare JSON, tipuri de eveniment și index temporal: `migrations/005-pi-ingestion.sql:3-46`.
- Store-ul este lazy și injectabil; `openDatabase()` este apelat numai prin `getDb()`, iar `close()` este idempotent: `pi-ingestion.js:173-198`.
- Tranzacția grupează run, snapshot, evenimente și cursor, iar lifecycle-ul este luat exclusiv din snapshot: `pi-ingestion.js:207-251`.
- Hashing-ul canonic, deduplicarea evenimentelor și verificarea regresiei cursorului sunt implementate coerent: `pi-ingestion.js:155-171`, `pi-ingestion.js:211-244`.
- Erorile publice sunt înlocuite cu mesaje stabile, fără SQL, căi sau payload brut: `pi-ingestion.js:55-59`, `pi-ingestion.js:252-256`.
- Testele folosesc DB-uri temporare sintetice și cleanup în `finally`; rollback-ul SQLite este injectat după scrieri: `test/pi-ingestion.test.mjs:16-22`, `test/pi-ingestion.test.mjs:164-182`.

### Findings

1. **P1 — Un snapshot valid produs de contractul RF-K01a poate fi respins de ledger.**
   `adapters/pi-subagents-contract.js:203-206` produce warning-ul allowlisted `INVALID_STEP_NODE` când întâlnește un element step invalid, dar `WARNING_CODES` din `pi-ingestion.js:7-13` îl omite. Validarea respinge apoi orice warning absent din acel set la `pi-ingestion.js:124`.
   **Impact:** o observație normalizată cu succes de adaptor nu poate fi comisă; cursorul nu avansează și aceeași intrare poate bloca repetat ingestia.
   **Fix minim:** adăugarea `INVALID_STEP_NODE` în allowlist și un test care normalizează un status cu step invalid, apoi persistă rezultatul.

2. **P1 — Validarea `workflowKey` nu respectă limita contractului b2a.**
   Contractul evenimentelor limitează `workflowKey` la 128 caractere în `adapters/pi-subagents-events-contract.js:5,177-180`. Ledger-ul aplică însă limita generică de 256 pentru `workflowKey` la `pi-ingestion.js:137-138`.
   **Impact:** store-ul acceptă și persistă evenimente care nu pot proveni din contractul b2a acceptat, contrar cerinței de validare strictă a formei normalizate.
   **Fix minim:** limită specifică de 128 pentru `workflowKey` și regresie la 128/129 caractere.

3. **P1 — Suita Tester-ului nu acoperă matricea minimă obligatorie și poate rămâne verde pentru implementări defecte.**
   - Fixture-ul implicit produce numai `run_started`, iar singura altă formă exercitată este `run_completed`: `test/pi-ingestion.test.mjs:39-43`, `test/pi-ingestion.test.mjs:97-103`. Lipsesc formele step/control/child-status și verificările câmpurilor obligatorii.
   - Replay-ul verifică numărul de evenimente, hash-ul și revision, dar nu verifică explicit că usage-ul a rămas neschimbat: `test/pi-ingestion.test.mjs:120-139`, deși brief-ul cere asta la `docs/handoff/RF-K01b3a-tester.md:28`.
   - Testul cursorului verifică regresie și rotație, dar nu same-file forward, cerut la `docs/handoff/RF-K01b3a-tester.md:31`; `test/pi-ingestion.test.mjs:143-160`.
   - Cazurile ostile din `test/pi-ingestion.test.mjs:189-200` omit control chars, ID overlong, NaN, unsafe/negative, enum lifecycle invalid și majoritatea cheilor private enumerate explicit în `docs/handoff/RF-K01b3a-tester.md:34`.
   - Verificarea CHECK pentru cursor la `test/pi-ingestion.test.mjs:91` folosește `run_id='missing'`; inserarea eșuează oricum pe FK, deci testul ar trece chiar dacă CHECK-urile pentru `file_key` și `offset` ar lipsi.

   **Fix minim:** teste tabelare pentru toate cele 15 kind-uri și câmpurile obligatorii, cazurile ostile cerute, usage după replay, canonicalizare nested, same-file forward și verificări SQL izolate folosind un `run_id` existent.

4. **P1 — Dovada Planner-ului nu demonstrează nicio execuție și nici păstrarea serverului.**
   `docs/handoff/RF-K01b3a-planner-validation.txt:1-2` conține doar antetul și `SERVER_BEFORE=40652`. Lipsesc rezultatele testului țintit, suitei complete, verificării de sintaxă/diff și `SERVER_AFTER`.
   **Impact:** K01B3A-9 este nedemonstrat, iar lipsa diff-check-ului împiedică atestarea că migrațiile anterioare și suprafețele din afara ownership-ului nu au fost modificate.
   **Fix minim:** Planner-ul trebuie să ruleze probele autorizate, să înregistreze comenzile, exit codes, sumarul target/full suite și PID-ul serverului după probe.

## Matrice RF-K01b3a

| Gate | Status | Motiv |
|---|---|---|
| K01B3A-1 | **NEDEMONSTRAT** | Schema 005 arată corect static, dar lipsesc diff-check-ul și dovada că migrațiile vechi nu au fost editate. |
| K01B3A-2 | **PASS** | Deschidere lazy, opțiuni injectabile și close idempotent în cod. |
| K01B3A-3 | **FAIL** | Snapshot valid RF-K01a cu `INVALID_STEP_NODE` este respins. |
| K01B3A-4 | **PASS** | Numai snapshot-ul actualizează lifecycle; relațiile sunt păstrate în snapshot. |
| K01B3A-5 | **PASS** | Implementarea canonică/deduplicarea sunt coerente static; acoperirea testului de usage rămâne insuficientă. |
| K01B3A-6 | **PASS** | Regresia same-file este refuzată; fileKey nou permite reset. |
| K01B3A-7 | **PASS** | Tranzacția, rollback-ul și redeschiderea sunt implementate și au teste relevante, încă nerulate. |
| K01B3A-8 | **FAIL** | Limita `workflowKey` este mai permisivă decât contractul b2a. |
| K01B3A-9 | **NEDEMONSTRAT** | Nu există rezultate target/full suite, diff/syntax check sau `SERVER_AFTER`. |

## Evaluare cod

Codul are o structură bună pentru tranzacție, idempotency, recovery și sanitizarea erorilor. Totuși, incompatibilitatea cu warning-ul real RF-K01a și limita greșită pentru `workflowKey` încalcă exact contractele pe care ledger-ul trebuie să le persiste.

## Evaluare teste

Testele acoperă traseele principale, rollback-ul SQLite și recovery, dar nu îndeplinesc matricea minimă impusă. Unele defecte de validator și de schemă ar putea trece fără a fi detectate. În plus, nu există dovadă că testele au fost executate.

## Riscuri reziduale

- Starea Git, ownership-ul real al diff-ului și lipsa fișierelor staged nu au putut fi verificate fără comenzi.
- Compatibilitatea runtime SQLite și rezultatul suitei complete rămân necunoscute.
- Nu există dovadă `SERVER_AFTER`; păstrarea serverului existent este neatestată.
- Integrarea cu Pi real rămâne intenționat în afara scope-ului.

## Comenzi

Nu am rulat nicio comandă și nu am modificat niciun fișier.

## Decizia Planner-ului

Respingerea este acceptată integral. Findings 1-4 sunt valide. RF-K01b3a rămâne deschis; implementarea merge la Coder r3, matricea de teste la Tester r2, apoi Planner-ul rulează din nou probele înainte de re-review.
