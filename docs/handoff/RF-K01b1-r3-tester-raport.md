# RF-K01b1 r3 — raport Tester

Data: 16-09-2026

## Fișiere schimbate

- `test/adapters/pi-subagents-files.test.mjs`
- `docs/handoff/RF-K01b1-r3-tester-raport.md`

## Regresii adăugate

1. **Root swap înainte de canonicalizare:** un root tmp valid este redenumit chiar în monkeypatch-ul `fs.realpathSync`, iar calea lui devine junction/symlink către un container extern cu marker privat. Link-ul rămâne instalat pentru reverificare. Testul cere exact `ROOT_LINK_REJECTED`, zero run-uri și absența markerului/id-ului extern.
2. **Root swap → canonical extern → restore:** monkeypatch-ul face același swap, apelează realpath-ul original pentru a obține calea canonicală externă, apoi elimină junction-ul și restaurează root-ul original înainte ca scanner-ul să continue. Testul cere tot `ROOT_LINK_REJECTED`, zero run-uri și niciun marker extern. Astfel nu poate trece o implementare care reverifică doar root-ul curent și nu verifică obiectul canonical memorat.
3. **Identity înaintea tipului:** `fs.fstatSync` este instrumentat numai în tmp ca să întoarcă o identitate diferită și `isFile() === false`. Testul cere `STATUS_LINK_REJECTED`, nu `STATUS_NOT_FILE`, și instrumentează `closeSync` pentru a confirma închiderea descriptorului pe ramura de respingere.

## Izolare și cleanup

Toate cazurile folosesc numai directoare create cu `fs.mkdtempSync` în temp și cleanup prin hook-ul testului. Fiecare monkeypatch (`realpathSync`, `fstatSync`, `closeSync`) este restaurat în `finally`. Root-urile mutate sunt eliminate/restaurate în același `finally`, inclusiv după fail sau skip. Pentru junction/symlink, numai `EPERM` sau `EACCES` produc skip explicit; orice altă eroare este re-aruncată.

Nu sunt accesate artefacte Pi reale, home/config utilizator, DB, rețea, server sau procese copil.

## Execuție

Nu am rulat comenzi sau teste.
