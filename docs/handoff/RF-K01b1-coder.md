# RF-K01b1 — brief Coder

Data: 16-09-2026

## Context

RF-K01a este închis și oferă `normalizePiSubagentsStatus(raw, options)` în `adapters/pi-subagents-contract.js`. RF-K01b1 adaugă numai discovery controlat și citirea read-only a snapshot-urilor `status.json`. `events.jsonl`, SQLite, misiunile și reporterul sunt sub-loturi ulterioare.

Citește: `spec.md` secțiunea RF-K01b, `GATES.md` RF-K01b1, `docs/INTEGRATIONS.md` reverificarea RF-K01 și modulul RF-K01a.

## Fișiere permise

- creează `adapters/pi-subagents-files.js`;
- scrie `docs/handoff/RF-K01b1-coder-raport.md`.

Nu modifica nimic altceva.

## API obligatoriu

CommonJS:

```js
const { scanPiSubagentsStatuses } = require('./adapters/pi-subagents-files');
const result = scanPiSubagentsStatuses({
  roots,
  observedAt,
  maxRoots,
  maxRuns,
  maxStatusBytes
});
```

Input:

- `roots`: array obligatoriu de căi absolute, string nenul; array gol este valid;
- `observedAt`: opțional, număr finit nenegativ; absent → null;
- `maxRoots`: implicit 8, întreg 1…32;
- `maxRuns`: implicit 200, întreg 1…1000;
- `maxStatusBytes`: implicit 1 MiB, întreg 1…4 MiB.

Orice opțiune invalidă returnează exact `{ ok:false, error:{ code:'INVALID_OPTIONS' } }`, fără throw și fără valori brute.

Succes:

```js
{
  ok: true,
  value: {
    schemaVersion: 1,
    source: 'pi-subagents-files',
    observedAt: number | null,
    runs: [/* valorile `value` returnate de normalizatorul RF-K01a */],
    truncated: { roots: boolean, runs: boolean },
    warnings: [/* numai coduri stabile */]
  }
}
```

Rezultatul nu conține nicio cale de filesystem sau eroare brută.

## Discovery

1. Nu există default pentru roots și nu se citește config/home/temp/proiect implicit.
2. Procesează roots în ordinea furnizată, maximum `maxRoots`; surplusul setează `truncated.roots`.
3. O root validă poate fi:
   - chiar un run directory care conține `status.json`; sau
   - un container; atunci inspectezi numai copiii imediați, sortați lexicografic. Fără recursie.
4. Root-ul, candidatul și `status.json` trebuie să rămână în rădăcina canonicalizată. Respinge symlink/junction/reparse escape; nu urma deliberat link-uri în afara root-ului.
5. Fiecare candidat întâlnit consumă `maxRuns` înainte de validare, inclusiv non-directory, invalid și duplicate. La epuizare oprești determinist și setezi `truncated.runs`.
6. Root-urile canonice duplicate sunt ignorate cu warning. Pentru `runId` duplicat, prima proiecție validă câștigă, următoarea este omisă cu warning.

## Citirea statusului

- Acceptă numai fișier regulat, non-symlink.
- Verifică dimensiunea înainte și după citire; peste `maxStatusBytes` este respins.
- Parsează JSON și apelează exclusiv `normalizePiSubagentsStatus(parsed, { observedAt })`.
- Dacă normalizatorul întoarce `ok:false`, omite candidatul și adaugă warning stabil.
- Nu copia/spread-ui obiectul brut și nu include `cwd`, args, output, erori ori paths.

## Warning-uri

Folosește numai coduri constante, fără interpolarea căilor/mesajelor externe. Minimum necesar:

- `ROOT_UNAVAILABLE`
- `ROOT_NOT_DIRECTORY`
- `ROOT_LINK_REJECTED`
- `DUPLICATE_ROOT`
- `RUN_CANDIDATE_REJECTED`
- `STATUS_MISSING`
- `STATUS_NOT_FILE`
- `STATUS_LINK_REJECTED`
- `STATUS_TOO_LARGE`
- `STATUS_READ_FAILED`
- `STATUS_JSON_INVALID`
- `STATUS_INVALID`
- `DUPLICATE_RUN_ID`

Poți consolida două coduri numai dacă nu pierde o distincție cerută de gates. Nu include exception messages.

## Constrângeri dure

- Funcție sincronă, fără timer/watch/polling intern.
- Numai `fs`, `path` și contractul RF-K01a; fără dependențe noi.
- Fără DB, server, API, UI, reporter, events sau missions.
- Fără citirea artefactelor reale în timpul implementării.
- Fără side effects la `require`.
- Nu rula comenzi sau teste; planner-ul rulează tot.

## Raport

În `docs/handoff/RF-K01b1-coder-raport.md` descrie:

1. fișierele schimbate;
2. API-ul și limitele exacte;
3. ordinea și semantica bugetului;
4. containment/link handling;
5. warning-urile și datele excluse;
6. riscuri reziduale;
7. confirmarea că nu ai rulat comenzi/teste.
