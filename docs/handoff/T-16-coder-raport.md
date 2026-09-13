# T-16 — Raport coder

## Fișier modificat

`D:\RPGfactory\public\zones.js` — singurul fișier atins.

## Ce am adăugat/modificat exact

1. Lângă `const ORIGIN = { x: 0, y: 0 };` am adăugat:
   ```js
   const RESERVED_CELL = { x: 0, y: 0 }; // turnul/spawn point-ul (T-15) stă exact aici — niciun proiect nu poate primi această celulă
   ```

2. În `layOut()`, imediat după bucla `while (...) { r++; }` care umple `pool`/`free`, am adăugat:
   ```js
   free.delete(key(RESERVED_CELL.x, RESERVED_CELL.y));
   ```
   Nimic altceva în `layOut()` nu s-a schimbat.

3. Am înlocuit corpul funcției `isConnected()` cu varianta care tratează `RESERVED_CELL` ca "stepping stone": flood-fill-ul se propagă pe `passable = new Set([...cells.keys(), reservedKey])` în loc de doar `cells`, iar la final `seen.delete(reservedKey)` înainte de comparația `seen.size === cells.size`. Am actualizat și comentariul funcției (era „fără nicio celulă rezervată de tranzit", acum descrie noul comportament).

Nu am atins `growBlob`, `ring`, `manhattanDistance`, `SLOTS_PER_CELL`, `MAX_CELLS`, nici bucla de sămânță pentru proiecte "fresh" — exact cum cerea brief-ul.

## Confirmare pe scenariu concret

Scenariu: un singur proiect nou, fără layout anterior (`previous` = `Map()` gol), cu `size` mic (deci `want = 1`).

- `layOut()` construiește `pool` din `ring(0), ring(1), ...` — `ring(0)` = `[{x:0,y:0}]`, deci prima celulă din `pool` e `(0,0)`.
- Imediat după umplerea `pool`/`free`, se execută `free.delete(key(0,0))` — deci `free` nu mai conține `"0,0"`, deși `pool[0]` tot e `{x:0,y:0}`.
- Proiectul e "fresh" (nu are `prevCells`), deci intră pe bucla `for (const c of pool) { if (free.has(...)) { root = c; break; } }`. La `c = {0,0}`, `free.has("0,0")` e `false` (a fost șters), deci se trece mai departe. Următoarele celule din `pool` vin din `ring(1)`: în ordinea generată de `ring(1)`, prima e `{x:-1, y:0}`. Aceasta e liberă, deci `root = {x:-1, y:0}` — prima celulă din `ring(1)`, exact cum cere brief-ul.
- Rezultat: proiectul primește rădăcina `(-1, 0)` (sau echivalentul ei, prima liberă din `ring(1)`), niciodată `(0,0)`.

Pentru cazul `previous` cu rădăcină veche `(0,0)` (state salvat dinainte de T-16): condiția `free.has(key(prevCells[0].x, prevCells[0].y))` e `false` (fiindcă `free` nu mai conține `"0,0"`), deci proiectul cade automat pe ramura `fresh` și e re-sămânțat normal, exact cum descrie brief-ul la nota finală.

Pentru `isConnected`: dacă două colonii distincte au celule adiacente cu `(0,0)` pe direcții opuse (ex. una la `(-1,0)` și alta la `(1,0)`), flood-fill-ul pornit din prima ajunge la `(0,0)` (inclus în `passable`) și de acolo la a doua, deci `seen` le include pe amândouă; după `seen.delete(reservedKey)`, `seen.size === cells.size` rămâne adevărat — nu se declanșează fallback-ul de relayout complet doar din cauza turnului aflat între ele.

## Ce ar trebui verificat de planner

- Nu am rulat cod. Recomand rularea suitei de teste existente pentru `zones.js` (dacă există) plus, ideal, un test nou pentru T-16: proiect unic nou → rădăcină ≠ `(0,0)`; și un test pentru `isConnected` cu două blob-uri separate doar de `(0,0)`.
- Verificare vizuală în UI (dacă e cazul) că zona alocată primului proiect nu se mai suprapune cu turnul/spawn point-ul.
