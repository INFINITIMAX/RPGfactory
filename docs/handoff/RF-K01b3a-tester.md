# RF-K01b3a — brief Tester

Data: 16-09-2026
Rol: Tester (scrie teste; NU rulează comenzi)

Citește, în ordine: `instructiuni.md`, `HANDOFF.md`, `intent.md`, `docs/DECISIONS.md`, `spec.md`, `TASKS.md`, `GATES.md` secțiunea RF-K01b3a, `docs/handoff/RF-K01b3a-coder.md`, raportul Coder și implementarea livrată.

## Sarcina

Scrie o suită independentă în `test/pi-ingestion.test.mjs` pentru `migrations/005-pi-ingestion.sql` și `pi-ingestion.js`. Nu presupune că raportul Coder este corect.

## Ownership

Poți modifica numai:

- `test/pi-ingestion.test.mjs`
- `docs/handoff/RF-K01b3a-tester-raport.md`

Nu modifica implementarea, migrațiile, alte teste sau guvernanța.

## Matrice minimă obligatorie

1. Import/create fără deschidere DB; deschidere lazy și `close()` idempotent.
2. Migrația reală 005 există în `schema_migrations`; tabelele, PK/FK/CHECK/indexurile necesare există; migrațiile vechi nu sunt editate.
3. Primul commit persistă run `pi-subagents:<nativeId>`, snapshot, events și cursor.
4. Snapshot lifecycle este autoritar; events terminale contradictorii nu schimbă lifecycle-ul run-ului.
5. Relațiile root/copii și câmpurile allowlisted se reconstruiesc din snapshot după citire.
6. Replay exact: zero event rows noi, zero usage însumat, revision neschimbată și rezultat inserted/duplicate corect.
7. Canonicalizare: aceeași structură cu ordinea cheilor diferită are același snapshot/event hash.
8. Două events diferite rămân distincte; un event identic proiectat este deduplicat.
9. Cursor same-file forward acceptat; same-file regression respins și rollback total; fileKey nou permite offset 0; discard flag persistă.
10. Persistență reală close/reopen pe DB temporară explicită: cursor/snapshot/events intacte.
11. Rollback atomic demonstrat printr-un eșec SQLite injectat după cel puțin o scriere (de ex. trigger sintetic): run/snapshot/events/cursor nu rămân parțial, iar cursorul anterior rămâne.
12. Validări ostile: snapshot/event/cursor cu chei necunoscute; mismatch run; control chars/ID empty/overlong; enum invalid; NaN/Infinity/unsafe/negative; >1000 children/events; snapshot >2MiB; event >64KiB; payloaduri private (`task`, `prompt`, `message`, `output`, `error`, `path`, `cwd`, `sessionPath`, `url`, unknown nested).
13. Erorile VALIDATION/PERSISTENCE nu conțin valori secrete, cale temporară, SQL, mesaj de trigger sau payload brut.
14. Handles se închid și directoarele temporare se curăță în `finally`; testele nu folosesc DB/date/home/config/Pi real, rețea, server sau child process.

Folosește fixture-uri sintetice minimale care respectă exact contractele RF-K01a și b2a. Testele trebuie să poată eșua pentru implementări defecte; nu testa doar forma returnată.

## Interdicții

- Nu rula teste/comenzi/procese.
- Nu porni/opri serverul.
- Nu citi artefacte Pi reale sau configurația utilizatorului.
- Nu modifica implementation code.
- Nu commit/push/deploy.

## Raport

Scrie `docs/handoff/RF-K01b3a-tester-raport.md` cu matricea acoperită, fișierele modificate, riscurile rămase și confirmarea explicită că nu ai rulat comenzi/teste. Nu afirma că testele trec; Planner-ul le rulează.
