# T-08 — Alocarea zonelor per proiect (logică pură, adaptată din bot-crossing)

## Sarcină

Scrie `public/zones.js` (script clasic, ca `merge-state.js` — fără module ES, fără `module.exports`), care exportă `allocateCells(projects, previous)`: dat un set de "proiecte" (grupuri de agenți după `cwd`) și layout-ul anterior, întoarce câte celule dintr-o grilă pătrată infinită (nu mărginită la 8×8 ca acum) primește fiecare proiect, păstrând poziția zonelor stabilă între apeluri.

**Fără randare, fără persistență, fără integrare în `app.js` încă** — doar modulul, testabil izolat. Randarea (T-10) și persistența (T-09) vin separat.

## Context — algoritmul original, verificat direct în `src/world/plots.js` (bot-crossing)

Ei lucrează pe o rețea hexagonală (coordonate axiale q/r, 6 direcții de vecinătate, inele hexagonale în spirală). Noi nu avem hexagoane — adaptăm la o **grilă pătrată, cu 4 direcții de vecinătate** (N/S/E/V) și **inele romboidale** (distanță Manhattan), echivalentul direct pe grilă pătrată al inelelor lor.

### Ce păstrăm identic (constante deja calibrate de ei, nu le reinventăm)

```js
const SLOTS_PER_CELL = 7;  // câți agenți încap vizual într-o celulă
const MAX_CELLS = 9;       // plafon de celule per proiect
```

### Ce NU portăm

- Nicio celulă rezervată de tip "navă" (`SHIP_CELL`) — nu avem conceptul ăsta. `isConnected` verifică direct conectivitatea celulelor ocupate, fără nicio celulă de tranzit specială.
- Nimic legat de randare 3D/hexagoane vizuale (`hexToWorld`, `corner`, texturi) — pur geometrie de alocare.

### Adaptările geometrice exacte

```js
const key = (x, y) => `${x},${y}`;
const ORIGIN = { x: 0, y: 0 };
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]]; // 4 direcții, în loc de cele 6 hexagonale

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Echivalentul lui hexRing(radius) — toate celulele la distanță Manhattan exactă `radius`
// de origine (un romb, nu un cerc hexagonal, dar același rol: inelul spiralei de sămânță).
function ring(radius) {
  if (radius === 0) return [{ x: 0, y: 0 }];
  const out = [];
  for (let x = -radius; x <= radius; x++) {
    const y = radius - Math.abs(x);
    out.push({ x, y });
    if (y !== 0) out.push({ x, y: -y });
  }
  return out;
}

const cellsNeeded = (agentCount) =>
  Math.max(1, Math.min(MAX_CELLS, Math.ceil(agentCount / SLOTS_PER_CELL)));
```

### `layOut(projects, previous)` — portă logica lor exactă, cu geometria de mai sus

Citat din raționamentul lor (motivul contează, nu doar codul):
> "Layout-ul anterior e un input. O zonă care are nevoie de același număr de celule le păstrează exact pe cele pe care le avea; una care a crescut le păstrează și revendică vecini; una care s-a micșorat renunță la celulele revendicate cel mai recent. Doar un proiect niciodată plasat e plasat de la zero, și ia cele mai interioare celule încă libere."

Pași (identici structural cu ai lor, doar geometria diferă):
1. `wanted = projects.map(p => ({ id: p.id, want: cellsNeeded(p.size) }))`.
2. Calculează `farthest` = cea mai mare distanță Manhattan față de origine dintre toate celulele din `previous` (ca pool-ul de inele să acopere și zonele vechi, îndepărtate, nu doar nevoia curentă).
3. Construiește `pool`/`free`: adaugă inele succesive (`ring(0)`, `ring(1)`, ...) până `pool.length >= total + 30` ȘI `ring > farthest`, plafonat la `ring < 12` (exact valorile lor — 30 celule buffer, plafon 12 inele).
4. Pentru fiecare proiect cu layout anterior: dacă celula rădăcină (`previous[id][0]`) mai e liberă în `free`, păstrează până la `want` celule din cele vechi (tunde dacă s-a micșorat), le scoate din `free`.
5. Zonele păstrate cresc primele (`growBlob`), ca să nu le fure un proiect nou celula în care voiau să se extindă.
6. Proiectele noi (fără layout anterior sau fără rădăcină liberă) iau prima celulă liberă din `pool` (cea mai apropiată de origine, pool-ul fiind în ordine de inel), apoi `growBlob`.

### `growBlob(cells, want, free)` — identic structural, doar `DIRS`/distanța schimbate

```js
function growBlob(cells, want, free) {
  const root = cells[0];
  while (cells.length < want) {
    let best = null, bestScore = Infinity;
    for (const c of cells) {
      for (const [dx, dy] of DIRS) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (!free.has(key(n.x, n.y))) continue;
        const score = manhattanDistance(n, root) * 100 + manhattanDistance(n, ORIGIN);
        if (score < bestScore) { bestScore = score; best = n; }
      }
    }
    if (!best) break; // complet încercuit
    free.delete(key(best.x, best.y));
    cells.push(best);
  }
}
```

### `isConnected(out)` — flood-fill pe 4 direcții, FĂRĂ celula de navă

```js
function isConnected(out) {
  const cells = new Map();
  for (const [, list] of out) for (const c of list) cells.set(key(c.x, c.y), c);
  if (cells.size < 2) return true;
  const [startKey] = cells.keys();
  const seen = new Set([startKey]);
  const queue = [cells.get(startKey)];
  while (queue.length) {
    const c = queue.pop();
    for (const [dx, dy] of DIRS) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = key(n.x, n.y);
      if (!cells.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen.size === cells.size;
}
```

### `allocateCells(projects, previous)` — punctul de intrare, identic ca structură

```js
function allocateCells(projects, previous) {
  const laid = layOut(projects, previous);
  return isConnected(laid) ? laid : layOut(projects, new Map()); // fallback: relayout complet de la zero
}
```

`projects`: array de `{ id, size }` (id = `cwd`, size = număr de agenți vii din acel cwd), ordonat cel mai mare primul (la fel ca la ei — ordinea contează doar pentru proiectele NOI, decide cine ia sămânța cea mai din interior).

`previous`: `Map<id, [{x,y}, ...]>` — layout-ul anterior (va veni din `data/state.json` la T-09; pentru acest task, testele îl construiesc manual).

Return: `Map<id, [{x,y}, ...]>`.

## Constrângeri dure

- Nu adăuga npm dependencies.
- Nu atinge `app.js`, `state.js`, `merge-state.js`, `server.js`, `rank.js`, `status.js`, `.env*`, `.gitignore`, `assets/`, `README.md`.
- Nu integra `zones.js` în `index.html` încă (fără `<script>` tag) — vine la T-10.
- Script clasic (variabile globale, ca `merge-state.js`), nu modul ES.

## Ce NU are voie să atingă

Orice fișier în afară de `public/zones.js` (nou).

## Predare

`docs/handoff/T-08-coder-raport.md`: orice diferență pe care ai simțit nevoia s-o introduci față de descrierea de mai sus (motivată), cazuri limită observate la portare (ex. ce se întâmplă cu un singur proiect, cu proiecte care dispar complet). Nu ai cum să "verifici manual" acest task (e logică pură, fără server) — dacă vrei să confirmi ceva, scrie un mic `node -e` de probă și include output-ul exact, nu doar afirmația.
