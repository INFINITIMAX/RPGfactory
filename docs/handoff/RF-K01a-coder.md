# RF-K01a — brief coder

Data: 16-09-2026

## Sarcina

Implementează contractul pur care normalizează un obiect Pi `pi-subagents` de tip `AsyncStatus` într-o proiecție RPG Factory sigură, versionată și fără date private.

Citește înainte: `instructiuni.md` §1, §3 I44–I46, §7 și §10; `spec.md` „RF-K01a — contract normalizat Pi”; `GATES.md` RF-K01a; `docs/INTEGRATIONS.md` „Reverificare pentru RF-K01”.

## Fișiere permise

- creează `adapters/pi-subagents-contract.js`;
- scrie raportul în `docs/handoff/RF-K01a-coder-raport.md`.

## Interzis

- nu modifica teste, fixture-uri, server, DB/migrații, API, UI, package.json sau configurații Pi;
- nu citi sesiuni/artefacte reale și nu accesa `.env`;
- nu porni comenzi, teste, procese sau servere; coder-ul scrie cod, planner-ul rulează verificările;
- nu instala și nu activa reporter/extensie globală;
- nu include prompturi, task/description, args, output recent, eroare brută, căi session/transcript/artifact ori chei necunoscute în rezultat/warnings.

## API obligatoriu

CommonJS, compatibil cu proiectul:

```js
const { normalizePiSubagentsStatus } = require('./adapters/pi-subagents-contract');
const result = normalizePiSubagentsStatus(raw, { observedAt, maxDepth, maxNodes });
```

Returnează întotdeauna, fără throw pentru input extern:

```js
{ ok: true, value: { schemaVersion: 1, source: 'pi-subagents', observedAt, root, children, truncated, warnings } }
// sau
{ ok: false, error: { code: 'INVALID_STATUS' } }
```

`warnings` conține numai coduri stabile/structurate, fără valori brute. `children` este o listă aplatizată; fiecare copil are `parentNativeId`.

## Câmpuri allowlisted per nod

- `nativeId`, `parentNativeId`, `kind` (`root`/`step`/`nested`);
- `sourceState` și `lifecycle` canonic;
- `agent`, `phase`, `label`, `mode` numai ca stringuri scurte, normalizate/bounded;
- `attention`: numai `needs_attention` sau null;
- `activity`: numai numele scurt `currentTool` sau null; niciodată args/path/output;
- `startedAt`, `endedAt`, `lastActivityAt` numai numere finite nenegative;
- `model` bounded;
- `usage` per nod, fără agregare: `input`, `output`, `total`, opțional `window`, `windowPeak`, numai numere finite nenegative; altfel null/warning.

Poți omite proprietățile opționale în loc să pui `null`, dar forma trebuie să fie consecventă și documentată în raport.

## Identitate și ierarhie

- root: `raw.runId`; dacă lipsește/gol → `{ok:false, code:'INVALID_STATUS'}`;
- step: preferă `step.runId`, apoi `step.childId`, apoi fallback determinist `${rootId}:step:${index}`;
- nested: preferă `nested.id`; folosește relația declarată `parentRunId` numai dacă este validă; când obiectul este conținut sub un step/nested și parentul declarat lipsește, parentul structural poate fi fallback-ul documentat;
- nu folosi `sessionId`, `parentSession`, `parentId` de mesaj, nume/model/cwd pentru identitate sau părinte;
- duplicatele de nativeId nu suprascriu tăcut: primul rămâne, următoarele produc warning și sunt omise ori primesc tratament determinist documentat;
- limite implicite: `maxDepth` și `maxNodes` finite/rezonabile, cu `truncated.depth/count` adevărate când se taie. Parametrii invalizi folosesc default sigur, nu aruncă.

## Mapare lifecycle

Canonical: `queued`, `running`, `completed`, `failed`, `stopped`, `paused`, `unknown`.

- `pending`/`queued` → `queued`;
- `running` → `running`;
- `complete`/`completed` → `completed`;
- `failed` → `failed`;
- `stopped` → `stopped`;
- `paused` → `paused`;
- `partial`, `rejected` și orice valoare necunoscută → `unknown`, păstrând valoarea allowlisted în `sourceState` și warning distinct;
- lipsă/invalid → `unknown` + warning.

`needs_attention` nu schimbă lifecycle în failed/blocked. `active_long_running` nu dovedește progres și nu devine attention; poate fi ignorat sau semnalat prin warning stabil.

## Validarea root

`raw` trebuie să fie obiect simplu; `runId` string nenul; `state` string; `startedAt` număr finit nenegativ; `steps`, dacă există, trebuie să fie array. Câmpurile invalide neesențiale nu invalidează tot statusul: se omit și se adaugă warning. Nu reflecta valori brute în mesaje.

## Constrângeri de implementare

- funcție pură și deterministă pentru aceleași input/opțiuni;
- fără `fs`, `path`, `os`, timers, globals mutabile sau side effects;
- fără dependențe noi;
- fără `JSON.stringify(raw)` sau copiere generică/spread din input în output;
- cod minimal, helpers locali expliciți, fără infrastructură pentru RF-K01b.

## Rezultat așteptat

Un singur modul de producție gata de testare independentă. Raportul trebuie să enumere:

1. fișiere schimbate;
2. forma exactă aleasă pentru nod/warnings/truncated;
3. mapările și limitele implicite;
4. datele excluse explicit;
5. riscuri/ambiguități rămase;
6. confirmarea că nu ai rulat comenzi sau teste.
