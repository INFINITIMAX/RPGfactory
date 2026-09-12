# T-12 — Raport reviewer

# Verdict: ACCEPT

Am citit, în ordine, toate cele 6 documente + `app.js`/`index.html`/`style.css` + secțiunea de teste noi și cele 3 teste corectate de planner. Concluzia: munca e solidă, ambele livrări (cod + teste) sunt acceptate, cu o singură observație de proces (nu de blocare) legată de corecțiile planner-ului.

## 1. Codul coder-ului (`D:\RPGfactory\public\app.js`, `index.html`, `style.css`)

Fidel briefului punct cu punct:
- `camera = {x:0,y:0,zoom:1}`, `MIN_ZOOM=0.3`, `MAX_ZOOM=3`, `worldToScreen`/`screenToWorld` — exact formulele din brief.
- `zoneCellToPixels` întoarce lume pură (`cell.x*CELL_SIZE`), fără `CANVAS_CENTER_X/Y` — corect eliminate.
- `SPAWN_POINT={x:0,y:0}` — originea lumii, cade în centrul ecranului la camera implicită.
- `draw()`/`drawZones()` — toate pozițiile trec prin `worldToScreen()` chiar înainte de desenare; dimensiunile (`cellSizeScreen`, `spriteSize`, `STATUS_DOT_RADIUS`, offset text) sunt corect înmulțite cu `camera.zoom`.
- Hit-test: `screenToWorld(clickX,clickY)` comparat cu poziția de lume din `agentMovement`, rază `CIRCLE_RADIUS` neschimbată (corect — rază în unități de lume).
- `resizeCanvas()` + listener pe `resize`, apelat și la încărcare.
- Wheel: `preventDefault`, `before = screenToWorld(cursor)`, zoom prin înmulțire cu clamp, recalcul `camera.x/y` cu noul zoom.
- Pan: `mousedown` pe canvas, `mousemove`/`mouseup` pe `window`, delta împărțită la `camera.zoom`, prag de 4px pentru distincția drag-vs-click.

**Verificare matematică independentă a ancorării zoom-ului** (cerută explicit la punctul 5):
Substituind `camera.x_new = before.x - (cursorX-center)/zoom_new` în `worldToScreen(before.x, before.y)` cu noul zoom:
`screenX = center + (before.x - camera.x_new)*zoom_new = center + (cursorX-center) = cursorX`.
Formula e corectă — punctul de sub cursor rămâne literalmente fix. Am verificat analog și pentru pan (`camera.x -= dx/zoom` face ca punctul de lume aflat sub cursor la `mousedown` să urmeze cursorul 1:1 după `mousemove`) — corect.

**Deciziile proprii ale coder-ului** — toate justificate, fără exces de scop:
- Titlul mutat ca overlay `fixed` (nu șters) — nu era cerut să dispară, decizie minimă și reversibilă (o linie).
- Eliminarea border-ului de pe canvas — motivat tehnic corect (box model ar produce scrollbar la `100vw/100vh`).
- Hit-test mutat din `click` în `mouseup` — brieful permitea explicit "verifică ce e mai simplu... motivează în raport"; motivarea (o singură sursă de adevăr pentru drag-vs-click) e solidă, nu e scope creep.

Constrângerile dure (fișiere neatinse, fără dependențe noi, fără pinch/touch, logica `updateAgentMovement`/`updateZones` neatinsă) — respectate, confirmat prin citire directă.

## 2. Reparațiile tester-ului la mock

Corecte și minimale: `fakeWindow` cu `addEventListener` care aruncă explicit pe evenimente neprevăzute (consecvent cu restul fișierului), `click(x,y)` reimplementat corect ca `mousedown+mouseup` fără mișcare (sub prag), `agentPixelPosition` convertit prin `worldToScreen` — elimină corect o potențială comparație lume-vs-ecran eronată. `TEST_SPAWN_POINT` actualizat corect la centrul canvas-ului mock (720×720, alegere documentată și rezonabilă). Nu ascund nimic — de fapt, dimpotrivă, corectarea din T-11 „recalculare țintă în at-site" (comparație LUME vs ECRAN) era un fals-pozitiv/negativ latent real, corect identificat și reparat.

## 3. Cele 3 corecții ale planner-ului post-predare

