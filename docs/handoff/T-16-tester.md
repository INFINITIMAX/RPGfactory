# T-16 — Teste pentru rezervarea celulei (0,0) (fix suprapunere turn/zonă)

## Sarcină

Scrie teste pentru schimbările din `docs/handoff/T-16-coder.md` și `docs/handoff/T-16-coder-raport.md` (citește-le întâi) în `test/zones.test.mjs` — fișierul existent, cu tiparul `vm` deja stabilit acolo (citește notele din capul fișierului despre `const` vs `function` la nivel de script). `RESERVED_CELL` e `const`, deci nu apare direct pe obiectul context — adu-l cu `vm.runInContext('RESERVED_CELL', ctx)`, la fel ca `cellsNeeded`.

## Cazuri de acoperit

1. **Un singur proiect nou, fără `previous`, NU primește `(0,0)` ca rădăcină** — verifică explicit că prima celulă din rezultat nu e `{x:0,y:0}` (înainte de T-16, acesta era exact comportamentul: primul proiect lua mereu originea).
2. **`(0,0)` nu apare NICIODATĂ în nicio zonă alocată**, indiferent de câte proiecte/agenți — testează cu mai multe proiecte (ex. 5-6, mărimi diferite) și verifică, pentru fiecare proiect din rezultat, că nicio celulă nu e `{x:0,y:0}`.
3. **Rădăcina veche `(0,0)` dintr-un `previous` salvat înainte de T-16** (simulează starea veche de pe disc, cu un proiect care avea `[{x:0,y:0}]` ca zonă salvată) — verifică că, după `allocateCells`, acel proiect NU mai păstrează `(0,0)`, ci e re-sămânțat în altă celulă liberă, fără eroare (cazul „rădăcina veche ocupată de altcineva", deja acoperit conceptual la T-08, dar acum cu cauza specifică „ocupată de rezervare", nu de alt proiect).
4. **`isConnected()` — celula rezervată ca „stepping stone"**: construiește manual (apelând `layOut`/`allocateCells`, sau construind direct un `Map` de rezultat dacă `isConnected` e apelabilă separat) un scenariu în care două grupuri de celule ale UNUI SINGUR proiect (sau a două proiecte diferite) ar fi conectate 4-direcțional DOAR trecând prin `(0,0)` — verifică că `isConnected` întoarce `true` (celula rezervată ajută la conectivitate, nu o blochează).
5. **`isConnected()` nu numără celula rezervată ca membru**: verifică (indirect, prin comportamentul `allocateCells`/`layOut` — dacă rezultatul unui scenariu normal, fără nicio ambiguitate de conectivitate, tot dă `true` pentru `isConnected`) că prezența `(0,0)` ca "passable" nu strică verificarea `seen.size === cells.size` în cazuri normale (regresie: dacă cineva ar uita `seen.delete(reservedKey)`, `isConnected` ar întoarce fals-pozitiv sau fals-negativ în anumite configurații — dacă poți construi un caz concret care ar cădea fără acel `delete`, cu atât mai bine, motivează în raport).
6. **Non-regresie**: rulează din nou (sau adaptează) testele T-08 existente care presupuneau `(0,0)` ca rădăcină a primului proiect (ex. „două proiecte noi: primul din listă ... ia celula cea mai apropiată de origine (0,0)") — dacă acel test presupunea explicit rădăcina `(0,0)`, adaptează-l la noua celulă așteptată (prima din `ring(1)`, nu `ring(0)`) și motivează în raport ce ai schimbat și de ce (analog modelului de „adaptare motivată" din raportul T-15-tester, nu ascunde regresii, doar actualizează presupunerea invalidată de T-16).

## Ce NU e un test valid

- Nu presupune o ordine exactă a celulelor din `ring(1)` dacă algoritmul nu o garantează explicit (verifică ce there e determinist, nu ce pare determinist din citirea codului).
- Nu testa detalii de implementare (nume de variabile interne) — testează comportament: ce celule apar/nu apar în rezultatul `allocateCells`/`layOut`, ce întoarce `isConnected`.

## Constrângeri dure

- Nu modifica `public/zones.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/zones.test.mjs` (teste noi + orice adaptare a testelor existente afectate) + `docs/handoff/T-16-tester-raport.md`: ce ai testat, ce ai adaptat din testele vechi și de ce, comanda exactă de rulare a întregii suite.
