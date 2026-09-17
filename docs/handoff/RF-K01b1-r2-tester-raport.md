# RF-K01b1 r2 — raport Tester

Data: 16-09-2026

## Fișiere schimbate

- `test/adapters/pi-subagents-files.test.mjs`
- `docs/handoff/RF-K01b1-r2-tester-raport.md`

## Regresii adăugate

1. **TOCTOU containment:** testul construiește numai în tmp un container cu un run intern și un director extern cu marker privat. Monkeypatch-ul temporar al `fs.openSync` redenumește `victim` și pune un symlink/junction către directorul extern exact înainte de open-ul pentru `victim/status.json`. Asigură că run-ul extern nu apare, markerul privat nu se scurge și warning-ul este exact `STATUS_LINK_REJECTED`.
2. **Creștere după `fstat`:** monkeypatch-ul temporar al `fs.readSync` mărește statusul chiar înainte de prima citire. Testul cere `STATUS_TOO_LARGE`, zero runs și verifică fiecare lungime solicitată la citire: nu depășește `maxStatusBytes + 1`.
3. **Descriptor închis pe respingere:** aceeași regresie instrumentează temporar `fs.closeSync` și verifică exact o închidere după ramura `STATUS_TOO_LARGE` care a deschis descriptorul.
4. **Candidate link/buget:** un symlink/junction copil sortat înaintea unui run valid, cu `maxRuns: 1`, produce `RUN_CANDIDATE_REJECTED`, nu acceptă run-ul și setează `truncated.runs`.

## Corecție fixture după prima rulare r2 a planner-ului

Prima suită r2 a planner-ului a avut 16 teste: 14 pass, 1 fail, 1 skip; serverul a rămas PID 40652. Fail-ul a fost numai în regresia de creștere: fixture-ul valid serializat avea 65 bytes, iar `maxStatusBytes` era 64. Reader-ul l-a respins corect înainte de `fstat`/`readSync`, deci monkeypatch-ul nu putea seta `grew`.

Testul păstrează fixture-ul și append-ul de 128 bytes, dar folosește acum o limită de 128 bytes. Măsoară explicit dimensiunea fixture-ului cu `statSync` și cere ca ea să fie sub limită înainte de instalarea monkeypatch-ului. Append-ul îl duce clar peste limită. Aserțiunile originale pentru `grew`, `STATUS_TOO_LARGE`, request maxim `maxStatusBytes + 1` și exact un `closeSync` rămân neschimbate.

## Izolare

Toate testele folosesc exclusiv `fs.mkdtempSync(path.join(os.tmpdir(), ...))` și cleanup-ul deja existent. Fiecare monkeypatch global (`openSync`, `readSync`, `closeSync`) este restaurat în `finally`, inclusiv când o aserțiune sau operație eșuează. Link-urile au skip explicit numai pentru `EPERM`/`EACCES`; altă eroare este re-aruncată.

Nu sunt accesate artefacte Pi reale, home/config utilizator, DB, rețea, server sau procese copil. Nu am rulat comenzi sau teste.
