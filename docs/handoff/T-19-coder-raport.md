# T-19 — Raport coder

## Fișiere modificate

`D:\RPGfactory\server.js` — singurul fișier atins.

1. După `const PORT = process.env.PORT || 5311;` am adăugat, exact ca în brief:
   - `LOCAL_HOSTS` (Set cu `localhost`, `127.0.0.1`, `::1`) + bucla peste `os.networkInterfaces()` care adaugă adresele IPv4 non-interne.
   - `hostnameOf(value)` — extrage hostname dintr-un header, cu fallback `http://` dacă valoarea nu conține deja un scheme.
   - `isLocalRequest(req)` — verifică `Host` contra `LOCAL_HOSTS`, apoi `Origin` (dacă există și nu e `'null'`), altfel permite doar GET/HEAD.
   - Nu am adăugat niciun `require` nou — `os` era deja importat la linia 4.

2. Chiar la începutul callback-ului `http.createServer((req, res) => { ... })`, înaintea lui `if (req.url === '/api/agents')`, am adăugat gate-ul:
   ```js
   if (req.url.startsWith('/api/') && !isLocalRequest(req)) {
     res.writeHead(403, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
     return;
   }
   ```

Nu am modificat nimic din logica rutelor existente (`/api/agents`, `/api/open`, `/api/reveal`, `/api/new-session`, `/api/state` GET/PUT) și nici servirea fișierelor statice din `public/` — aceasta nu trece prin `/api/`, deci nu e afectată de gate.

## Comportament așteptat (descriere, nu am rulat nimic)

a) **GET `http://localhost:5311/api/agents` fără `Origin`** — `Host: localhost:5311` e în `LOCAL_HOSTS` → trece prima verificare. `Origin` lipsește → cade pe `req.method === 'GET'` → `true`. Cererea e permisă, ajunge la handler-ul `/api/agents`.

b) **POST cu `Origin: http://evil.com`** — `Host` local trece, dar `origin` există și nu e `'null'` → se verifică `hostnameOf('http://evil.com')` = `'evil.com'`, care NU e în `LOCAL_HOSTS` → `isLocalRequest` întoarce `false` → gate-ul răspunde 403 `{"ok":false,"error":"forbidden"}`, fără să atingă handler-ul rutei.

c) **POST fără niciun header `Origin`** — `Host` local trece; `origin` e `undefined` → sare peste ramura `if (origin && ...)` → ajunge la `return req.method === 'GET' || req.method === 'HEAD'`, iar metoda e `POST` → `false` → gate-ul respinge cu 403. (Motivația din brief: un `curl` simplu, fără `Origin`, e respins intenționat pentru POST/PUT.)

d) **`curl -X POST ... -H 'Origin: http://localhost:5311'`** — presupunând că `Host`-ul cererii e tot `localhost:5311` (implicit când se dă URL `http://localhost:5311/...`), ambele verificări trec: `Host` local, `Origin` prezent și `hostnameOf` = `'localhost'`, care e în `LOCAL_HOSTS` → `isLocalRequest` = `true` → cererea trece de gate și ajunge la handler-ul rutei POST vizate.

## Ce nu am făcut

Nu am rulat nimic (nu am acces la shell) — planner-ul trebuie să valideze efectiv cele 4 scenarii de mai sus, plus să confirme că servirea `public/` (GET pe `/`, `/app.js`, `/style.css`) nu e afectată.

## Riscuri / de verificat de planner

- Confirmă că pornirea reală a serverului nu aruncă erori la parsarea `os.networkInterfaces()` pe mașina curentă.
- Testează manual cazurile (a)-(d) din brief, ideal cu `curl`/Postman, pentru confirmare empirică.
- Verifică dacă vreun client existent (ex. `public/app.js`) trimite deja `Origin`/`Host` corect — dacă frontend-ul rulează tot pe `localhost:5311`, browserul le setează automat corect, deci ar trebui să funcționeze fără modificări în `public/`.
