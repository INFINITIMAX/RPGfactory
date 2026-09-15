# RF-05a — raport tester

## Ce am testat
Fișier: `test/hex-layout.test.mjs`, `node:test` + `node:assert/strict`, import CommonJS via `createRequire` (același tipar ca `test/profiles.test.mjs`).

Acoperire pe numerotarea din brief §2:

1. Proiect nou fără istoric — size mic (o celulă) și size mare (mai multe celule, verificate ca bloc contiguu cu `isContiguous`, nu doar `.length`).
2. Creștere — celulele vechi păstrate exact ca set (`Set` de chei, nu doar lungime), celule noi adăugate, ansamblul rămâne contiguu.
3. Micșorare — rădăcina veche (`cells[0]` din `previous`) păstrată identic; la micșorare la 2 celule, verific egalitate exactă cu primele 2 din lista veche (implementarea renunță la ultimele adăugate, nu la un subset arbitrar).
4. Rădăcină veche ocupată de altcineva — construit cu două proiecte care „își amintesc" AMBELE aceeași rădăcină (`previous` inconsistent, ca sugerat în brief); primul din listă o revendică, al doilea e re-așezat pe altă celulă, fără suprapunere, fără excepție.
5. Proiect dispărut din `projects` — nu apare în rezultat; verificare indirectă că celulele redevin disponibile (un proiect nou complet diferit ajunge să ocupe originea eliberată de proiectul mare dispărut).
6. Conectivitate globală — un caz simplu cu trei proiecte contigue prin istoric, și un caz construit explicit cu o "insulă" la distanță 8 de restul (`previous` artificial) pentru a exercita fallback-ul la relayout complet; verific `isGlobalConnected` pe rezultatul final în ambele cazuri.
7. Pool epuizat — 60 de proiecte de `size: 1000` fiecare (cerere totală de celule cu mult peste plafonul fizic al pool-ului, indiferent de valoarea exactă a `MAX_CELLS`); verific că cel puțin un proiect primește `[]`, că toate cele 60 apar totuși în rezultat (nici unul lipsă), fără excepție și fără suprapunere.
8. Ordinea contează doar între proiecte noi — primul din listă (mai mare) ajunge mai aproape sau la fel de aproape de centru; proiect cu istoric ignoră poziția lui în `projects` (își păstrează exact aceleași celule).
9. `hexDistance` — simetrie, distanța la sine 0, toate cele 6 direcții axiale la distanță 1, punct opus pe aceeași axă la distanța cunoscută (6 pentru (3,0)↔(-3,0)).
10. `previous` lipsă (parametru implicit) și `previous` gol (`new Map()` explicit) — ambele nu aruncă și produc layout valid.
11. `cellsNeeded` indirect — `size` 0 și 1 dau tot o celulă; `size` moderat vs. uriaș dau exact același număr de celule (plafon intern), fără să lege testul de valoarea `MAX_CELLS`.

Am calculat manual capacitatea maximă a pool-ului (limitat de implementare la `ring < 12`, ~397 celule cumulate) ca să aleg un număr de proiecte/size care garantează epuizarea (§7) indiferent de constantele interne — 60×9 (plafon minim rezonabil) = 540 > 397.

## Ce NU am testat și de ce
- Randare, Canvas, conversie hex→pixeli — nu există în acest lot (exclus explicit din brief).
- Forma exactă a unui blob în caz de egalitate de scor în `growBlob` — verific doar proprietăți (contiguitate, mărime, apartenența rădăcinii), conform avertismentului coder-ului. Excepție: testele de micșorare (§3), unde comportamentul e determinist fără ambiguitate pentru că refolosesc exact `bigCells` deja calculate, deci ordinea nu mai depinde de tie-break-ul din `growBlob`.
- Nu am testat un caz cu `MAX_CELLS` exact 9 — evit orice legare de constanta internă neexportată, conform brief §11.

## Defecte reale găsite în hex-layout.js
Niciunul. Codul se comportă conform documentat în comentarii și în raportul coder-ului; nu am găsit discrepanțe între comportamentul așteptat (din brief/comentarii) și ce implementarea face de fapt.

## Decizii pe care le-am luat singur
- Pentru scenariul §4 (rădăcină ocupată de altcineva), am ales să simulez conflictul cu DOUĂ proiecte care rețin aceeași rădăcină în `previous`, nu cu un proiect nou care „fură" rădăcina unui proiect vechi — pentru că, urmărind ordinea reală de execuție din `layOut` (proiectele cu istoric își revendică rădăcina ÎNAINTEA oricărei alocări de proiect nou, indiferent de poziția din `projects`), un proiect nou nu poate ajunge fizic să ocupe rădăcina unui proiect vechi înaintea acestuia. Am verificat manual ordinea buclelor din `layOut` înainte de a scrie testul, ca să nu scriu un test care ar pica din motive greșite.
- Pentru §7 (pool epuizat), am calculat manual capacitatea cumulată a pool-ului (limitată de `ring < 12`, indiferent de cerere) ca să aleg un număr de proiecte care garantează exhaustarea real, nu doar probabil — cu un număr mai mic (testat mental cu 40 de proiecte × 9 celule = 360) cererea totală rămânea sub capacitatea pool-ului (~397) și testul ar fi fost fragil/fals-pozitiv.
- Pentru §5 (celule eliberate), am verificat direct că un proiect nou complet diferit poate ocupa exact originea (`{q:0,r:0}`), pe baza faptului că `pool.find` explorează spiralat din centru și originea e mereu primul candidat liber — asumpție documentată explicit în test (`assert` cu mesaj „presupunere: rădăcina e originea”).

## Contradicții găsite în brief
Niciuna.
