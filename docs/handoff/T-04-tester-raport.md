# T-04 — Raport tester

## Fișier modificat

- `D:\RPGfactory\test\app.test.mjs` — extins (nu fișier nou), cum a cerut brief-ul.

## Ce am extins în mock (`loadApp()`)

- `fakeCtx.arc/strokeRect/drawImage` acum sunt spy-uri care rețin argumentele exacte (nu mai sunt no-op).
- `fakeCtx.fill()` reține fillStyle-ul activ la momentul chemării (ca să pot verifica ce culoare a fost folosită pentru indicatorul de status, fără să retestez `colorForStatus`).
- `Image` e acum un constructor (`FakeImage`) care își reține instanțele într-un array din closure — `pawnImage` din `app.js` e exact acel obiect, deci pot apela manual `onload()` din test (`triggerImageLoad()`).
- `setInterval` e acum un spy (`fakeSetInterval`) care reține `{fn, ms}` pentru ambele bucle (`tick` la 3000ms, animația la 125ms) și le distinge după `ms < 1000`, nu după ordinea apelurilor — robust la reordonarea codului.
- `loadApp()` întoarce acum și `drawImageCalls`, `arcCalls`, `strokeRectCalls`, `fillCalls`, plus helperele `triggerImageLoad()` și `advanceAnimationFrame()`.

Testele T-01/T-02/T-03 existente nu au fost atinse logic — doar mock-ul de `fetch`/`fillStyle` etc. e neschimbat comportamental pentru ele (arc/strokeRect/drawImage rămân no-op în plus, deci ele nu observă nicio diferență).

## Teste noi (secțiunea „6. Sprite animat (T-04)”)

1. **`draw() NU cheamă drawImage cât timp imaginea nu s-a "încărcat"`**
   Verifică `drawImageCalls.length === 0` imediat după `setAgents()`, fără `triggerImageLoad()`.
   *Ar cădea dacă:* `draw()` ar chema `drawImage` necondiționat de `pawnImageLoaded`, sau dacă flag-ul ar porni `true` din greșeală.

2. **`după "încărcarea" imaginii, draw() cheamă drawImage cu cadrul 0 (sx=0,sy=0,sw=192,sh=192)`**
   Declanșează `onload`, apoi `draw()` manual, verifică exact parametrii de sursă.
   *Ar cădea dacă:* offset-ul de cadru ar fi calculat greșit, dimensiunea cadrului ar fi alta decât 192, sau `sy` n-ar fi 0.

3. **`cadrele de animație avansează ciclic 0..7 și revin la 0 după cadrul 7`**
   Apelează `advanceAnimationFrame()` de 10 ori (peste un ciclu complet + 2), verifică secvența exactă `[1,2,...,7,0,1,2]` dedusă din `sx / 192` la fiecare `drawImage`.
   *Ar cădea dacă:* animația n-ar fi ciclică (ex. `currentFrame++` fără `% 8`, deci ar continua peste 7), sau dacă cele două `setInterval`-uri s-ar confunda (ex. dacă `advanceAnimationFrame` ar nimeri accidental peste callback-ul de poll, testul ar arunca la `assert.ok(animation, ...)` — dar codul curent le separă corect după `ms`).

4. **`draw() desenează un indicator de status suplimentar (arc+fill) cu culoarea din colorForStatus`**
   Verifică exact un `arc()` + un `fill()` per agent viu, culoarea din `fill` egală cu `colorForStatus('busy')`, și centrul cercului la `(spriteX+56, spriteY)` — colțul dreapta-sus al sprite-ului, calculat din `hashToCellIndex`/`cellIndexToPosition` (nu hardcodat).
   *Ar cădea dacă:* indicatorul ar folosi altă culoare (ex. hardcodată), ar fi poziționat altundeva, sau ar lipsi complet.

5. **`draw() NU desenează indicatorul de status pentru agenți morți (alive=false)`**
   *Ar cădea dacă:* filtrul `if (!agent.alive) continue;` ar fi eliminat sau stricat — regresie pe comportament vechi pe care T-04 ar fi putut s-o introducă accidental prin refactorizare.

6. **`la agent selectat, strokeRect e chemat cu zona sprite-ului (spriteX,spriteY,56,56)`**
   Verifică `strokeRectCalls.length === 0` înainte de click, `=== 1` după, cu coordonate calculate din poziția reală a agentului (nu ghicite).
   *Ar cădea dacă:* conturul de selecție ar dispărea, ar folosi altă dimensiune decât 56×56, sau ar fi decalat față de sprite.

## Ce NU am acoperit (și de ce)

- **Randare pixel-cu-pixel** — exclus explicit de brief; nu există canvas real în acest mediu Node.
- **`STATUS_DOT_RADIUS` exact (6px)** — brief-ul cere doar „culoarea corectă" pentru indicator, nu raza exactă; am verificat poziția centrului și culoarea, nu al treilea argument al `arc()` (raza), ca să nu leg testul de o constantă vizuală minoră neexplicitată în cerințe.
- **Verificare vizuală reală în browser** (încărcare efectivă `/sprites/pawn-idle.png`, animație la 8 fps perceptibilă) — imposibil de testat din Node; rămâne pe lista de verificare manuală a planner-ului din raportul coder-ului.
- **Interacțiunea dintre cele două `setInterval`-uri când ambele rulează „simultan”** — nu am testat un scenariu combinat poll+animație suprapuse, pentru că `tick()` și bucla de animație sunt independente logic (nu au stare comună relevantă) — ar fi un test redundant.

## Suspiciuni de bug

Niciuna găsită. Codul din `app.js` (citit integral) se comportă conform descrierii coder-ului: `pawnImageLoaded` blochează corect `drawImage`, ciclul de cadre e `% SPRITE_FRAME_COUNT`, indicatorul și selecția folosesc corect `spriteX/spriteY` derivate din poziția de grilă.

## Comanda exactă de rulare (pentru planner)

```powershell
cd D:\RPGfactory
node --test
```

Nu am rulat nimic eu însumi (fără acces la shell, conform rolului).
