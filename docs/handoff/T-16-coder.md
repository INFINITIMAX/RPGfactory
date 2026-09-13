# T-16 — Rezervă celula (0,0) pentru turn/spawn point (fix suprapunere)

## Context / bug real

Lucian a semnalat: „turnul este legat de worker" — vizual, turnul (T-15, `TOWER_WORLD_X/Y = 0,0`) și `SPAWN_POINT` (`{x:0,y:0}`) stau exact pe celula de grilă `(0,0)`. Dar `zones.js` (`ring(0)` returnează `[{x:0,y:0}]`) alocă mereu ACEEAȘI celulă `(0,0)` ca rădăcină primului proiect nou (cea mai apropiată de origine) — deci zona de lucru a oricărui prim proiect coincide mereu, garantat, cu locul turnului. De-aici impresia că turnul „aparține" agentului: agentul chiar stă la baza turnului cât timp e „at-site".

## Referință verificată (bot-crossing)

Planner a citit `src/world/plots.js` din bot-crossing (clonat local la `/tmp/claude/bot-crossing-trial`). Ei au exact aceeași problemă (rezervă o celulă pentru navă) și o rezolvă cu:

- `SHIP_CELL` — o celulă fixă, exclusă din pool-ul de alocare (nu poate fi rădăcină și nu poate fi aleasă la creșterea unui blob).
- În `isConnected()`, celula navei e adăugată ca **"stepping stone"** trecător la verificarea globală de conectivitate (`passable = new Set([...cells.keys(), shipKey])`, flood-fill peste `passable`, apoi `seen.delete(shipKey)` înainte de comparație) — ca o colonie care înconjoară nava din ambele părți să nu fie considerată greșit „două colonii separate".

Portăm exact acest tipar, adaptat la grila noastră pătrată, cu celula rezervată la `(0,0)` (nu offset ca la ei, pentru că la noi turnul chiar stă la originea lumii, nu lângă ea).

## Sarcină

Modifică DOAR `public/zones.js`:

### 1. Adaugă constanta celulei rezervate

Lângă `const ORIGIN = { x: 0, y: 0 };`:
```js
const RESERVED_CELL = { x: 0, y: 0 }; // turnul/spawn point-ul (T-15) stă exact aici — niciun proiect nu poate primi această celulă
```

### 2. Exclude-o din `free` la construirea pool-ului, în `layOut()`

Imediat după bucla `while ((pool.length < total + 30 || r <= farthest) && r < 12) { ... }` (care umple `pool`/`free`), adaugă:
```js
free.delete(key(RESERVED_CELL.x, RESERVED_CELL.y));
```
Asta garantează că nici rădăcina unui proiect nou (`for (const c of pool) if (free.has(...))`), nici creșterea unui blob (`growBlob`, care verifică tot `free.has(...)`) nu vor alege vreodată `(0,0)`. Nu trebuie alte modificări în `growBlob` sau în bucla de sămânță — ambele deja verifică `free.has(...)`, deci excluderea de mai sus e suficientă.

Notă: `previous` (proiecte cu layout anterior) ar putea teoretic conține deja rădăcina `(0,0)` din STAREA VECHE salvată pe disc (dinainte de T-16). Cazul `prevCells[0]` == `(0,0)` e deja acoperit corect de codul existent: `if (prevCells && prevCells.length && free.has(key(prevCells[0].x, prevCells[0].y)))` — cum `free` nu mai conține `(0,0)` după excluderea de mai sus, condiția e `false`, proiectul e tratat ca "fresh" și re-sămânțat normal în altă celulă liberă (exact tiparul deja testat la T-08, cazul "rădăcina veche ocupată de altcineva").

### 3. Tratează celula rezervată ca "stepping stone" în `isConnected()`

Înlocuiește corpul funcției cu echivalentul portat din bot-crossing (adaptat la 4 direcții/`key`):

```js
function isConnected(out) {
  const cells = new Map();
  for (const [, list] of out) for (const c of list) cells.set(key(c.x, c.y), c);
  if (cells.size < 2) return true;

  const reservedKey = key(RESERVED_CELL.x, RESERVED_CELL.y);
  const passable = new Set([...cells.keys(), reservedKey]);

  const [startKey] = cells.keys();
  const seen = new Set([startKey]);
  const queue = [cells.get(startKey)];
  while (queue.length) {
    const c = queue.pop();
    for (const [dx, dy] of DIRS) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = key(n.x, n.y);
      if (!passable.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  seen.delete(reservedKey);
  return seen.size === cells.size;
}
```

Diferența esențială față de varianta veche: flood-fill-ul se propagă acum PRIN celula rezervată (`passable`, nu doar `cells`), dar celula rezervată însăși nu se pune la socoteală în `seen.size === cells.size` (de-aia `seen.delete(reservedKey)` înainte de comparație) — exact tiparul bot-crossing, motivat de comentariul lor: „nava e o piatră de trecere, nu un membru".

## Constrângeri dure

- Nu modifica `public/app.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Nu schimba `SLOTS_PER_CELL`, `MAX_CELLS`, `ring()`, `growBlob()` (în afară de efectul indirect al excluderii din `free`), `manhattanDistance()`.

## Ce NU are voie să atingă

Orice fișier în afară de `public/zones.js`.

## Predare

`docs/handoff/T-16-coder-raport.md`: ce ai adăugat/modificat exact, și confirmă cu un exemplu concret (poți descrie un scenariu, nu trebuie să rulezi cod) că un proiect nou, singur, NU mai primește `(0,0)` ca rădăcină ci prima celulă liberă din `ring(1)`.
