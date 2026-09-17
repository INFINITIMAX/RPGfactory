# RF-K01b3a r2 — raport Coder

## Fișiere modificate

- `migrations/005-pi-ingestion.sql`
- `pi-ingestion.js`
- `docs/handoff/RF-K01b3a-r2-coder-raport.md`

## Corecții aplicate

1. Cursorul acceptă acum exclusiv forma b2b v1: `version: 1`, `fileKey`, `offset` și, numai când este prezent, `discardingOversizedLine: true`. Versiunile diferite, markerul `false` și cheile necunoscute sunt respinse. `getCursor()` și rezultatul `commitObservation()` întorc aceeași formă v1 fără cale.
2. Regresia offsetului pentru același `fileKey` este verificată imediat după deschiderea tranzacției și înainte de orice scriere. Ea produce `VALIDATION` și rollback; rotația la un `fileKey` nou permite offset mai mic.
3. Câmpurile condițional opționale sunt definite separat pentru fiecare dintre cele 15 kind-uri de eveniment. Câmpurile obligatorii pentru step, control și child-status nu mai pot lipsi.
4. Rezultatul commitului construiește cursorul sanitizat direct din input după `COMMIT`; nu mai face o citire SQLite post-commit care ar putea raporta artificial eșecul unei tranzacții deja persistate.
5. Migrația verifică acum hashurile și `file_key` ca hex lowercase de 64 de caractere și restrânge `event_type` la cele 15 kind-uri allowlisted.
6. `createPiIngestionStore()` respinge `null` și opțiunile non-obiect cu eroarea stabilă `VALIDATION`, înainte de orice deschidere a bazei.

## Păstrat

Store-ul rămâne lazy, fără efecte la import, cu o tranzacție pentru observație, canonicalizare și hash SHA-256, limitele inițiale, rollback intern stabil și fără I/O Pi, server, API sau UI.

## Limitări și riscuri

- Nu au fost adăugate teste în rolul Coder. Testerul trebuie să verifice explicit cursorul v1, markerul opțional, regresia atomică, cele 15 forme de eveniment, CHECK-urile SQL și opțiunile non-obiect.
- Nu am verificat schema într-o bază temporară; validarea runtime și a migrației rămâne în sarcina testării izolate.

## Comenzi și teste

Confirm explicit că nu am rulat comenzi, teste, servere sau procese.
