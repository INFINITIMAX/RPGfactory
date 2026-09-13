# T-19 — Validare Host/Origin pe server (anti-DNS-rebinding + CSRF)

## Context / referință verificată (bot-crossing)

Planner a citit `server/api.mjs` din bot-crossing (`/tmp/claude/bot-crossing-trial`, liniile 283-330). Mecanismul lor, portat 1:1:

- **`Host`** oprește DNS rebinding: un atacator care mapează `evil.com` la `127.0.0.1` ajunge la server ca pagină "same-origin", dar request-ul rebound tot poartă `Host: evil.com` — respins dacă `Host` nu e un nume local cunoscut.
- **`Origin`** oprește CSRF: un `fetch` cross-site cu body `text/plain` nu declanșează preflight CORS, deci fără verificarea asta orice pagină deschisă în același browser ar putea POST-a pe server-ul nostru (arhivare, deschidere de sesiuni, etc.), chiar dacă nu i-ar putea citi răspunsul.
- O cerere care schimbă starea (POST/PUT) FĂRĂ header `Origin` deloc e respinsă — browserele trimit mereu `Origin` pe POST/PUT, deci absența lui înseamnă că cererea nu vine de la pagina noastră (un `curl` simplu ar fi respins, intenționat — corect pentru un server local de dezvoltare).
- GET/HEAD fără `Origin` sunt permise (navigarea normală în browser nu trimite mereu `Origin` pe GET).

## Sarcină

Modifică DOAR `server.js`.

### 1. Portează `LOCAL_HOSTS`, `hostnameOf`, `isLocalRequest`

Adaugă, lângă celelalte constante de sus (după `PORT`):

```js
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// Adresele LAN proprii ale mașinii contează și ele ca "locale" — util dacă
// serverul e vreodată pornit accesibil din rețeaua locală, nu doar loopback.
for (const addrs of Object.values(os.networkInterfaces())) {
  for (const a of addrs || []) {
    if (a && a.family === 'IPv4' && !a.internal && a.address) LOCAL_HOSTS.add(a.address);
  }
}

function hostnameOf(value) {
  if (!value) return '';
  const raw = String(value).includes('://') ? value : 'http://' + value;
  try {
    return new URL(raw).hostname.replace(/^\[|\]$/g, '');
  } catch (e) {
    return '';
  }
}

function isLocalRequest(req) {
  if (!LOCAL_HOSTS.has(hostnameOf(req.headers.host))) return false;

  const origin = req.headers.origin;
  if (origin && origin !== 'null') return LOCAL_HOSTS.has(hostnameOf(origin));
  return req.method === 'GET' || req.method === 'HEAD';
}
```

`os` e deja importat în `server.js` (linia 4) — nu trebuie un `require` nou. `URL` e global în Node.

### 2. Aplică verificarea la TOATE rutele `/api/*`

Chiar la începutul funcției `http.createServer((req, res) => { ... })`, înainte de primul `if (req.url === '/api/agents')`, adaugă:

```js
if (req.url.startsWith('/api/') && !isLocalRequest(req)) {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
  return;
}
```

Asta acoperă automat TOATE rutele existente (`/api/agents`, `/api/open`, `/api/reveal`, `/api/new-session`, `/api/state` GET/PUT) fără să le modifici individual — un singur punct de control, la intrare. Servirea fișierelor statice (`public/`) rămâne neatinsă, nu trece prin această verificare (nu începe cu `/api/`).

## Constrângeri dure

- Nu modifica `public/zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `public/app.js`, `public/style.css`, `public/index.html`.
- Nu adăuga npm dependencies.
- Nu schimba nimic din logica existentă a rutelor `/api/*` (validare body, răspunsuri) — doar adaugă verificarea Host/Origin ÎNAINTE de ele.
- Nu bloca servirea fișierelor statice din `public/` — acestea nu trec prin `/api/`, deci nu sunt afectate.

## Ce NU are voie să atingă

Orice fișier în afară de `server.js`.

## Predare

`docs/handoff/T-19-coder-raport.md`: ce ai adăugat exact, și descrie (nu poți rula) ce s-ar întâmpla pentru: (a) o cerere GET normală din browser la `http://localhost:5311/api/agents` (fără Origin) — ar trebui să treacă; (b) un POST cu `Origin: http://evil.com` — ar trebui respins cu 403; (c) un POST fără niciun header `Origin` — ar trebui respins cu 403; (d) un `curl -X POST ... -H 'Origin: http://localhost:5311'` — ar trebui să treacă.
