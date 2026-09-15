# RF-05b-b — brief coder: corecție — harta nu se desenează deloc (coliziune de variabile globale)

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-05b-b — corecție a unui bug real găsit prin verificare vizuală reală în browser (nu prin teste automate — testerul nu putea prinde asta, e o interacțiune între două fișiere frontend care nu rulează în node:test).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Bug-ul găsit

Am pornit o instanță izolată a serverului (port separat, date sintetice — 3 proiecte cu profiluri), am deschis `index.html` într-un browser real și **harta a rămas complet neagră, deși `/api/world` întorcea date corecte** (verificat direct: `curl /api/world` → 3 zone valide, cu celule și accente).

Cauza, confirmată direct în pagină (nu presupusă): `public/hud.js` și `public/world.js` sunt amândouă `<script>` clasice (fără `type="module"`), încărcate în ACELAȘI scop global lexical al paginii. Amândouă declară la nivel de top:

```js
const POLL_INTERVAL_MS = 3000;   // în hud.js ȘI în public/world.js
let requestToken = 0;            // în hud.js ȘI în public/world.js
```

Când al doilea `<script>` (`world.js`) e parsat, browserul aruncă `SyntaxError: Identifier 'POLL_INTERVAL_MS' has already been declared` — o eroare de PARSARE, nu de execuție, care oprește **tot** fișierul `world.js` înainte să ruleze vreo linie din el, inclusiv `const canvas = document.getElementById('world-canvas')`.

Dovadă directă, din consola paginii reale:
```js
> POLL_INTERVAL_MS       // 3000 — vine din hud.js, singurul care a apucat să se execute
> typeof canvas          // 'undefined' — world.js nu a ajuns niciodată la prima lui linie utilă
```

`canvas.width` rămâne la valoarea din HTML (`800`), niciodată recalculată de `resizeCanvasForDPR()`, iar `ctx.getImageData(...)` confirmă zero pixeli desenați — harta e complet goală, tăcut, fără nicio eroare vizibilă pentru utilizator (browserul loghează eroarea în consolă, dar nimic din UI nu o arată).

**De ce testerul n-a putut prinde asta**: testele automate rulează în `node:test`, fără un DOM/browser real care să încarce ambele `<script>`-uri în același document — coliziunea de scop global între două fișiere `<script>` separate nu există în niciun mediu de testare pe care rolul de tester îl are la dispoziție. Exact genul de bug pe care regula proiectului de verificare vizuală reală (nu doar teste automate) există ca să-l prindă.

## 2. Sarcina

Repară coliziunea, fără să reintroduci disciplina de poll separată dintre `hud.js` și `world.js` (rămâne cerința RF-05b: module independente, fiecare cu propriul ciclu single-flight).

**Soluția cerută**: încapsulează TOT conținutul lui `public/world.js` într-un IIFE (`(function () { ... })();` sau `(() => { ... })();`), ca nicio declarație de la nivelul lui de top (`const`, `let`, `function`) să nu mai polueze scopul global al paginii. Asta e fix-ul standard pentru script-uri clasice care trebuie să coexiste fără `type="module"` — nu redenumi variabilele una câte una (fragil, ar putea colida din nou cu un nume viitor din `hud.js`), izolează tot fișierul.

**Verifică și `public/hud.js`** — dacă și el are nevoie de același tratament (adică dacă alte scripturi viitoare ar putea coliziona cu declarațiile lui de top), semnalează în raport, dar **NU-l modifica** decât dacă e absolut necesar pentru fix-ul de față (scopul acestui lot e `world.js`, nu o reorganizare a lui `hud.js`). Dacă IIFE-ul din `world.js` rezolvă complet problema fără să atingi `hud.js`, oprește-te acolo.

**Verifică, de asemenea**, dacă mai există alte identificatoare la nivel de top în `world.js` care ar putea coliziona cu ceva din `hud.js` (nu doar `POLL_INTERVAL_MS`/`requestToken`) — cu IIFE-ul aplicat corect, nu mai contează (totul devine local fișierului), dar confirmă în raport că ai citit ambele fișiere și ai verificat.

## 3. Cum verifici tu (fără browser, fără comenzi)

Citește codul cu atenție: după ce încapsulezi în IIFE, `const canvas = document.getElementById(...)`, `let zones`, `let requestToken`, toate funcțiile (`hexToWorld`, `corner`, `slotsForCell`, `resizeCanvasForDPR`, `draw`, `pollOnce`) și apelul final `pollOnce()` trebuie să rămână EXACT aceleași ca logică — doar învelite, nu rescrise. `window.addEventListener('resize', draw)` rămâne funcțional identic (IIFE nu schimbă cum funcționează event listener-ele globale).

Nu poți rula/testa tu — planner-ul reverifică vizual, din nou, pe aceeași instanță izolată, după ce livrezi.

## 4. Ce NU face acest lot

- Nu schimbă nimic din logica de desen, geometrie, polling, sau contractul `/api/world` — DOAR izolarea de scop.
- Nu atinge `hud.js` decât dacă e absolut necesar (vezi §2).
- Nu adaugă `type="module"` în `index.html` — asta ar schimba semantica scripturilor (module au propriul scop automat, dar și alte reguli — CORS pe `file://`, strict mode implicit, etc.) — schimbare mai mare decât necesar pentru acest bug. IIFE e suficient și minimal.

## 5. Fișiere

**Poți modifica:** `public/world.js` (obligatoriu). `public/hud.js` doar dacă motivezi explicit în raport de ce a fost necesar.

**NU atinge:** `public/index.html`, `public/hud.css`, `server.js`, `layout.js`, `world.js` (rădăcina proiectului, backend-ul pur — NU-l confunda cu `public/world.js`, frontend-ul), `hex-layout.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `test/**`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-05b-b-coder-raport.md`:

```
## Ce am reparat
Confirmă IIFE aplicat în public/world.js, cu diff-ul esențial (înainte/după, pe scurt).

## Am atins hud.js?
Da/nu, și de ce (dacă da, motivează strict).

## Alte coliziuni verificate
Ce alte identificatoare de top ai verificat între world.js și hud.js.

## Decizii pe care le-am luat singur

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 7. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că „acum funcționează" — nu poți verifica vizual, doar planner-ul poate.
- Română, în cod și raport.
