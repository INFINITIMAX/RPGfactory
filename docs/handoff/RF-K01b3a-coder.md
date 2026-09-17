# RF-K01b3a — brief Coder

Data: 16-09-2026
Rol: Coder (scrie cod; NU rulează comenzi sau teste)
Autoritate: `instructiuni.md` > `HANDOFF.md` > `intent.md` + `docs/DECISIONS.md` > `spec.md` > `TASKS.md` + `GATES.md` > acest brief.

## Sarcina

Implementează fundația SQLite atomică pentru observațiile Pi deja normalizate. Acest lot nu citește filesystem/Pi și nu orchestrează adaptoarele b1/b2b.

## Fișiere pe care le deții

- nou: `migrations/005-pi-ingestion.sql`
- nou: `pi-ingestion.js`
- raport: `docs/handoff/RF-K01b3a-coder-raport.md`

Nu modifica teste, alte migrații, `db.js`, `runs.js`, server/API/UI, adaptoarele RF-K01a/b1/b2a/b2b sau documentele de guvernanță.

## API cerut

CommonJS, fără efecte la import:

```js
const { createPiIngestionStore } = require('./pi-ingestion');
const store = createPiIngestionStore({ dbPath, migrationsDir, now });
store.commitObservation({ snapshot, events, cursor });
store.getCursor(nativeRunId);
store.getSnapshot(nativeRunId);
store.listEvents(nativeRunId);
store.close();
```

- DB se deschide lazy, o singură dată, prin `openDatabase()`; `close()` este idempotent.
- `snapshot` este exclusiv forma allowlisted produsă de RF-K01a (`schemaVersion:1`, `source:'pi-subagents'`, `root`, `children`, `truncated`, `warnings`, `observedAt`).
- `events` este un array de valori allowlisted produse de RF-K01b2a, toate legate de `snapshot.root.nativeId`; max. 1000 per commit.
- `cursor` este exact cursorul RF-K01b2b v1: `fileKey` SHA-256 lowercase, offset safe integer >=0, opțional `discardingOversizedLine:true`.
- Returnează un rezultat sanitizat cu run/snapshot/cursor și număr de evenimente inserate/duplicate; fără payload privat/căi/SQL.

## Schema minimă

Folosește tabele dedicate pentru:

1. snapshot curent per run (`run_id` FK către `runs.id`, hash determinist, JSON allowlisted, `observed_at` nullable, timestamps);
2. evenimente deduplicate (`event_id` SHA-256 PK, `run_id` FK, tip, occurred_at nullable, JSON allowlisted, stored_at), indexate pe run/timp;
3. cursor curent per run (`run_id` FK/PK, `file_key`, `offset`, discard flag, updated_at).

Migrația este numai aditivă și nu conține BEGIN/COMMIT/ROLLBACK/SAVEPOINT (tranzacția migrațiilor este gestionată de `db.js`). Adaugă CHECK-uri finite pentru enum/booleans/offset unde SQLite poate ajuta.

## Semantica tranzacției

`commitObservation` validează complet înainte sau în tranzacție și apoi, într-un singur BEGIN/COMMIT:

- upsert idempotent în `runs` cu id `pi-subagents:<nativeId>`, `source_harness='pi-subagents'`, `native_id=<nativeId>`;
- lifecycle-ul run-ului vine NUMAI din `snapshot.root.lifecycle`;
- nu atinge `profile_id`; nu inventează `project`;
- păstrează `first_observed_at`; actualizează `last_observed_at`/`updated_at` și `revision` numai când snapshot-ul s-a schimbat efectiv;
- upsert snapshot curent;
- INSERT OR IGNORE pentru evenimente;
- upsert cursor la final.

Dacă orice pas eșuează, rollback complet; în special cursorul nu avansează. Înfășoară erorile interne într-o eroare stabilă (`code='PERSISTENCE'`) fără SQL, cale, payload sau mesaj brut. Erorile de input au `code='VALIDATION'`, tot fără valori brute.

## Idempotency și recovery

- Canonicalizează recursiv cheile obiectelor înainte de JSON/hashing; array-urile își păstrează ordinea.
- Snapshot hash: SHA-256 peste reprezentarea canonică allowlisted.
- Event ID: SHA-256 peste `runId + separator explicit + canonicalEventJson`.
- Replay identic: zero evenimente noi, nicio însumare usage, nicio revizie run nouă.
- Pentru același `fileKey`, cursorul nu poate regresa. Un `fileKey` nou reprezintă rotație și permite offset reset.
- `discardingOversizedLine` face parte din cursorul persistat.
- După close/reopen pe aceeași DB temporară, cursorul/snapshot/events trebuie recuperabile.

## Validare și limite

Nu accepta obiecte arbitrare doar pentru că sunt JSON. Verifică structura allowlisted RF-K01a/b2a și respinge chei necunoscute la nivelurile persistate. Minimum:

- IDs non-empty, bounded, fără control chars; `snapshot.root.nativeId` este cheia sursei;
- maximum 1000 copii, 1000 events;
- snapshot JSON canonical <= 2 MiB; event JSON canonical <= 64 KiB per event;
- numere finite/safe și enum-uri conform contractelor existente;
- evenimentul trebuie să aparțină run-ului snapshot (direct sau prin câmpurile allowlisted relevante); nu reintroduce câmpuri private.

Poți refolosi helpers locali, dar nu modifica/exporta internals din adaptoarele deja acceptate.

## Interdicții dure

- Nu rula comenzi, teste, server sau procese.
- Nu citi artefacte Pi reale, home/config, rețea sau DB reală.
- Nu activa integrarea, polling-ul sau reporter-ul.
- Nu expune/stoca task, prompt, message, output, error brut, path, cwd, session, URL, tool payload ori unknown fields.
- Nu face commit/push/deploy.

## Raport obligatoriu

Scrie `docs/handoff/RF-K01b3a-coder-raport.md` cu:

- fișiere modificate;
- schema și API-ul livrat;
- regulile de validare/idempotency/rollback;
- limitări/riscuri;
- confirmarea explicită că nu ai rulat comenzi/teste.