Am verificat eu însumi logica, independent:
- **Sunt regresii reale**, nu bug-uri preexistente mascate: am confirmat din cod că `spawning` nu mișcă deloc poziția (doar `entry.scale` crește, liniile 257-262 din `app.js`), și am verificat în `zones.js` (`layOut`) că proiectele sunt procesate în ordinea din `projects` (sortate descrescător după `size` în `updateZones()`), iar primul proiect "fresh" ia prima celulă din `pool`, care e construit pornind de la `ring(0)` = originea. Deci un proiect-ancoră cu 2 agenți (size 2 > 1) chiar ocupă garantat originea/SPAWN_POINT, confirmând exact diagnosticul planner-ului.
- **Soluția (proiect-ancoră)** e validă și, de fapt, mai fidelă scenariului real (mai multe proiecte concurează pentru origine) decât alternativa "mută artificial doar `TEST_SPAWN_POINT`" — aceea din urmă ar fi ascuns exact interacțiunea reală T-11×T-12 pe care testele trebuie s-o acopere. Corecțiile de index (`drawImageCalls[2]` în loc de `[0]`) și mărirea la +6 tick-uri (cu justificare matematică explicită: 42px > `CIRCLE_RADIUS`=28 față de ambele capete) sunt corecte și documentate cu comentarii clare în cod.
- **Clasificare**: consider că aceste 3 corecții sunt legitim "infrastructură de test" (reparare de asumpții rupte de o schimbare de scop aprobată — SPAWN_POINT→origine), nu decizii noi de design — nu schimbă CE se testează (mișcare monotonă, hit-test pe poziție afișată, non-ștergere prematură), doar restaurează corectitudinea setup-ului. Totuși, notez ca observație de proces: în litera regulii adoptate la T-10/T-11 ("orice interpretare trece prin tester"), varianta mai strictă ar fi fost retrimiterea la tester pentru aceste 3 fix-uri, chiar dacă sunt mecanice. Nu blochează acceptarea — planner a documentat exhaustiv diagnosticul (inclusiv `node -e`+`vm` de reproducere), dar recomand ca practică viitoare.

## 4. Cele 11 teste noi de cameră

Solide, fiecare cu "ce l-ar strica" clar:
1. Inverse `worldToScreen`/`screenToWorld` la zoom≠1 și translație≠0 — prinde orice eroare de semn.
2. Spawn centrat — prinde schimbarea formulei/valorii inițiale.
3. Zoom ancorat pe cursor (cursor NU în centru) — testul cel mai important, corect.
4. Clamp zoom (50 evenimente agresive în ambele direcții) — prinde eliminarea `min`/`max`.
5. Pan cu zoom≠1, izolat de translație (cursor exact în centru la wheel) — prinde omiterea împărțirii la zoom.
6/7. Prag drag-vs-click, ambele direcții (sub și peste prag) — prinde schimbarea `DRAG_THRESHOLD_PX`.
8. Resize — prinde `resizeCanvas()` ruptă.
9. Scalare sprite cu zoom (dw/dh dublate la zoom=2) — prinde omiterea `*camera.zoom`.

Niciun test nu e redundant sau ar trece indiferent de cod — toate verifică comportament observabil (nu implementare internă), cu toleranțe (`assertClose`) potrivite pentru float.

## Concluzie

**ACCEPT** — atât codul cât și testele. Formula de zoom e matematic corectă (verificat independent). Regresiile identificate de planner sunt reale și corect diagnosticate/reparate. Singura recomandare pentru viitor: pentru corecții similare de "presupunere ruptă de o schimbare de scop", trimite explicit înapoi la tester, chiar dacă fix-ul e mecanic — păstrează separarea de rol din regulă, fără cost real de timp semnificativ în acest caz.

Fișiere relevante:
- `D:\RPGfactory\public\app.js`
- `D:\RPGfactory\public\index.html`
- `D:\RPGfactory\public\style.css`
- `D:\RPGfactory\test\app.test.mjs`
- `D:\RPGfactory\public\zones.js` (verificare independentă `allocateCells`/`layOut`)
- `D:\RPGfactory\docs\handoff\T-12-coder.md`, `T-12-coder-raport.md`, `T-12-tester.md`, `T-12-tester-raport.md`

---

## Decizia planner-ului

Accept ambele livrări. Toate 134 de teste trec (`node --test` pe toate fișierele din `test/`). Confirmat live, în browser, de Lucian: zoom, pan și centrarea la spawn funcționează.

Accept observația de proces ca excepție justificată de data asta (spre deosebire de T-10/T-11): diagnosticul a fost riguros — reprodus independent cu un script `node -e`+`vm`, nu doar dedus din citit cod — și fix-urile nu schimbă CE testează testele, doar repară un setup rupt de o schimbare de scop deja aprobată (SPAWN_POINT→origine). Rămân atent să trimit la tester data viitoare chiar și pentru corecții mecanice, dacă timpul permite fără cost real.

T-12 e închis. Terenul (deja pregătit — apă + tilemap exportate) urmează acum, pe fundația nouă de cameră.
