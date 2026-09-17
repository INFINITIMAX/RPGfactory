# RF-K01b1 — raport Tester

Data: 16-09-2026

## Fișiere create

- `test/adapters/pi-subagents-files.test.mjs`
- `docs/handoff/RF-K01b1-tester-raport.md`

## Acoperire independentă

Testele creează exclusiv directoare temporare sintetice cu `fs.mkdtempSync(path.join(os.tmpdir(), ...))` și le șterg prin cleanup-ul fiecărui test. Acoperă:

1. toate formele relevante de opțiuni invalide, fără throw și cu exact `INVALID_OPTIONS`;
2. envelope-ul gol versionat;
3. run directory direct, propagarea `observedAt` și maparea `activityState` din RF-K01a;
4. container cu copii imediați sortați și lipsa recursiei la nepot;
5. root indisponibil, root fișier, root canonical duplicat și root symlink/junction;
6. bugetul de run consumat înainte de validare pentru un candidat invalid, plus warning-uri bounded;
7. limitele `maxRoots`/`maxRuns`, inclusiv cazul exact care nu trebuie trunchiat;
8. `status.json` lipsă, directory, prea mare, JSON invalid, semantic invalid și symlink;
9. duplicate `runId`: prima proiecție rămâne, duplicatul consumă bugetul;
10. excluderea câmpurilor private/ostile și a numelor de fișier/director controlate de atacator din rezultat și warning-uri;
11. regresie cu multe intrări invalide/duplicate, care demonstrează plafonarea warnings-urilor și a traversării prin `maxRuns`.

Testele de symlink/junction sunt explicite: dacă platforma refuză crearea cu `EPERM` sau `EACCES`, cazul se marchează `skip` cu motiv; nu devine verde implicit.

## Corecție după prima rulare a planner-ului

Planner-ul, nu Tester-ul, a executat prima suită țintită: 11 pass, 1 fail, 1 skip; serverul a rămas PID 40652. Fail-ul provenea din fixture: limita de 16 bytes respingea JSON-ul semantic invalid ca `STATUS_TOO_LARGE` înainte ca RF-K01a să îl poată clasifica `STATUS_INVALID`. Testul folosește acum o limită de 64 bytes; fixture-ul oversized are 128 bytes. Astfel cazul oversized rămâne clar peste limită, iar JSON-ul semantic invalid ajunge în normalizator, fără slăbirea aserțiunilor sau modificarea implementării.

## Limite

Suite-ul nu testează `events.jsonl`, SQLite, recovery, misiuni, reporter, server/API/UI ori polling; acestea sunt în afara RF-K01b1. Testele verifică comportamentul expus al reader-ului cu fixture-uri temporare și nu simulează toate erorile de cursă posibile între `lstat`, `readFile` și `stat`.

## Confirmare de izolare

Nu am rulat comenzi sau teste. Nu am accesat artefacte Pi reale, directoare din profilul utilizatorului, DB, rețea, server sau procese copil.
