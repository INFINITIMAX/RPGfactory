# RF-K01b1 — raport Coder

## Fișiere schimbate

- `adapters/pi-subagents-files.js`
- `docs/handoff/RF-K01b1-coder-raport.md`

## API și limite

Am creat exportul CommonJS `scanPiSubagentsStatuses(options)`. Acesta cere `roots` ca array de căi absolute și validează complet `observedAt`, `maxRoots`, `maxRuns` și `maxStatusBytes`; orice opțiune invalidă întoarce exact `{ ok:false, error:{ code:'INVALID_OPTIONS' } }`.

Valorile implicite sunt 8 roots, 200 candidați și 1 MiB per status. Plafoanele hard sunt 32 roots, 1000 candidați și 4 MiB per status. Succesul întoarce doar envelope-ul versionat, proiecțiile RF-K01a, truncarea și coduri de warning.

## Discovery și buget

Reader-ul nu are roots implicite și nu citește configurație Pi, home, temp sau proiecte. O root poate fi run dir cu `status.json` sau container de run dirs imediate. Roots sunt parcurse în ordinea primită, iar copiii unui container sunt sortați. Nu există recursie.

`maxRuns` este un buget global de candidați întâlniți: fiecare candidat consumă o poziție înainte de validarea tipului, containment, parsare sau deduplicare. Când bugetul este epuizat, scanarea se oprește și marchează `truncated.runs`. Root-urile canonical duplicate sunt omise cu warning; primul `runId` valid rămâne.

## Containment și citire

Root-urile și candidații trebuie să fie directoare normale; symlink-urile sunt respinse. Root-ul și candidatul sunt canonicalizate și candidatele în afara rădăcinii canonice sunt respinse, inclusiv junction/symlink escape care se rezolvă în afară. `status.json` trebuie să fie fișier regulat, non-symlink și să se rezolve în aceeași rădăcină. Dimensiunea este verificată înainte de citire, pe textul citit și după citire.

JSON-ul este trimis exclusiv la normalizatorul RF-K01a. Nu se copiază obiectul brut în rezultat.

## Warning-uri și confidențialitate

Warnings noi sunt coduri constante: `ROOT_UNAVAILABLE`, `ROOT_NOT_DIRECTORY`, `ROOT_LINK_REJECTED`, `DUPLICATE_ROOT`, `RUN_CANDIDATE_REJECTED`, `STATUS_MISSING`, `STATUS_NOT_FILE`, `STATUS_LINK_REJECTED`, `STATUS_TOO_LARGE`, `STATUS_READ_FAILED`, `STATUS_JSON_INVALID`, `STATUS_INVALID`, `DUPLICATE_RUN_ID`.

Rezultatul nu expune paths, mesaje de excepție, `cwd`, sesiuni/transcripturi/artefacte, prompturi, taskuri, args, outputuri sau erori brute. Acestea rămân excluse și prin allowlist-ul RF-K01a.

## Riscuri reziduale

RF-K01b1 nu urmărește modificări live și nu citește `events.jsonl`; nu persistă cursori ori snapshots și nu poate recupera după ștergerea artefactelor temporare. Aceste capacități apar în b2/b3. Reader-ul nu descoperă automat rădăcini Pi; caller-ul trebuie să transmită explicit cele aprobate.

## Comenzi și teste

Nu am rulat comenzi, teste, procese sau servere și nu am citit artefacte Pi reale.
