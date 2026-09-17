# RF-K01b3a — raport Coder

## Fișiere modificate

- `migrations/005-pi-ingestion.sql`
- `pi-ingestion.js`
- `docs/handoff/RF-K01b3a-coder-raport.md`

## Schema și API livrat

Migrația aditivă creează tabelele `pi_run_snapshots`, `pi_run_events` și `pi_run_cursors`. Instantaneele sunt unice pe run, evenimentele sunt unice după hash, iar cursorul este unic pe run; indexul de evenimente păstrează interogarea după run și timp. Cheile străine trimit la `runs`, iar schema verifică JSON-ul, lungimea hash-urilor, offsetul nenegativ și valoarea booleană persistată a markerului de linie supradimensionată.

`pi-ingestion.js` exportă `createPiIngestionStore({ dbPath, migrationsDir, now })`. Baza se deschide lazy prin `openDatabase()` și `close()` este idempotent. Store-ul expune `commitObservation`, `getCursor`, `getSnapshot`, `listEvents` și `close`.

## Validare, idempotency și rollback

Store-ul acceptă numai forma allowlisted a snapshotului Pi și a evenimentelor normalizate, respinge cheile necunoscute, identificatorii cu caractere de control, valorile numerice nesigure, limitele de copii/evenimente și payloadurile canonice prea mari. Cursorul cere `fileKey` SHA-256 lowercase și offset safe; markerul de discard este păstrat.

JSON-ul este canonicalizat recursiv cu chei sortate și array-uri în ordinea sursă. Hashul snapshotului folosește SHA-256 al JSON-ului canonic, iar ID-ul evenimentului folosește SHA-256 peste run ID, separator explicit și eveniment canonic. Replay-ul identic nu modifică revizia run-ului și nu inserează evenimente duplicate. Cursorul nu poate regresa pentru același `fileKey`, dar se poate reseta la rotația cheii.

`commitObservation` validează înainte de scriere și face upsert-ul run/snapshot, deduplicarea evenimentelor și cursorul într-o singură tranzacție. Eșecurile interne sunt expuse numai cu codul stabil `PERSISTENCE`; erorile de intrare folosesc `VALIDATION`. Un rollback împiedică avansarea cursorului la orice eșec.

## Limitări și riscuri

- Nu au fost adăugate teste în acest rol; testerul trebuie să acopere validarea negativă, rollbackul, replay-ul, regresia/rotația cursorului și redeschiderea bazei temporare.
- Implementarea nu citește filesystem Pi, nu activează reporterul și nu conectează adaptoarele sau API-ul.
- `db.js` aplică migrațiile la prima utilizare; disponibilitatea `node:sqlite` și comportamentul SQL trebuie verificate de planner/tester în mediu izolat.

## Comenzi și teste

Nu am rulat comenzi, teste, servere sau procese.
