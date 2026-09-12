# T-08 — Raport reviewer

## Verdict: ACCEPT

Am citit, în ordine, toate cele 6 fișiere. Concluzii pe fiecare axă cerută:

### 1. Codul din `public/zones.js`

Portarea e fidelă literă cu literă pseudocodului din brief: `SLOTS_PER_CELL`, `MAX_CELLS`, `key`, `ORIGIN`, `DIRS` (4 direcții), `manhattanDistance`, `ring`, `cellsNeeded`, `growBlob`, `isConnected`, `layOut`, `allocateCells` — toate identice structural cu ce a cerut planner-ul (D:\RPGfactory\docs\handoff\T-08-coder.md liniile 27-119 vs D:\RPGfactory\public\zones.js). Adaptarea hex→pătrat e corectă: 4 direcții în loc de 6, distanță Manhattan în loc de hex, `ring()` produce un romb (nu cerc hexagonal), fără nicio celulă de "navă" în `isConnected`. Nu există cod în plus — nicio funcție, opțiune sau abstracție neceruă. Coder-ul nu a atins niciun alt fișier, nu a integrat în `index.html`/`app.js`, respectă constrângerile dure.

### 2. Decizia `[]` la epuizarea pool-ului

Rezonabilă și consecventă: degradare gradată (zonă goală) în loc de excepție care ar bloca randarea celorlalte proiecte. Coder-ul a semnalat-o explicit ca decizie proprie nemenționată în brief (T-08-coder-raport.md, linia 24), exact cum cere procesul.

### 3. Corecția planner-ului la testul "pool epuizat" — verificată independent

Am recalculat mecanica algoritmului, nu doar am acceptat explicația:

- Bucla de construcție a pool-ului se oprește hard la `r < 12`. Suma cumulativă de celule pe inele Manhattan 0..11 este `1 + 2·r·(r+1)` la r=11 → **265 celule**, indiferent de `total+30` (pentru orice `total` suficient de mare, plafonul de 12 inele domină).
- Punctul-cheie: bucla de atribuire a rădăcinii pentru proiectele noi (`for (const c of pool) if (free.has(...))`) scanează **tot** pool-ul, nu doar vecinii adiacenți ai blob-ului curent — spre deosebire de `growBlob`, care caută doar vecini liberi adiacenți. Așadar un proiect nou primește `[]` doar când `free.size === 0` global, adică doar când **numărul** de proiecte noi depășește capacitatea pool-ului (265), nu când **suma cerută de celule** o depășește.
- Cu 40 proiecte × 9 celule dorite (scenariul vechi): fiecare din cele 40 poate găsi o rădăcină oriunde în pool (40 ≪ 265), deci toate primesc cel puțin 1 celulă; doar `growBlob` se oprește prematur pentru cei mai mulți (blob izolat de vecini liberi), dând alocări parțiale (1-9), niciodată `[]`.
- Cu 280 proiecte × 1 celulă (scenariul corectat): `want=1` pentru toți → `growBlob` nu se execută deloc (bucla `while (cells.length < want)` e deja falsă), deci totul se reduce strict la atribuirea rădăcinii = consum secvențial din pool. Cu 280 cereri de rădăcină și 265 disponibile, exact `280-265=15` proiecte rămân fără nicio celulă.

Concluzia planner-ului e corectă, nu doar plauzibilă — am derivat-o independent din cod, nu am presupus-o.

### 4. Restul celor 17 teste

Solide, nu redundante, nu trec "oricum":
- `cellsNeeded` (4 teste): ating pragurile exacte și plafonul — orice schimbare de `SLOTS_PER_CELL`/formulă le pică.
- Proiect nou singur / două proiecte noi: verifică numărul exact de celule, conectivitatea reală (`isConnected`), poziția exactă a rădăcinii (nu doar "există"), non-suprapunere prin comparație de set de chei — nu `toBeDefined`.
- Creștere/micșorare: verifică `cells[0]` explicit ca rădăcină păstrată, exact cum cere brief-ul ("unde brief-ul chiar cere asta").
- Rădăcină ocupată / proiect dispărut: verifică rezultatul concret (cine ia ce rădăcină), nu doar `doesNotThrow`.
- Fallback de conectivitate: verifică ÎNTÂI premisa (layout brut chiar neconex), APOI rezultatul final — evită capcana clasică a unui test care "ar trece oricum".

### 5. Testul de stabilitate la reordonare

Chiar dovedește ce trebuie: dacă implementarea ar ignora `previous` (bug clasic — recalculare de la zero ignorând istoricul), în runda a doua ordinea reordonată ar face ca alt proiect (`c` în loc de `a`) să ia celula `{0,0}`, pentru că toate ar fi tratate ca "fresh" și primul din listă ia originea — testul ar pica imediat prin `assert.deepEqual(secondObj, firstObj)`. Testul verifică deci exact mecanismul (`prevCells.length && free.has(root)`) care leagă rezultatul de `id`, nu de poziția în array.

O nuanță minoră, nu blocantă: testul a ales dimensiuni identice între runde ca să evite orice creștere (`growBlob`) în a doua rundă, deci nu acoperă cazul în care **două proiecte existente cresc simultan și concurează pentru aceeași celulă vecină** — acolo ordinea de procesare a listei `kept` (derivată din ordinea de intrare) ar putea influența cine câștigă celula disputată. Această proprietate există și în algoritmul original din bot-crossing (portat "exact", cum cere brief-ul), nu e o abatere introdusă de coder, și nu era cerută explicit ca test — o notez ca observație pentru viitor, nu ca motiv de respingere.

### Observație minoră (necritică)

`docs/handoff/T-08-tester-raport.md`, punctul 12, descrie încă scenariul vechi ("40 de proiecte a câte 9 celule ... 40 e minimul practic") — text neactualizat după ce planner-ul a corectat testul la 280 de proiecte de câte 1 celulă. Fișierul de test (`zones.test.mjs`) e corect și comentat explicit; doar raportul tester-ului a rămas în urmă. Recomand ca planner-ul să adauge o notă în raport (sau în `T-08-reviewer-raport.md`) menționând că testul de la punctul 12 a fost rescris ulterior, ca înregistrarea din `docs/handoff/` să reflecte fidel ce s-a livrat efectiv.

**Fișiere verificate:**
- D:\RPGfactory\docs\handoff\T-08-coder.md
- D:\RPGfactory\public\zones.js
- D:\RPGfactory\docs\handoff\T-08-coder-raport.md
- D:\RPGfactory\docs\handoff\T-08-tester.md
- D:\RPGfactory\test\zones.test.mjs
- D:\RPGfactory\docs\handoff\T-08-tester-raport.md

---

## Decizia planner-ului

Accept ambele livrări. Toate 91 de teste trec (`node --test` pe toate fișierele din `test/`).

Notă de sincronizare cerută de reviewer: `docs/handoff/T-08-tester-raport.md`, punctul 12, descrie scenariul vechi (40 de proiecte a 9 celule) — testul livrat efectiv (în `test/zones.test.mjs`) folosește 280 de proiecte a 1 celulă, corectat de mine după ce am descoperit că raționamentul inițial era greșit (vezi explicația tehnică completă mai sus, verificată independent de reviewer). Raportul tester-ului rămâne nemodificat ca istoric fidel al ce a predat el la momentul respectiv; discrepanța e documentată aici, în raportul reviewer-ului, ca sursă de adevăr pentru ce s-a livrat în final.

T-08 (algoritmul de alocare) e închis. Urmează T-09 (persistența layout-ului în `data/state.json`) și T-10 (integrarea în randare).
