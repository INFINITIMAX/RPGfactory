# RF-05d — brief coder: fundal de teren + o clădire simplă per proiect

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-05d — lot pur estetic, decis explicit de Lucian după ce a văzut harta (RF-05a/b/c) fără niciun fundal vizibil și fără clădiri. Strict decorativ — Canvas 2D, nimic legat de logica de stare.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

Harta actuală (`public/world.js`) desenează doar: fundalul canvas-ului (gol, culoarea paginii), hexagoanele zonelor (colorate cu accentul proiectului), sloturile (cerculețe), pawn-ii (cerculețe cu inițială). Nu există nimic care să sugereze „teren" sau „clădiri" — decizie deliberată la RF-05a/b/c (`spec.md` §7: „Estetica fină este backlog"), dar Lucian a cerut acum explicit să adăugăm minimul necesar ca harta să nu mai pară complet goală.

Două adăugiri, ambele PUR vizuale, în `public/world.js`:

1. **Un fundal de teren** — sub hexagoane, ca zona hărții să nu mai fie negru gol.
2. **O clădire simplă per proiect** — o singură clădire per zonă, la celula rădăcină, NU per profil/sesiune (P49 din `docs/PARITY.md`: „adaptare la specialiști/posturi stabile; reprezentarea estetică nu este încă înghețată" — o clădire per proiect e limita acestui lot, nu una per sesiune ca în bot-crossing original).

**Interdicție absolută, cf. `spec.md` §8**: „clean-clone setup, licențe și asset manifest, fără publicarea artei brute" — **NU folosești nicio imagine, niciun asset extern, niciun font special**. Totul se desenează procedural, cu forme Canvas 2D simple (dreptunghiuri, triunghiuri, gradient), exact ca restul lui `public/world.js` până acum.

## 2. Contractul

Toate modificările în `public/world.js`, în interiorul aceluiași IIFE deja existent (RF-05b/c) — nu rupe încapsularea.

### 2.1 Fundalul de teren

Într-o funcție nouă, `drawGround(originX, originY)`, apelată în `draw()` IMEDIAT după `ctx.clearRect(...)` și ÎNAINTE de a desena zonele (hexagoanele trebuie să rămână deasupra terenului, nu invers).

Cerințe:
- Un gradient radial simplu (`ctx.createRadialGradient`), centrat aproximativ pe centrul hărții (poți folosi `originX`/`originY`, care marchează deja centrul de aliniere al zonelor — dacă nu există nicio zonă încă, centrează pe mijlocul canvas-ului), de la o culoare de „teren" mai deschisă spre margine mai închisă (sau invers — decide tu, documentează, dar păstrează-l discret, NU domină vizual hexagoanele).
- Culoare de teren: un verde/maro neutru, discret, care se distinge de fundalul negru curent al paginii dar nu concurează cu accentele zonelor (care rămân mult mai saturate). Nu refolosi nicio culoare din `PALETTE` (world.js, backend) — aceea e rezervată zonelor.
- Acoperă o zonă rezonabilă din canvas — nu doar exact sub hexagoane (ar arăta ca niște pete separate) — un cerc/oval suficient de mare cât să pară „teren continuu", dar nici tot canvas-ul dacă hexagoanele sunt puține (ar arăta absurd de mare). Decide o rază proporțională cu extinderea zonelor curente (dacă nu există zone, un cerc mic, discret, în centru).
- Dacă nu există nicio zonă (`zones.length === 0`), tot desenează un petic mic de teren gol în centru (ca pagina să nu pară complet goală chiar și fără profiluri) — dar `draw()` face în prezent `return` devreme dacă `!zones.length` (vezi linia din `draw()`); mută apelul la `drawGround()` ÎNAINTE de acel `return`, ca terenul să apară chiar și fără zone.

### 2.2 Clădirea per proiect

Într-o funcție nouă, `drawBuilding(cx, cy, accent)`, apelată o singură dată per zonă, la celula RĂDĂCINĂ (`zone.cells[0]`, aceleași coordonate `cx`/`cy` deja calculate acolo unde se desenează eticheta proiectului) — apelată din interiorul buclei `for (const zone of zones)`, alături de codul care desenează eticheta.

Cerințe geometrice, ca să NU se suprapună cu sloturile (care ocupă centrul celulei și un inel la rază `TILE * 0.58`):
- Poziționează clădirea la o rază de aproximativ `TILE * 0.8` de centrul celulei, într-o direcție FIXĂ (ex. unghi 0, spre dreapta) — nu aleatoriu, ca poziția să fie stabilă între randări.
- Formă: un dreptunghi simplu pentru corp + un triunghi pentru acoperiș deasupra — o siluetă minimă de „clădire", nu un desen detaliat.
- Dimensiune mică, proporțională cu hexagonul (ex. lățime ~`TILE * 0.25`, înălțime corp similară) — trebuie să încapă vizibil în interiorul hexagonului, fără să iasă peste marginea lui.
- Culoare: corpul într-o culoare neutră (gri/bej discret, NU una din `PALETTE`), acoperișul în `accent` (culoarea zonei primită ca parametru) — ca legătura vizuală cu proiectul să fie clară, fără ca toată clădirea să fie în accentul saturat al zonei.
- Desenată ÎNAINTE de pawn-uri (în `draw()`, apelul la `drawBuilding` trebuie să fie înainte de `drawPawns(...)`), ca personajele să rămână vizibil deasupra clădirilor, nu ascunse de ele.

## 3. Ce NU face acest lot

- Nicio imagine/asset extern — totul procedural, cu forme Canvas 2D.
- Nicio clădire per sesiune/profil — o singură clădire per PROIECT (zonă), la rădăcină.
- Nicio interacțiune (click pe clădire, tooltip) — pur decorativ.
- Nicio schimbare de stare/semnificație — clădirea nu reprezintă un task, un status sau altceva funcțional; e doar decor. Nu inventa o legătură cu date reale care nu există (ex. nu face clădirea „mai mare" după nimic anume).
- Nicio schimbare la `hex-layout.js`, `layout.js`, `slot-store.js`, `world.js` (backend), `server.js`, migrații — pur frontend, în `public/world.js`.
- Nicio animație nouă pentru teren/clădiri (rămân statice, redesenate doar la poll/resize, ca restul hărții înainte de pawn-uri).

## 4. Fișiere

**Poți modifica:** `public/world.js` (DOAR acest fișier).

**NU atinge:** orice alt fișier — `public/hud.js`, `public/index.html`, `public/hud.css`, `public/game.*`, `public/zones.js`, `hex-layout.js`, `layout.js`, `slot-store.js`, `world.js` (rădăcina proiectului, backend), `server.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `test/**`, documentele de coordonare.

## 5. Raportul

`docs/handoff/RF-05d-coder-raport.md`:

```
## Ce am implementat
drawGround(...) și drawBuilding(...) în public/world.js, apelate din draw().

## drawGround — culoarea aleasă, raza, de ce apare și fără zone

## drawBuilding — poziția exactă (rază, unghi) și de ce nu se suprapune cu sloturile

## Ordinea de desenare confirmată
teren -> hexagoane -> clădiri -> pawn-uri -> etichete (sau orice ordine ai ales — confirmă explicit ce e deasupra a ce, și de ce).

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 6. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „arată bine" — nu poți verifica vizual, doar planner-ul poate.
- Română, în cod și raport.

### Citește înainte

1. `public/world.js` — tot fișierul, ca să înțelegi ordinea exactă de desenare din `draw()` și geometria existentă (`slotsForCell`, `hexToWorld`, `corner`).
2. `spec.md` §7 și §8 (estetica fină e backlog, dar și interdicția de artă brută/asset-uri nelicențiate).
3. `docs/PARITY.md` P49 (clădire per sesiune în original, adaptare la o clădire per proiect aici).
