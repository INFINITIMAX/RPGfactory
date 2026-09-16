# RF-K01a-b — raport coder

## Corecție aplicată

Am modificat exclusiv `adapters/pi-subagents-contract.js` și am creat acest raport.

1. Atenția citește acum numai `activityState`: `needs_attention` devine `attention: 'needs_attention'`, iar `active_long_running` rămâne fără attention și produce `ACTIVE_LONG_RUNNING_UNVERIFIED`. Orice valoare prezentă, necunoscută sau care nu este string produce `UNKNOWN_ACTIVITY_STATE`, fără valoare brută. Proprietățile booleene inexistente `needs_attention` și `active_long_running` nu mai sunt citite.
2. Usage citește numai numărul `totalTokens` pentru root și nodurile nested, respectiv numai numărul `tokens` pentru step. O valoare validă este proiectată ca `usage: { total: valoare }`; una invalidă produce `INVALID_USAGE`. Nu se citesc aliasuri `usage` și nu se agregă scope-uri.
3. Recursia nested citește acum numai listele `children`, atât pentru step-uri, cât și pentru noduri nested. Păstrează limitele, detectarea duplicatelor și prioritatea `parentRunId` valid față de părintele structural.

API-ul public, forma rezultatului, maparea lifecycle, allowlist-ul, limitele și excluderea datelor private au rămas neschimbate.

## Surse reale confirmate

Corecția folosește exact cele trei forme indicate în brief, verificate de planner în schema `pi-subagents@0.60.0`:

- `activityState` pentru controlul atenției/activității;
- `totalTokens` pentru root `AsyncStatus` și `NestedRunSummary`, respectiv `tokens` pentru step;
- `children` pentru copiii nested ai step-urilor și ai `NestedRunSummary`.

## Comenzi și teste

Nu am rulat comenzi, teste, procese sau servere.
