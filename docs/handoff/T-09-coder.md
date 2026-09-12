# T-09 — Persistența layout-ului de zone (`plots`) în starea salvată

## Sarcină

Extinde schema de stare (`state.js` pe server, `merge-state.js` pe frontend) cu un câmp nou, `plots`: `{ [projectId]: [{x,y}, ...] }` — layout-ul de zone calculat de `public/zones.js` (T-08), ca să nu se recalculeze de la zero la fiecare pornire de server/reîncărcare de pagină. **Fără integrare în `app.js`/randare încă** — doar schema + merge. Wiring-ul complet (calcularea proiectelor din agenți, apelul la `allocateCells`, randarea zonelor) vine la T-10.

## Context

- `data/state.json` are acum `{ version, archived, archivedAt, updatedAt }` (T-06/T-07). Adaugă `plots: {}` ca valoare implicită.
- `public/zones.js` (T-08) întoarce un `Map<id, [{x,y},...]>` — la (de)serializare JSON, un `Map` devine `{}` simplu; când citești din `state.plots` și îl dai lui `allocateCells(projects, previous)`, trebuie reconvertit înapoi în `Map` (`new Map(Object.entries(state.plots))`) — asta se întâmplă la T-10, dar schema de-aici trebuie să fie compatibilă cu acest du-te-vino.

## Partea de server (`state.js`)

1. `emptyState()`/`readState()`: adaugă `plots: {}` ca valoare implicită, la fel ca `archived`/`archivedAt`.
2. `writeState(archived, archivedAt, plots)`: acceptă și scrie `plots` (obiect simplu, nu `Map` — vine deja serializat din body-ul JSON al cererii `PUT`).
3. Nu schema nimic din logica de concurență optimistă (`baseUpdatedAt`, 409, scriere atomică) — rămâne neschimbată, doar câmpul în plus trece prin ea la fel ca restul.

## Partea de frontend (`public/merge-state.js`)

Bot-crossing folosește, pentru câmpuri ca `plots` (valori complexe, nu numere simple), o egalitate profundă — citat din codul lor:

```js
function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => sameValue(a[k], b[k]));
  }
  return false;
}
```

**Adaugă `sameValue` în `merge-state.js`** și **actualizează `mergeMap`** ca să-l folosească în loc de `===` — dar cu grijă: `archivedAt` (valori numerice simple) funcționează identic cu `sameValue` sau `===` (pentru numere sunt echivalente), deci generalizarea nu strică nimic la arhivare, doar face `mergeMap` corect și pentru `plots` (valori = array-uri de obiecte `{x,y}`, unde `===` ar considera mereu "diferit" chiar dacă conținutul e identic, din cauza referințelor noi create la fiecare recalculare).

Actualizează linia din `mergeMap`:
```js
if (k in baseMap && sameValue(baseMap[k], v)) continue; // era: baseMap[k] === v
```

Actualizează `mergeState` să compună și `plots` prin `mergeMap`:
```js
function mergeState(base, local, remote) {
  return {
    version: 1,
    archived: mergeSet(base?.archived, local?.archived, remote?.archived),
    archivedAt: mergeMap(base?.archivedAt, local?.archivedAt, remote?.archivedAt),
    plots: mergeMap(base?.plots, local?.plots, remote?.plots),
  };
}
```

## Constrângeri dure

- Nu modifica `public/zones.js`, `public/app.js`, `rank.js`, `status.js`, `server.js` (rutele existente `/api/state` nu trebuie schimbate — corpul cererii/răspunsului doar capătă un câmp în plus, tratat generic).
- Nu integra `plots` în logica de agenți/randare — asta e T-10.
- Nu adăuga npm dependencies.

## Ce NU are voie să atingă

`public/zones.js`, `public/app.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-09-coder-raport.md`: ce fișiere ai schimbat, cum ai verificat că `sameValue` nu schimbă comportamentul existent pentru `archivedAt` (compară vechiul `===` cu noul `sameValue` pe cazuri simple), orice caz limită la `plots` (obiect gol, chei absente).
