# T-16 — Raport tester

## Fișier modificat

`D:\RPGfactory\test\zones.test.mjs` (fișier existent, extins — nu am atins `public/zones.js`).

## Ce am adăugat

Import nou: `RESERVED_CELL` adus cu `vm.runInContext('RESERVED_CELL', ctx)` (e `const`, deci nu apare direct pe `ctx`), lângă `cellsNeeded`.

Șase teste noi, secțiunea `--- T-16: celula rezervată (turn/spawn point) ---`:

1. **`proiect nou, singur, fără previous, NU primește (0,0) ca rădăcină`** — `allocateCells` cu un singur proiect fresh; verifică `cells[0]` diferit de `RESERVED_CELL`. Ar cădea dacă `layOut` nu ar exclude `(0,0)` din `free` (comportamentul dinainte de T-16).

2. **`(0,0) nu apare NICIODATĂ în nicio zonă alocată, cu mai multe proiecte de mărimi diferite`** — 6 proiecte, mărimi 50/40/20/10/5/5; iterează toate celulele din rezultat și verifică fiecare ≠ `RESERVED_CELL`. Ar cădea dacă excluderea din `free` ar lipsi (root sau `growBlob` ar putea alege `(0,0)`).

3. **`rădăcină veche (0,0) salvată dinainte de T-16 -> proiectul e re-sămânțat`** — simulează `previous` cu `[{x:0,y:0}]` salvat pentru un proiect (starea de pe disc dinainte de fix). Verifică `layOut` nu aruncă, proiectul primește tot o celulă, dar nu `(0,0)`. Ar cădea dacă `free.has(key(prevCells[0]...))` ar întoarce încă `true` pentru `(0,0)` (adică dacă excluderea din `free` nu s-ar întâmpla înainte de bucla de `kept`/`fresh`).

4. **`isConnected - celula rezervată (0,0) conectează două grupuri ca "stepping stone"`** — construiește direct un `Map` cu două celule la `{-1,0}` și `{1,0}` (proiecte diferite, neadiacente direct — distanță Manhattan 2). Verifică `isConnected(out) === true`. Ar cădea (întoarce `false`) cu implementarea veche (flood-fill doar peste `cells`, fără `passable` incluzând `reservedKey`).

5. **`isConnected nu numără celula rezervată ca membru (fără seen.delete ar da fals-negativ)`** — un singur proiect cu celulele `{1,0}` și `{2,0}`, adiacente direct (nu au nevoie de `(0,0)` pentru conectivitate). Flood-fill-ul pornit din `{1,0}` tot atinge `(0,0)` (vecin) și l-ar adăuga în `seen` dacă cineva ar uita `seen.delete(reservedKey)` — atunci `seen.size` (3) ≠ `cells.size` (2) și `isConnected` ar întoarce greșit `false`. Cu `seen.delete` prezent, testul așteaptă `true`. Acesta e cazul concret cerut la punctul 5 din brief: demonstrează exact regresia "fals-negativ dacă se uită `delete`".

## Ce am adaptat din testele vechi și de ce

Testul existent `'două proiecte noi: primul din listă (cel mai mare) ia celula cea mai apropiată de origine (0,0)'` presupunea explicit rădăcina `(0,0)` pentru primul proiect nou — presupunere invalidată de T-16. L-am redenumit în `'... ia prima celulă liberă din ring(1), NU (0,0) (adaptat la T-16)'` și am schimbat assertion-ul din `assert.deepEqual(big[0], { x: 0, y: 0 })` în `assert.deepEqual(big[0], { x: -1, y: 0 })`.

Motivare pentru `{-1, 0}` (nu presupunere arbitrară — verificat din codul `ring()`): pentru `radius=1`, bucla `for (x=-1; x<=1; x++)` cu `y = radius - |x|` generează, în ordine: `x=-1 -> y=0` → `{-1,0}` (fără al doilea push, `y===0`); `x=0 -> y=1` → `{0,1}` și `{0,-1}`; `x=1 -> y=0` → `{1,0}`. Deci `ring(1) = [{-1,0},{0,1},{0,-1},{1,0}]`, iar `pool` e `ring(0)` (conține doar `{0,0}`, exclus din `free`) urmat de `ring(1)`. Bucla de sămânță (`for (const c of pool) if (free.has(...))`) sare peste `{0,0}` (indisponibil) și alege prima celulă liberă din `ring(1)`, adică `{-1,0}`. Nu depinde de ordinea internă a `Map`-ului sau de alt detaliu neagarantat — e ordinea explicită, determinist generată de bucla `ring()`.

Toate celelalte teste existente (cellsNeeded, suprapunere, stabilitate, creștere, micșorare, rădăcină veche ocupată de altcineva, proiect dispărut, fallback de conectivitate, pool epuizat) rămân valide fără modificări — niciunul nu presupunea explicit `(0,0)` pentru altceva decât testul adaptat mai sus.

## Ce NU am acoperit și de ce

- Nu am testat explicit scenariul „două proiecte diferite, fiecare cu o singură celulă, conectate doar prin `(0,0)`, în contextul complet `allocateCells`/`layOut`" (cu pool real, seed real) — am preferat varianta cu `Map` construit direct (opțiunea permisă explicit în brief), pentru control precis asupra geometriei fără să depind de comportamentul nedeterminist al `growBlob`/seed-ului la distanțe mari. Dacă planner-ul vrea și varianta „end-to-end" prin `layOut`, ar necesita control mai fin peste `previous` (rădăcini plasate manual la `{-1,0}`/`{1,0}` cu `size` mic ca să nu crească), ceea ce testul 4 deja acoperă echivalent, direct pe `isConnected`.
- Nu am testat cazul în care `RESERVED_CELL` ar fi alta decât `{0,0}` (nu are sens — constanta e fixă în cod, nu parametru).
- Nu am adăugat un test separat pentru „`growBlob` nu alege niciodată `(0,0)`" izolat de `layOut` — e acoperit indirect de testele 1 și 2 (dacă `growBlob` ar alege `(0,0)`, ar apărea în rezultat și testele ar cădea).

## Suspiciuni de bug

Niciuna. Codul din `public/zones.js` corespunde exact brief-ului T-16-coder și raportului coder-ului; nu am găsit discrepanțe între cod și descriere.

## Comanda exactă de rulare

```powershell
node --test test/zones.test.mjs
```

(sau `node --test test/` pentru toată suita, dacă planner-ul vrea și celelalte fișiere de test din proiect)
