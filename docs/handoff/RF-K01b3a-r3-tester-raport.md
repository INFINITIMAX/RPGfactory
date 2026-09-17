# RF-K01b3a r3 — raport Tester

## Fișiere modificate

- `test/pi-ingestion.test.mjs`
- `docs/handoff/RF-K01b3a-r3-tester-raport.md`

## Acoperire adăugată/restaurată

Am păstrat toate testele și aserțiunile existente și am adăugat trei teste r3:

1. **Matrice completă required fields.** Pentru `step_started`, `step_completed`, `step_failed`, `step_paused`, `step_stopped`, `control_attention` și `child_status`, fiecare fixture pornește din output b2a normalizat. Testul elimină pe rând fiecare câmp obligatoriu comun (`schemaVersion`, `source`, `kind`, `ts`, `runId`) și fiecare câmp obligatoriu specific, apoi cere `VALIDATION`.
2. **Replay complet.** Pe lângă canonicalizarea nested și usage-ul root deja păstrate, testul nou reface același event cu ordinea cheilor schimbată și verifică `inserted: 0`, `duplicate: 1`, un singur event row și `runs.revision === 1`.
3. **Matrice ostilă și limite restaurată.** Testul separă cheile necunoscute în snapshot/event/cursor, run mismatch, ID gol/control/256/257, NaN, Infinity, integer unsafe, negativ, lifecycle/mode/child-status invalid, 1001 events, 1001 children, snapshot allowlisted peste 2 MiB, încercarea de event peste 64 KiB, toate cele nouă categorii private și unknown nested. Confirmă și opțiunile store `null`/non-object. Pentru fiecare input invalid cere mesaj `VALIDATION` fără secret, cale temporară sau SQL.

Testele anterioare pentru schema cu FK valid, 15 kind-uri, workflowKey 128/129, `INVALID_STEP_NODE`, lifecycle autoritar, close/reopen, rollback SQLite/PERSISTENCE și cursor same-file/rotație rămân nemodificate.

## Constrângeri respectate

Toate fixture-urile sunt sintetice. Fiecare test curăță handle-uri și directoare temporare prin `finally`. Nu sunt accesate artefacte Pi reale, home/config, rețea sau server și nu sunt create procese.

## Riscuri rămase

- Nu am rulat comenzi sau teste; Planner-ul trebuie să ruleze testul țintit și suita completă izolată înainte de re-review.
- Nu am verificat Git/staged files, deoarece rolul Tester nu poate rula comenzi.

## Comenzi și teste

Confirm explicit că nu am rulat comenzi, teste, servere sau procese.
