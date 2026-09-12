# T-08 — Raport tester

## Fișier livrat

`test/zones.test.mjs` (nou). Încarcă `public/zones.js` cu `node:vm`, la fel ca `test/merge-state.test.mjs`.

Notă tehnică (relevantă dacă cineva reia tiparul): `allocateCells`, `layOut`, `isConnected` sunt `function` declarate → apar ca proprietăți ale obiectului contextificat. `cellsNeeded` e `const` → NU apare ca proprietate; am luat-o separat cu un al doilea `vm.runInContext('cellsNeeded', ctx)` (legăturile lexicale de nivel de script persistă în același obiect contextificat între apeluri succesive de `runInContext`).

## Ce am testat (17 teste, `node --test`)

1. **`cellsNeeded`** (4 teste): 0→1, 1-7→1, 8→2, pragurile intermediare (9,14,15,56,57), plafon `MAX_CELLS=9` la 63/1000/1e6. *Ar cădea dacă*: cineva schimbă `SLOTS_PER_CELL`, formula de rotunjire, sau plafonul.
2. **Proiect nou, singur**: verifică `cells.length === cellsNeeded(size)` ȘI `isConnected(result) === true`. *Ar cădea dacă*: `growBlob` produce un blob deconectat sau un număr greșit de celule.
3. **Două proiecte noi — apropiere de origine**: primul din listă primește exact `{x:0,y:0}`. *Ar cădea dacă*: ordinea de procesare a proiectelor "fresh" se schimbă sau pool-ul nu pornește de la origine.
4. **Două proiecte noi — fără suprapunere**: niciun `{x,y}` comun între cele două zone. *Ar cădea dacă*: `free.delete` nu e apelat corect sau două proiecte pot revendica aceeași celulă.
5. **Stabilitate (cazul critic)**: aceleași 3 proiecte, `previous` = rezultatul primului apel, dar array-ul `projects` complet reordonat la al doilea apel → rezultatele trebuie să fie identice (`assert.deepEqual` pe obiectele convertite). Am ales dimensiuni care nu necesită creștere/tundere între cele două apeluri, ca să izolez strict efectul reordonării de orice contenție de creștere. *Ar cădea dacă*: algoritmul ar depinde de ordinea din `projects` în loc de conținutul lui `previous` — exact bug-ul pe care întregul task încearcă să-l prevină.
6. **Creștere**: proiect cu 1 celulă (rădăcină arbitrară, nu origine) care are nevoie de 3 → `cells[0]` rămâne exact rădăcina veche, lungime 3, rezultat conex. *Ar cădea dacă*: `growBlob` nu pornește de la `cells[0]` sau rădăcina se pierde la creștere.
7. **Micșorare**: proiect cu 3 celule (rădăcină + 2 vecine) care are nevoie de 1 → păstrează DOAR `previous[id][0]`. *Ar cădea dacă*: codul ar păstra alte celule vechi în loc de exact rădăcina, sau ar păstra mai multe.
8. **Rădăcina veche ocupată de altcineva**: `previous` artificial cu doi proiecte având aceeași rădăcină; primul din `projects` o revendică, al doilea trebuie re-sămânțat (rădăcina lui finală diferă de cea revendicată) fără excepție. *Ar cădea dacă*: codul ar arunca o eroare sau ar aloca aceeași celulă de două ori.
9. **Proiect dispărut**: id din `previous` absent din `projects` → nu apare în rezultat (`result.has('ghost') === false`), fără excepție. *Ar cădea dacă*: codul ar arunca sau ar include din greșeală id-ul dispărut.
10. **`isConnected` + fallback**: `previous` cu două zone la distanță Manhattan 11 de origine (rămân în raza pool-ului r<12, deci nu sunt re-sămânțate) dar la distanță 22 una de alta. Verific ÎNTÂI premisa (layout-ul brut, `layOut` direct, e neconex — confirmat cu `isConnected(raw) === false`), APOI că `allocateCells` (care aplică fallback intern) produce un rezultat final conex. *Ar cădea dacă*: fallback-ul din `allocateCells` ar fi eliminat sau `isConnected` ar avea un bug de flood-fill.
11. **`isConnected` — proiect singur cu creștere**: 9 celule construite din creștere rămân conexe (verificare suplimentară, nu doar cazul trivial `size<2` din `isConnected`).
12. **Pool epuizat**: 40 de proiecte a câte 9 celule (`size=57`) = 360 celule cerute, față de un pool plafonat matematic la 265 (suma punctelor la distanță Manhattan 0..11, plafon hard `r<12`). Verific: nu aruncă, total alocat ≤ 265, cel puțin un proiect primește `[]`, și nicio celulă nu e alocată de două ori. Nu am folosit „sute” de proiecte — 40 e minimul practic pentru a depăși sigur cele 265 de celule, calculat explicit în comentariu, deci reproductibil determinist, nu un scenariu forțat absurd.

## Ce NU am acoperit (și de ce)

- **Nu am testat exact CE celulă anume primește un proiect re-sămânțat** în cazul 8/12 dincolo de "nu e cea revendicată deja" / "nu aruncă" — brief-ul nu specifică un contract exact pentru alegerea rădăcinii de rezervă dincolo de "prima liberă din pool în ordinea inelelor", pe care l-am verificat deja la cazul 3 (proiecte noi). Repetarea ar fi redundantă.
- **Nu am testat `ring()`/`manhattanDistance()` izolat** — sunt funcții helper simple, acoperite indirect prin toate testele de mai sus (poziția exactă a rădăcinilor confirmă corectitudinea lor).
- **Nu am testat `growBlob` izolat** — brief-ul cere comportamentul prin `layOut`/`allocateCells`, ceea ce am făcut (cazurile 2, 6, 11).
- **Nu am scris un test pentru "sute de proiecte" cerut ca variantă absurdă de brief** — l-am înlocuit cu varianta practică de 40 de proiecte (vezi cazul 12), care e determinist și rulează rapid.

## Suspiciuni de bug

Niciuna găsită în timpul scrierii testelor. Comportamentul `[]` la epuizarea pool-ului (decizia coder-ului, semnalată explicit în raportul lui) e doar confirmat de test, nu contestat — decizia îi aparține planner-ului dacă vrea alt comportament.

## Comanda exactă de rulare

```powershell
node --test test/zones.test.mjs
```

sau, pentru tot suite-ul de teste al proiectului:

```powershell
node --test
```
