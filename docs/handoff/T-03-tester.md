# T-03 — Teste pentru „deschide sesiunea"

## Sarcină

Scrie teste pentru logica din `server.js` legată de `POST /api/open` (vezi `docs/handoff/T-03-coder.md` și `docs/handoff/T-03-coder-raport.md`).

Planner a verificat deja manual, cu `curl`, cele 3 cazuri de bază (sesiune validă → `{ok:true}`, JSON invalid → 400, `sessionId` lipsă → 400, serverul rămâne sus în toate cazurile) — toate au trecut. Testele tale trebuie să acopere asta programatic, plus cazuri suplimentare.

## Ce trebuie testat cu adevărat

`server.js` e un script cu efecte de bord la încărcare (`server.listen(...)`), la fel ca `rank.js`/`app.js` din task-urile anterioare. Verifică dacă funcțiile relevante (construirea URL-ului `claude://resume?session=...`, parsarea body-ului, validarea `sessionId`) sunt separabile/testabile izolat fără să pornești serverul HTTP real. Dacă nu sunt exportate, ai două opțiuni legitime (alege motivat, nu modifica `server.js`):
1. Pornește efectiv serverul pe un port de test (`http.createServer`, ca în `server.js`, dar importat/copiat logic minim necesar) și fă cereri HTTP reale către el din test — evită mock-uri agresive.
2. Dacă logica de construire a URL-ului și de validare a body-ului e ușor de extras conceptual, testeaz-o descriind exact ce ai testat vs. ce ai lăsat neacoperit.

Preferă varianta 1 (server real, cereri HTTP reale, pe un port dedicat testelor, oprit la final) — e cel mai aproape de comportamentul real și nu depinde de refactorizări.

Cazuri de acoperit:
1. `POST /api/open` cu `{"sessionId": "abc-123"}` → `200`, body `{"ok":true}`.
2. `POST /api/open` cu body JSON invalid (ex. string care nu e JSON) → `400`, `{"ok":false,"error":"invalid JSON"}` (sau echivalent — verifică mesajul exact din cod, nu presupune).
3. `POST /api/open` cu `{}` (fără `sessionId`) → `400`.
4. `POST /api/open` cu `{"sessionId": ""}` (string gol) → verifică ce face codul REAL (brief-ul cerea "lipsește sau nu e string nevid" — confirmă că implementarea chiar tratează string gol ca invalid, nu doar `undefined`).
5. `POST /api/open` cu `{"sessionId": 123}` (număr, nu string) → verifică comportamentul real (ar trebui respins, dat fiind "nu e string nevid" din brief).
6. **Nu testa dacă `rundll32` chiar rulează** — nu ai cum să verifici asta portabil/determinist într-un test automat, și nu ar trebui să depinzi de un binar Windows real în `node --test`. Dacă vrei să verifici că serverul *încearcă* să deschidă ceva fără să depinzi de `rundll32` real, documentează limitarea clar, nu inventa un mock fals.
7. Confirmă că serverul rămâne funcțional după o cerere invalidă — ex. un `GET /api/agents` imediat după un `POST /api/open` cu body stricat, ca să confirmi că nu a crăpat (regresia de la T-01 cu `ERR_HTTP_HEADERS_SENT`).

## Ce NU e un test valid

- Un test care verifică doar codul de status HTTP fără body-ul răspunsului, unde body-ul contează.
- Mock-uri care înlocuiesc toată logica de rutare, testând de fapt propriul mock.

## Constrângeri dure

- Nu modifica `server.js`, `app.js`, `style.css`, `rank.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără framework/dependențe noi. Poți folosi `fetch` nativ (disponibil în Node 24) pentru cererile HTTP din test.
- Pornește serverul de test pe alt port decât 5311 (ca să nu intre în conflict cu instanța reală a lui Lucian), și oprește-l la final de suite (`after` hook din `node:test`).

## Predare

`test/api-open.test.mjs` (sau nume similar) + `docs/handoff/T-03-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare.
