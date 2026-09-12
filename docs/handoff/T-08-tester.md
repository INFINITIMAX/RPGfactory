# T-08 — Teste pentru alocarea zonelor (public/zones.js)

## Sarcină

Scrie teste pentru `public/zones.js` (vezi `docs/handoff/T-08-coder.md` și `docs/handoff/T-08-coder-raport.md`). E script clasic (fără `module.exports`) — încarcă-l cu `node:vm`, la fel ca `merge-state.test.mjs`. Planner a rulat deja verificări rapide manuale (proiect mare vs. mic primește proporțional mai multe celule, layout stabil la reordonarea proiectelor de intrare, micșorare corectă) — confirmate corecte. Testele tale trebuie să acopere asta sistematic, plus cazurile limită.

## Cazuri de acoperit

1. **`cellsNeeded`**: 1-7 agenți → 1 celulă; 8-14 → 2; ...; verifică plafonul `MAX_CELLS=9` (un număr foarte mare de agenți nu depășește 9 celule); 0 agenți → minim 1 (conform `Math.max(1, ...)`).
2. **Proiect nou, singur**: fără `previous`, un singur proiect → primește exact `cellsNeeded(size)` celule, toate conectate (verifică adiacența, nu doar numărul).
3. **Două proiecte noi**: cel mai mare (primul în listă, cum cere brief-ul — apelantul trebuie să sorteze) ia celula cea mai apropiată de origine; verifică că cele două zone nu se suprapun (niciun `{x,y}` comun).
4. **Stabilitate — cazul critic**: aceleași proiecte, cu `previous` = rezultatul unui apel anterior, dar în ALTĂ ordine în array-ul `projects` de intrare → rezultatul trebuie să fie IDENTIC (aceleași celule pentru fiecare id), nu doar "tot conex". Ăsta e motivul pentru care există tot algoritmul — un test care nu verifică asta ratează scopul task-ului.
5. **Creștere**: un proiect care avea 1 celulă și acum are nevoie de 3 → păstrează celula veche (rădăcina) și adaugă 2 vecine, alese după scorul de compactare (aproape de rădăcină, apoi aproape de origine) — verifică nu doar numărul de celule, ci că celula veche e inclusă.
6. **Micșorare**: un proiect cu 3 celule care acum are nevoie de 1 → păstrează DOAR rădăcina (`previous[id][0]`), renunță la restul.
7. **Rădăcina veche ocupată de altcineva**: dacă celula rădăcină a unui proiect nu mai e liberă (scenariu artificial în test — construiește un `previous` cu conflict), proiectul respectiv trebuie tratat ca nou (re-sămânțat), nu trebuie să arunce eroare.
8. **Proiect dispărut**: un id din `previous` care nu mai apare în `projects` nu apare deloc în rezultat, dar nu trebuie să arunce.
9. **`isConnected` + fallback**: construiește artificial un `previous` neconex (două zone plasate departe una de alta, fără nimic între ele, care ar rămâne izolate) — verifică că `allocateCells` produce un rezultat FINAL conex (a apelat fallback-ul intern), nu doar că nu aruncă. Poți testa `isConnected`-ul separat dacă e expus, sau indirect prin `allocateCells`.
10. **Pool epuizat** (cazul semnalat de coder ca decizie proprie): dacă vrei să confirmi comportamentul `[]` pentru un proiect nou fără nicio celulă liberă rămasă, scrie un test — dar nu forța un scenariu absurd de artificial (ex. sute de proiecte) doar ca să-l atingi; dacă nu e practic reproductibil în timp rezonabil, documentează-l ca netestat și de ce.

## Ce NU e un test valid

- Nu testa doar "nu aruncă" pentru cazurile de mai sus unde forma exactă a rezultatului contează (poziții, conectivitate).
- Nu presupune ordinea internă a array-ului de celule dintr-o zonă dacă brief-ul nu o specifică explicit — testează conținutul ca set unde ordinea nu e parte din contract, dar testeaz-o EXPLICIT ca listă (ex. rădăcina trebuie să rămână `cells[0]`) unde brief-ul chiar cere asta (creștere/micșorare, care depind de `cells[0]` ca rădăcină).

## Constrângeri dure

- Nu modifica `public/zones.js`.
- Nu rula comenzi.
- `node --test`, fără dependențe noi.

## Predare

`test/zones.test.mjs` (nou) + `docs/handoff/T-08-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare.
