# T-14 — Lume vie: decorațiuni pe zone + nori care plutesc

## Sarcină

Adaugă decorațiuni pe hartă, ca să nu mai arate ca un dreptunghi plat de iarbă: tufe animate + stânci statice pe zonele proiectelor, plus câțiva nori care plutesc lent peste fundalul de apă. Scop: "teren concret, lume vie", nu doar textură repetată.

## Assets deja exportate

- `public/sprites/bush.png` — 1024×128px, **8 cadre de 128×128** (animație idle, tufa se leagănă ușor), verificat vizual.
- `public/sprites/rock1.png`, `public/sprites/rock2.png` — 64×64px fiecare, **statice** (fără animație), două variante diferite.
- `public/sprites/cloud1.png`, `public/sprites/cloud2.png` — 576×256px fiecare, **statice**, două forme diferite de nor.

## Rezultat așteptat

### 1. Decorațiuni pe zone (tufe + stânci)

Pentru fiecare celulă dintr-o zonă de proiect (`state.plots[projectId]`), decide DETERMINIST (nu aleatoriu la fiecare cadru — trebuie stabil între desenări, la fel ca poziționarea agenților pe hash) dacă acea celulă primește o decorațiune:

```js
function decorationForCell(projectId, cell) {
  const h = hashToCellIndex(projectId + ':' + cell.x + ',' + cell.y);
  if (h % 3 === 0) return { type: 'bush' };
  if (h % 3 === 1) return { type: 'rock', variant: h % 2 }; // 0=rock1, 1=rock2
  return null; // 1 din 3 celule rămâne goală, ca să nu fie prea aglomerat
}
```
(Poți ajusta pragurile/proporția dacă ți se pare vizual mai bine, dar păstrează principiul: determinist, din hash, nu `Math.random()`.)

Poziția în celulă: un colț fix (ex. colț dreapta-jos al celulei, cu un mic offset), NU centrul (acolo stau agenții) — alege ceva care nu se suprapune vizual cu unde apar agenții/sprite-ul lor. Dimensiunea desenată: destul de mică încât să nu domine celula (ex. jumătate din `CELL_SIZE`), scalată cu `camera.zoom` la fel ca restul elementelor de lume.

Desenează decorațiunile în `drawZones()`, DUPĂ umplerea+conturul zonei, ÎNAINTE de agenți (agenții trebuie să rămână vizibil deasupra).

**Tufa (`bush.png`) e animată** — 8 cadre, avansează pe aceeași buclă de animație deja existentă (`currentFrame`, de la T-04), la o viteză proprie dacă vrei (poți refolosi `currentFrame % 8` direct, nu trebuie contor separat, la fel cum s-a procedat la sprite-ul de alergare din T-11).

**Stâncile sunt statice** — un singur `drawImage` simplu, fără cadre.

### 2. Nori care plutesc peste apă

2-3 nori (`cloud1.png`/`cloud2.png`, alternând), cu poziții proprii care se deplasează lent pe orizontală, în spațiul de ECRAN (la fel ca fundalul de apă — ambientale, nu ancorate de lume):

```js
const clouds = [
  { image: 'cloud1', x: 100, y: 80, speed: 8 },  // px/secundă
  { image: 'cloud2', x: 500, y: 150, speed: 5 },
  { image: 'cloud1', x: 900, y: 60, speed: 10 },
];
```
La fiecare tick de animație (poți folosi bucla existentă de 125ms sau `updateAgentMovement` de 50ms — alege ce ți se pare mai simplu, motivează în raport), avansează `cloud.x += speed * dt`; când norul iese complet din dreapta ecranului (`x > canvas.width`), reapare din stânga (`x = -lățimea norului`). Desenează norii ÎN FUNDAL, imediat după apa (înainte de `drawZones()`), la o dimensiune redusă față de cei 576×256 nativi (ex. scalează la ~180×80 pe ecran — alege ce arată bine, nu trebuie exact).

## Constrângeri dure

- Nu modifica `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Decorațiunile NU sunt clicabile/selectabile — nu modifica hit-test-ul de click.
- Norii nu trebuie să blocheze vizual agenții/zonele — rămân în spatele lor (desenați devreme în `draw()`).

## Ce NU are voie să atingă

`public/zones.js`, `state.js`, `public/merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-14-coder-raport.md`: pragurile/proporția aleasă pentru decorațiuni (dacă ai ajustat-o), unde ai pus bucla de mișcare a norilor, cum se testează manual. **Include comanda/output-ul exact al oricărei verificări manuale.**
