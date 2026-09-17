# RF-K01b3a r3 — restaurarea și completarea matricei Tester

Data: 17-09-2026
Rol: același Tester reluat (scrie teste; NU rulează comenzi/teste)

Citește integral `docs/handoff/RF-K01b3a-r2-reviewer-raport.md`, brief-ul Tester inițial și testul curent. Modifică numai `test/pi-ingestion.test.mjs` și scrie `docs/handoff/RF-K01b3a-r3-tester-raport.md`.

## Regula principală

Nu rescrie și nu elimina testele/asertările curente. Adaugă/restaurează acoperirea lipsă. Raportul trebuie să corespundă exact fișierului final.

## Corecții obligatorii

### 1. Required fields complet

Pentru fiecare dintre cele 7 forme `step_started`, `step_completed`, `step_failed`, `step_paused`, `step_stopped`, `control_attention`, `child_status`:

- pornește de la output valid produs de b2a;
- determină toate câmpurile obligatorii din forma respectivă;
- elimină pe rând fiecare câmp obligatoriu, inclusiv comunele `schemaVersion`, `source`, `kind`, `ts`, `runId`;
- dovedește `VALIDATION` pentru fiecare mutație.

### 2. Replay/idempotency complet

În testul replay păstrează verificările existente și adaugă explicit:

- `events.duplicate === 1` la replay;
- numărul de event rows rămâne neschimbat;
- `runs.revision` rămâne neschimbată;
- același event cu cheile reordonate produce aceeași deduplicare;
- usage root rămâne exact, nu însumat;
- canonicalizarea nested snapshot rămâne demonstrată.

### 3. Restaurează matricea ostilă/limite

Adaugă cazuri explicite pentru:

- cheie necunoscută separat în snapshot, event și cursor;
- run mismatch;
- ID gol și 256/257;
- control chars;
- NaN, Infinity, unsafe integer, negativ;
- lifecycle/mode/enum invalid;
- 1001 events și 1001 children;
- snapshot canonic peste 2 MiB prin date allowlisted sintetice;
- încercare event peste 64 KiB (este acceptabil să fie respins mai devreme de limita unui câmp, dar testul trebuie să demonstreze că nu poate fi persistat);
- toate categoriile private: `task`, `prompt`, `message`, `output`, `error`, `path`, `cwd`, `sessionPath`, `url`, plus unknown nested;
- opțiuni store `null` și non-object;
- mesajele VALIDATION/PERSISTENCE nu ecouă secret, cale, SQL ori trigger.

Nu folosi teste care pot trece dintr-un motiv diferit de cel declarat; unde verifici CHECK-uri SQLite, păstrează FK valid.

## Interdicții

Zero comenzi/teste/procese, zero modificări implementation/migration, zero Pi real/home/config/rețea/server.

## Raport

Enumeră exact testele/asertările adăugate, ce ai restaurat și confirmă că nu ai rulat comenzi/teste.
