# T-09b — Completare de defaults la citirea stării vechi

## Sarcină

`readState()` din `state.js` face doar `JSON.parse(raw)`, fără să completeze câmpuri lipsă. Un `data/state.json` scris înainte de T-09 (fără `plots`) va fi întors fără acel câmp, ceea ce va cauza probleme la T-10 (`state.plots[id]` pe `undefined`).

## Rezultat așteptat

`readState()` trebuie să garanteze mereu forma completă (`version`, `archived`, `archivedAt`, `plots`, `updatedAt`), indiferent de ce lipsește în fișierul de pe disc — completează cu valorile din `emptyState()` orice câmp absent, fără să arunce pe un fișier vechi/parțial.

## Constrângeri dure

- Nu schimba comportamentul pentru un `state.json` deja complet (nu altera valorile existente).
- Nu atinge logica de concurență optimistă, scriere atomică, `writeState`, rutele HTTP.
- Nu adăuga npm dependencies.

## Predare

`docs/handoff/T-09b-coder-raport.md`: ce ai schimbat exact, un exemplu (în raport, nu neapărat rulat) de fișier vechi incomplet și ce ar întoarce acum `readState()` pentru el.
