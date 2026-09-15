# RF-04-d — brief tester: două regresii de la redenumirea jocului vechi (RF-04)

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu afirmi că testele trec.**
**Context:** RF-04 a redenumit `public/app.js` → `public/game.js` și `public/style.css` → `public/game.css` (jocul vechi rămâne funcțional, doar mutat). Doi teste vechi, existenți dinainte de RF-04, referă direct vechile nume și au picat la rularea completă a suitei.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. `test/app.test.mjs` — calea către sursă e greșită

```js
const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
```

Fișierul nu mai există la acea cale — a fost redenumit la `public/game.js` (conținut IDENTIC, doar numele s-a schimbat). Rezultat: `fs.readFileSync(APP_JS_PATH)` aruncă la încărcarea fișierului, iar TOATĂ suita din `app.test.mjs` (~150+ teste, tot ce ține de jocul vechi — T-01 până la T-19) eșuează să se încarce.

**Ce trebuie**: schimbă `APP_JS_PATH` să pointeze la `public/game.js`. Verifică dacă mai există alte constante similare în fișier care pointează la `zones.js`/`merge-state.js` — ACELEA nu s-au mutat, rămân neschimbate. Comentariile din fișier care menționează „`public/app.js`" descriptiv (fără să fie o cale de fișier folosită efectiv în cod) NU trebuie schimbate obligatoriu — sunt doar documentare istorică, nu afectează comportamentul; poți actualiza mențiunile dacă vrei claritate, dar nu e obligatoriu.

## 2. `test/server.test.mjs` — testul D9 referă `/app.js`

```js
test('D9: GET /app.js?v=1 -> 200, același conținut ca GET /app.js', async () => {
  ...
  fetch(`${baseUrl()}/app.js?v=1`),
  fetch(`${baseUrl()}/app.js`),
```

`/app.js` nu mai există ca fișier static servit — a devenit `/game.js`. Testul D9 verifică un comportament al SERVERULUI (servirea corectă cu query string, D9 din auditul RF-01), nu ceva specific numelui `app.js` — **schimbă doar calea la `/game.js`** (sau `/hud.js`, orice fișier static existent — `game.js` e înlocuirea directă și cea mai apropiată de intenția originală a testului). Actualizează și titlul testului dacă vrei consecvență (`GET /game.js?v=1`).

## 3. Ce NU e o schimbare validă

- Nu schimba ce testează D9 (comportamentul query-string-ului) — doar calea fișierului țintă.
- Nu atinge testele din `app.test.mjs` care verifică logica jocului însuși (comportament neschimbat, doar sursa se citește de la altă cale).

## 4. Fișiere

**Poți modifica:** `test/app.test.mjs` (doar `APP_JS_PATH`), `test/server.test.mjs` (doar testul D9).

**NU atinge:** `public/**`, `server.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `adapters/**`, alte fișiere de test, documentele de coordonare.

## 5. Raportul

`docs/handoff/RF-04-d-tester-raport.md`: ce ai schimbat exact, comanda de rulare a întregii suite.

## 6. Constrângeri

- Nu rulezi comenzi. Nu afirma că „acum trece". Română.
