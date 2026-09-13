# T-19 — Raport tester

## Fișiere atinse

### 1. `test/server.test.mjs` (extins, nu recreat)

Adăugat la finalul fișierului un bloc nou de teste (`T-19 — Teste pentru validarea Host/Origin`), plus adăugarea header-ului `Origin: BASE_URL` în helper-ul `post()` existent (folosit de toate testele T-18 din acest fișier).

Teste noi:

- **H1** `GET /api/agents` fără `Origin` → 200. Cade dacă gate-ul ar începe (greșit) să blocheze și GET-urile.
- **H2** `POST /api/reveal` cu `Origin: http://localhost:<port>` (folder valid) → 200 `{ok:true}`. Cade dacă gate-ul ar respinge un Origin local legitim (fals pozitiv de securitate) sau dacă logica de business din spate s-ar rupe.
- **H3** `POST /api/reveal` cu `Origin: http://evil.com` → 403 `{ok:false,error:"forbidden"}`. Cade dacă verificarea de Origin ar fi eliminată/slăbită sau dacă mesajul de eroare s-ar schimba fără motiv.
- **H4** `POST /api/reveal` fără header `Origin` deloc → 403. Cade dacă absența lui `Origin` pe POST ar fi tratată ca "permis" (regresie de securitate directă — exact scenariul curl simplu descris în brief).
- **H5** `POST /api/reveal` cu `Origin: "null"` (string literal) → 403. Cade dacă `isLocalRequest` ar trata greșit `'null'` ca origin valid (bug specific menționat explicit în brief — `origin !== 'null'`).
- **H6** (folosind `http.request` nativ, nu `fetch`, pentru control asupra header-ului `Host`):
  - `Host: evil.com` + `Origin` local → 403 (verificare Host, nu doar Origin — scenariul de DNS rebinding din brief).
  - control pozitiv: `Host: 127.0.0.1:<port>` + `Origin` local → nu 403 (confirmă că setup-ul cu `http.request` funcționează corect și nu blochează fals cererile legitime).
- **H7** `GET /` cu `Origin: http://evil.com` → 200, și `GET /style.css` fără `Origin` → 200. Cade dacă gate-ul Host/Origin ar fi mutat greșit înaintea servirii fișierelor statice (ar rupe încărcarea UI-ului din orice context care nu trimite `Origin`/`Host` "curat").

Notă tehnică pe H6: `fetch` (undici) tratează `Host` ca header interzis și nu permite suprascrierea lui din opțiuni — de aceea am folosit `http.request` nativ, care nu filtrează `Host` din `headers`, pentru conexiune TCP reală către `127.0.0.1:<port>` cu `Host` extern falsificat. Am verificat comportamentul citind codul (`isLocalRequest` verifică `req.headers.host`, care e populat direct din ce trimite clientul), nu presupus.

### 2. `test/state.test.mjs` (reparație mecanică)

Header-ul `Origin: BASE_URL` (`http://localhost:5392`) adăugat în helper-ul `putState()`, singurul loc din fișier care face PUT către `/api/state`. Fără Origin, toate cele 6+ teste PUT din acest fișier ar fi picat cu 403 în loc de 200/400/409 — nu pentru că logica de state s-ar fi rupt, ci pentru gate-ul nou de Host/Origin. Asertările de status/body au rămas neschimbate.

### 3. `test/api-open.test.mjs` (reparație mecanică)

Header-ul `Origin: BASE_URL` (`http://localhost:5391`) adăugat în helper-ul `postOpen()`, singurul loc care face POST către `/api/open`. Aceeași motivație ca mai sus. Asertările de status/body au rămas neschimbate.

## Ce NU am acoperit (și de ce)

- **Header `Host` prin `fetch` direct** — imposibil de controlat curat cu `fetch`; am folosit `http.request` (vezi H6), care e o soluție echivalentă și determinist controlabilă.
- **Adresele LAN din `LOCAL_HOSTS`** (bucla peste `os.networkInterfaces()`) — nu am testat că o adresă LAN reală a mașinii e acceptată ca `Host`/`Origin`, pentru că adresa depinde de mașina pe care rulează testul (nedeterminist între mașini/CI). Codul e simplu de citit (buclă directă, fără logică suplimentară) și acoperit indirect de faptul că `localhost`/`127.0.0.1` (hardcodate în `LOCAL_HOSTS`) urmează exact aceeași cale de verificare.
- **Combinația `Host` valid + `Origin` fără scheme (ex. doar `evil.com`, nu `http://evil.com`)** — `hostnameOf` are un fallback explicit (`'http://' + value` dacă lipsește `://`), deci comportamentul e deja acoperit funcțional de H3 (care folosește un URL complet); nu am dus mai departe pentru variante de formatare a header-ului, ca să nu umflu suita cu teste redundante ale aceleiași ramuri de cod.
- Nu am reintrodus/modificat testele T-18 existente de business logic (validare folder, JSON invalid etc.) — au rămas neschimbate ca asertări, doar cu `Origin` adăugat la request.

## Suspiciuni de bug

Niciuna nouă găsită. Codul din `server.js` (deja citit integral) se potrivește exact cu brief-ul T-19 și cu descrierea din raportul coder-ului; testele H1-H7 confirmă comportamentul descris acolo (a-d) plus cazurile suplimentare cerute în brief-ul de tester (`null` literal, Host neconform, fișiere statice neafectate).

## Comanda exactă de rulare

```powershell
node --test test/*.test.mjs
```

sau, pentru doar fișierele atinse de T-19:

```powershell
node --test test/server.test.mjs test/state.test.mjs test/api-open.test.mjs
```
