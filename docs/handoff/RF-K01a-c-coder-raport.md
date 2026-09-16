# RF-K01a-c — raport coder

## Corecții aplicate

Am modificat exclusiv `adapters/pi-subagents-contract.js` și am creat acest raport.

1. `TokenUsage` este tratat ca obiect allowlisted. Pentru root și nodurile nested, adaptorul citește numai `totalTokens`; pentru step citește numai `tokens`. Proiecția `usage` acceptă exclusiv `input`, `output`, `total`, plus opțional `window` și `windowPeak`, fiecare numai dacă este număr finit nenegativ. Valorile invalide sunt omise cu `INVALID_USAGE`; fără câmp valid, `usage` este `null`. Nu acceptă aliasuri sau numere scalare și nu agregă ori recalculează usage.
2. Root și nodurile nested continuă să citească starea din `state`; step-urile citesc acum starea din `status`. Maparea lifecycle a rămas neschimbată.

Mapările corecte introduse anterior au rămas intacte: `activityState` pentru atenție, `children` pentru recursia nested și `parentRunId` valid cu fallback structural pentru părinte.

## Comenzi și teste

Nu am rulat comenzi, teste, procese sau servere.
