# T-19 — Teste pentru validarea Host/Origin

## Sarcină

Scrie teste pentru schimbările din `docs/handoff/T-19-coder.md` și `docs/handoff/T-19-coder-raport.md` (citește-le întâi), în `test/server.test.mjs` (fișierul existent, creat la T-18 — extinde-l, nu-l recrea).

## Avertisment explicit (efect secundar PREVIZIBIL, nu bug de descoperit)

Verificarea Host/Origin (T-19) respinge cu 403 orice cerere POST/PUT către `/api/*` care NU are deloc header-ul `Origin`. Testele existente care fac cereri HTTP reale către server (`test/state.test.mjs`, `test/api-open.test.mjs`, `test/server.test.mjs` de la T-18) probabil NU trimit acest header pe cererile lor PUT/POST — clientul HTTP standard din Node nu-l adaugă automat, spre deosebire de un browser real. Rezultat garantat: aceste teste vor începe să eșueze cu 403 în loc de statusul așteptat inițial (200/400/409), NU pentru că ceva e stricat, ci pentru că request-urile de test nu mai satisfac noua cerință de securitate.

Aceasta NU e o reinterpretare de comportament — e strict o corecție mecanică: adaugă header-ul `Origin: http://<host folosit de test>` (ex. `http://localhost:<port>` sau `http://127.0.0.1:<port>`, orice e deja în `LOCAL_HOSTS`) la FIECARE cerere POST/PUT existentă din cele 3 fișiere, ca să reflecte cum s-ar comporta o cerere reală din pagină. Cererile GET rămân neschimbate (nu au nevoie de `Origin`).

Verifică (rulează mental sau citește codul, planner rulează efectiv) care fișiere/teste sunt afectate și adaugă header-ul acolo unde lipsește, PĂSTRÂND exact aceleași asertări de status/body pe care le aveau — scopul e doar să nu mai pice din motive fără legătură cu ce testau ele inițial.

## Cazuri noi de acoperit (Host/Origin, `test/server.test.mjs`)

1. **GET la `/api/agents` fără header `Origin`** → 200 (comportament neschimbat — GET nu necesită `Origin`).
2. **POST la o rută `/api/*` (ex. `/api/reveal`) cu `Origin: http://localhost:<port>`** → trece la validarea normală de business (nu 403) — foloseşte un folder valid ca să obții 200, sau unul invalid ca să obții 400 (oricare arată că nu a fost blocat de Host/Origin).
3. **POST cu `Origin: http://evil.com`** → 403, indiferent de body.
4. **POST FĂRĂ header `Origin` deloc** → 403.
5. **POST cu `Origin: null`** (string literal `"null"`, cum trimit browserele din context de tip `file://`/sandbox) → tratat ca "fără origin valid" → 403 (verifică în cod: `origin !== 'null'` din `isLocalRequest`).
6. **Header `Host` neconform** (dacă poți controla asta la nivel de client HTTP din Node — verifică dacă `http.request` permite suprascrierea `Host`; dacă nu poți controla ușor, motivează în raport de ce ai omis acest caz, nu-l forța artificial).
7. **Servirea fișierelor statice (`GET /` sau `GET /app.js`) NU trece prin verificarea Host/Origin** — ar trebui să funcționeze indiferent de headere (verifică că un GET simplu la `/` sau `/style.css` tot dă 200).

## Ce NU e un test valid

- Nu slăbi verificarea Host/Origin ca să treacă testele vechi — repară testele vechi (adaugă `Origin`), nu codul de producție.
- Nu presupune un port fix — folosește portul de test existent din `server.test.mjs`.

## Constrângeri dure

- Nu modifica `server.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/server.test.mjs` (teste noi Host/Origin) + `test/state.test.mjs`/`test/api-open.test.mjs` (adăugare header `Origin` unde lipsește, dacă e cazul) + `docs/handoff/T-19-tester-raport.md`: ce fișiere/teste ai atins și de ce, ce ai testat nou, ce NU (motivat), comanda exactă de rulare a întregii suite.
