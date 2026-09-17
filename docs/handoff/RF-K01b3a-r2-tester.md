# RF-K01b3a r2 — completare Tester după Reviewer

Data: 17-09-2026
Rol: același Tester reluat (scrie teste; NU rulează comenzi/teste)

Citește raportul integral `docs/handoff/RF-K01b3a-reviewer-raport.md` și logul primei rulări țintite `docs/handoff/RF-K01b3a-targeted-r1.txt`. Modifică numai `test/pi-ingestion.test.mjs` și scrie `docs/handoff/RF-K01b3a-r2-tester-raport.md`.

## Repară fixture-ul existent

Testul `run_completed` pornește din fixture-ul `run_started` și păstrează accidental `mode`, deci inputul este invalid. Construiește fiecare event exact după contract; ideal generează formele prin `normalizePiSubagentsEvent` din b2a, nu prin mutații care lasă chei străine.

## Acoperire obligatorie lipsă

1. Matrice tabelară pentru toate cele 15 kind-uri b2a, generate prin normalizatorul acceptat și persistate cu succes.
2. Pentru step/control/child-status, elimină pe rând câmpurile obligatorii și dovedește `VALIDATION`.
3. `workflowKey`: 128 acceptat, 129 respins; adaugă și regresia `INVALID_STEP_NODE` folosind output real din `normalizePiSubagentsStatus` cu step invalid.
4. Replay: verifică explicit că `root.usage` rămâne exact același și nu este însumat; adaugă canonicalizare nested, nu doar top-level.
5. Cursor: dovedește same-file forward, apoi regression rollback și rotation reset.
6. Validări ostile tabelare: control chars; ID 256/257; NaN; Infinity; unsafe integer; negative unde sunt interzise; lifecycle/enum invalid; fiecare categorie privată cerută (`task`, `prompt`, `message`, `output`, `error`, `path`, `cwd`, `sessionPath`, `url`, nested unknown).
7. CHECK-urile SQL pentru `file_key`, `offset`, discard și event_type trebuie testate separat cu un `run_id` existent, astfel încât FK-ul să nu poată produce fals pozitiv.
8. Păstrează testele sintetice, cleanup în `finally`, zero Pi real/home/config/network/server/child process.

Nu slăbi aserțiile existente și nu modifica implementarea.

## Raport

Descrie matricea completată, fixture-ul reparat și confirmă că nu ai rulat comenzi/teste.
