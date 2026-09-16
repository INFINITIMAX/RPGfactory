# RF-K01a — raport coder

## Fișiere schimbate

- `adapters/pi-subagents-contract.js` — modul CommonJS nou cu `normalizePiSubagentsStatus(raw, options)`.
- `docs/handoff/RF-K01a-coder-raport.md` — acest raport.

## Contract livrat

Funcția este pură și returnează întotdeauna fie `{ ok: false, error: { code: 'INVALID_STATUS' } }` pentru root invalid, fie `{ ok: true, value }`. Nu importă module de I/O, nu păstrează stare mutabilă și nu accesează artefacte Pi.

`value` are exact `schemaVersion: 1`, `source: 'pi-subagents'`, `observedAt`, `root`, `children`, `truncated` și `warnings`. `observedAt` este numărul finit nenegativ primit în opțiuni sau `null`; o opțiune furnizată dar invalidă adaugă `INVALID_OBSERVED_AT`.

Toate nodurile au forma consecventă:

- identificare: `nativeId`, `parentNativeId`, `kind`;
- stare: `sourceState`, `lifecycle`;
- metadate allowlisted: `agent`, `phase`, `label`, `mode`, `attention`, `activity`, `startedAt`, `endedAt`, `lastActivityAt`, `model`, `usage`.

Câmpurile optionale indisponibile sunt `null`. `usage` este `null` sau un obiect cu numai `input`, `output`, `total`, `window`, `windowPeak`; nu se face agregare între noduri. Stringurile sunt trimise și limitate la 160 caractere (120 pentru activity); numele de tool care conține separator de cale ori caracter de control este exclus.

`children` este aplatizat. Step-urile au părinte root; nested folosește `parentRunId` numai dacă este un string nenul, altfel părintele structural. Identitatea step preferă `runId`, apoi `childId`, apoi `${rootId}:step:${index}`; nested preferă `id`, apoi `${parentId}:nested:${index}`. Primul ID duplicat rămâne, duplicatul este omis cu `DUPLICATE_NATIVE_ID`.

## Mapări și limite

- `pending`/`queued` → `queued`; `running` → `running`; `complete`/`completed` → `completed`; `failed`, `stopped`, `paused` se păstrează canonic.
- `partial` → `unknown` cu `PARTIAL_STATE`; `rejected` → `unknown` cu `REJECTED_STATE`; orice altă stare sau stare lipsă/inaptă devine `unknown` cu warning stabil.
- `needs_attention: true` devine numai `attention: 'needs_attention'`; nu schimbă lifecycle. `active_long_running: true` produce `ACTIVE_LONG_RUNNING_UNVERIFIED`, fără afirmație de progres.
- Limitele implicite sunt `maxDepth: 8` și `maxNodes: 200` (root inclus). Valorile opționale invalide revin la default cu warning; maximele acceptate sunt 32, respectiv 1000. `truncated.depth` și `truncated.count` indică separat tăierea.

## Date excluse explicit

Modulul nu copiază prompturi, task/description, argumente de tool, output recent, erori brute, session/transcript/artifact paths, `cwd`, `sessionId`, `parentSession`, `parentId` de mesaj, costuri sau chei necunoscute. Nu folosește acele câmpuri nici pentru identitate sau relații.

## Riscuri și ambiguități rămase

- Contractul tratează numai `nested` ca listă de copii nested; forma exactă a artefactelor live va fi verificată în RF-K01b fără a lărgi allowlist-ul pe baza unor date private.
- `parentRunId` declarat și valid este păstrat chiar dacă nodul-părinte nu apare în snapshotul aplatizat; aceasta păstrează relația lifecycle declarată fără a inventa un alt părinte.
- Nu s-au scris fixture-uri sau teste, conform limitelor brief-ului; tester-ul trebuie să acopere cazurile pozitive, ostile, duplicate și limite.

## Comenzi și teste

Nu am rulat nicio comandă, test, proces sau server.
