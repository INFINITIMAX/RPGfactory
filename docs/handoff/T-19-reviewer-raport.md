# T-19 — Raport reviewer

## Verdict: ACCEPT

Am verificat toate cele 7 fișiere cerute, în ordine.

### 1. Portarea din bot-crossing (server.js)
`LOCAL_HOSTS`, `hostnameOf`, `isLocalRequest` sunt portate identic cu brief-ul, caracter cu caracter. Logica `isLocalRequest` acoperă corect toate cazurile cerute:
- Host invalid → `false` imediat (prima linie), nu ajunge nici la Origin.
- Origin absent + GET/HEAD → `true` (navigare normală permisă).
- Origin absent + POST/PUT → `false` (cade pe `return req.method === 'GET' || 'HEAD'`).
- `Origin: "null"` literal → exclus explicit de `origin !== 'null'`, cade la verificarea de metodă → `false` pentru POST/PUT.
- Origin cross-site → `hostnameOf` extrage hostname-ul corect, comparație cu `LOCAL_HOSTS` → `false`.

### 2. Plasarea gate-ului
Gate-ul e primul lucru din callback-ul `http.createServer`, înaintea oricărei rute `/api/*`, condiționat strict de `req.url.startsWith('/api/')`. Servirea statică din `public/` e complet în afara acestui `if`, deci neafectată — corect, exact cum cere brief-ul.

### 3. Cod inutil
Nu am găsit nimic în plus față de brief. Coder-ul nu a atins niciun alt fișier, nu a introdus opțiuni/abstracții neplanificate.

### 4. Testele H1-H7 (server.test.mjs)
Fiecare test are un caz concret de eșec identificabil:
- H1/H7 verifică marginile gate-ului (GET fără Origin trece; fișiere statice neafectate chiar cu Origin evil).
- H2 e control pozitiv (Origin local nu blochează fals).
- H3/H4/H5 acoperă exact cele trei moduri de respingere (Origin extern, Origin absent, `"null"` literal).
- H6 e soluția corectă pentru limitarea reală a `fetch`/undici (care tratează `Host` ca header interzis, ne-suprascriptibil). `http.request` nativ permite suprascrierea lui `Host`, testând efectiv calea de cod `req.headers.host`, nu ocolind-o. Include și control pozitiv (Host+Origin corecte → nu 403). Nu sunt teste redundante, fiecare acoperă o ramură distinctă din `isLocalRequest`.

### 5. Reparațiile mecanice (state.test.mjs, api-open.test.mjs)
Header-ul `Origin` a fost adăugat o singură dată, în punctul central (`putState`/`postOpen`), de unde se propagă la toate apelurile PUT/POST din fișier. Cererile GET rămân neschimbate. Asertările de status/body originale sunt neschimbate — reparația e strict infrastructură, nu a slăbit nicio verificare.

Nu am găsit probleme. Brief, cod, teste și rapoarte sunt coerente între ele.

Fișiere verificate: `docs/handoff/T-19-coder.md`, `server.js`, `docs/handoff/T-19-coder-raport.md`, `docs/handoff/T-19-tester.md`, `test/server.test.mjs`, `test/state.test.mjs`, `test/api-open.test.mjs`, `docs/handoff/T-19-tester-raport.md`.

---

## Decizia planner-ului

Accept T-19. Am verificat manual, pe serverul real pornit, cele 4 scenarii din brief plus servirea statică (toate corecte) înainte de review, plus suita completă (205 teste, 0 eșecuri).

T-19 închis. Serverul acceptă acum doar cereri de la propria pagină (Host + Origin), portat verificat din mecanismul bot-crossing.
