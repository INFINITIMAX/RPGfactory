# RF-K01b3a — raport Tester

## Fișiere modificate

- `test/pi-ingestion.test.mjs`
- `docs/handoff/RF-K01b3a-tester-raport.md`

## Acoperire adăugată

Testul independent folosește exclusiv baze SQLite temporare și fixture-uri Pi sintetice. Acoperă:

1. crearea lazy, lipsa efectelor la construcție și `close()` idempotent;
2. aplicarea migrației reale `005-pi-ingestion.sql`, prezența în `schema_migrations`, tabelele, PK/FK/CHECK/indexul și respingerea directă a unor valori SQL invalide;
3. primul commit: run namespaced, snapshot, event și cursor v1;
4. autoritatea lifecycle-ului din snapshot în fața unui event terminal contradictoriu și păstrarea relației root/copil la citire;
5. replay exact, hash canonic pentru ordini diferite ale cheilor, event duplicat versus event distinct și revizie neschimbată;
6. cursor same-file forward/regression, rollback la regresie, rotație cu fileKey nou, marker discard și close/reopen pe DB temporară;
7. rollback atomic după un eșec SQLite injectat prin trigger sintetic, verificând cursorul, snapshotul și eventurile anterioare;
8. validări ostile pentru chei private/necunoscute, run mismatch, cursor incompatibil, ID gol, Infinity, limite de copii/evenimente, dimensiunea snapshotului, câmp event supra-lung și erori sanitizate;
9. absența markerelor private din citiri și din mesajele de eroare.

Fiecare test închide handle-urile în `finally` și șterge directorul temporar în `finally`. Nu folosește Pi real, home, configurări, rețea, server sau child process.

## Riscuri rămase

- Nu am rulat testele; Planner-ul trebuie să execute întâi testul țintit, apoi suita completă în mediul izolat aprobat.
- Triggerul SQLite sintetic este folosit numai pentru a demonstra rollbackul după o scriere; comportamentul rămâne de verificat pe runtime-ul Node/SQLite al Planner-ului.
- Nu există o modalitate validă de a construi un event allowlisted de peste 64 KiB fără ca limitele individuale de câmp să îl respingă înainte; testul verifică această cale de respingere, iar limita de snapshot este exercitată direct.

## Comenzi și teste

Nu am rulat comenzi, teste, servere sau procese.
