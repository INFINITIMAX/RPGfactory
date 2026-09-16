# RF-K01a-d — raport coder

## Fix aplicat

Am modificat exclusiv `adapters/pi-subagents-contract.js` și am creat acest raport.

Bugetul `maxNodes` este acum urmărit prin `encounteredNodes`, inițializat la 1 pentru root. În parcurgerea depth-first a fiecărui element din `steps` ori `children`, adaptorul verifică mai întâi dacă următorul element ar depăși bugetul. Dacă da, oprește ramura curentă determinist și setează `truncated.count: true`. Dacă încape, incrementează bugetul înainte de validarea formei sau de verificarea unui ID duplicat.

Prin urmare, un element invalid ori duplicat care încă încape consumă exact o poziție și își păstrează warning-ul existent. Cu `maxNodes: 3`, root-ul consumă prima poziție, iar cel mult două elemente întâlnite sunt procesate; ele pot sau nu să fie proiectate în `children`. Elementul următor nu este procesat și marchează truncarea de count.

Nu am schimbat API-ul, forma rezultatului, allowlist-ul, lifecycle, usage, logica de depth, identitatea sau mapările `activityState`, `children` și `parentRunId`.

## Comenzi și teste

Nu am rulat comenzi, teste, procese sau servere.
