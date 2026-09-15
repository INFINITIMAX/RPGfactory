# RF-04-d — raport tester

**Data:** 15-09-2026, EET.
**Rol:** tester. Nu am rulat comenzi.

## Ce am schimbat

### `test/app.test.mjs`
- Linia `const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');`
  → `const APP_JS_PATH = path.join(__dirname, '..', 'public', 'game.js');`
- Am verificat `MERGE_STATE_JS_PATH` și `ZONES_JS_PATH` — pointează în continuare la `merge-state.js` și `zones.js`, neschimbate (nu s-au mutat, conform brief).
- Comentariile care menționează descriptiv „app.js” (ex. linia 37, „T-10: app.js folosește acum...") le-am lăsat neatinse — sunt documentare istorică, nu căi de fișier folosite în cod; brief-ul spunea că actualizarea lor e opțională, nu obligatorie, și am ales să nu le ating ca să minimizez diff-ul.
- Nu am modificat nimic altceva în fișier.

### `test/server.test.mjs`
- Testul D9 (unicul modificat):
  - Titlu: `'D9: GET /app.js?v=1 -> 200, același conținut ca GET /app.js'` → `'D9: GET /game.js?v=1 -> 200, același conținut ca GET /game.js'`
  - Corp: `fetch(\`${baseUrl()}/app.js?v=1\`)` → `fetch(\`${baseUrl()}/game.js?v=1\`)`, `fetch(\`${baseUrl()}/app.js\`)` → `fetch(\`${baseUrl()}/game.js\`)`
  - Restul testului (asserturile pe status 200 și egalitatea body-urilor) neschimbat — comportamentul verificat (query string nu rupe rezolvarea fișierului static) e identic.
- Al doilea test D9 (`GET /api/agents?x=1 e tratat ca rută API...`) nu a fost atins.

## Ce NU am atins
- `public/**`, `server.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `adapters/**` — conform interdicției.
- Nicio altă logică de test din `app.test.mjs` sau `server.test.mjs`.

## Ce ar face testele să cadă
- `app.test.mjs`: dacă `public/game.js` nu există sau conținutul diferă de ce se aștepta la vechiul `app.js`, `fs.readFileSync` aruncă la încărcare și toată suita (T-01...T-19) pică la load, exact simptomul descris în brief pentru calea greșită.
- `server.test.mjs` D9: dacă serverul nu mai servește `/game.js` static (rută ștearsă/redenumită diferit, sau query string ajunge greșit în rezolvarea fișierului), testul pică pe `assert.equal(withQuery.status, 200, ...)` sau pe compararea body-urilor.

## Comanda de rulare a întregii suite

```powershell
cd D:\RPGfactory
node --test test/
```

(sau comanda `npm test` din `package.json`, dacă există un script definit — planner-ul confirmă care e cea folosită curent în proiect).
