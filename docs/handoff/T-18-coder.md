# T-18 — Meniu de acțiuni per agent: New session, Reveal in folder

## Context / referință verificată (bot-crossing)

Planner a citit `server/api.mjs` și `server/harnesses/claude-code.mjs` din bot-crossing (clonat local la `/tmp/claude/bot-crossing-trial`). Mecanismul lor, portat 1:1 la scara noastră (doar Claude Code, fără alte harness-uri):

- **Reveal in folder**: validează că folder-ul e o cale absolută, există și e director (`fs.statSync`), apoi îl deschide cu `rundll32 url.dll,FileProtocolHandler <folder>` (Windows) — EXACT același opener pe care noi îl folosim deja pentru `claude://resume?session=...` în `server.js` (`openInClaudeCode`, linia 65-70) — `rundll32`/`FileProtocolHandler` deschide și URL-uri de tip `claude://`, și căi de folder, la fel, fără diferență de tratament.
- **New session**: construiește link-ul `claude://code/new?folder=<dir>` (exact același scheme ca la resume, alt query) și îl deschide cu ACELAȘI opener.

Deci nu ne trebuie logică nouă de "opener" — doar generalizăm funcția existentă `openInClaudeCode` să accepte orice URL/cale, nu doar `claude://resume?session=...`.

## Sarcină

Modifică 3 fișiere: `server.js`, `public/app.js`, `public/style.css`. Nu atinge `public/zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `public/index.html`.

### 1. `server.js` — generalizează opener-ul + 2 endpoint-uri noi

Redenumește `openInClaudeCode(sessionId)` într-o funcție generică:

```js
function launchTarget(target) {
  const child = spawn('rundll32', ['url.dll,FileProtocolHandler', target], { stdio: 'ignore', detached: true });
  child.on('error', () => {});
  child.unref();
}
```

Actualizează handler-ul `/api/open` existent să cheme `launchTarget('claude://resume?session=' + data.sessionId)` în loc de `openInClaudeCode(data.sessionId)` (comportament IDENTIC, doar redenumit).

Adaugă o funcție de validare a folderului (portată din `resolveFolder` bot-crossing, adaptată la sincron/Node `fs`):

```js
function resolveFolder(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) return null;
  try {
    const stat = fs.statSync(folder);
    return stat.isDirectory() ? folder : null;
  } catch (e) {
    return null;
  }
}
```

Adaugă 2 handler-e noi, DUPĂ blocul `/api/open` existent, urmând EXACT același tipar de citire a body-ului JSON (`req.on('data', ...)`/`req.on('end', ...)`, validare, răspuns) ca `/api/open`:

- **`POST /api/reveal`** — body `{ folder: string }`. Dacă `resolveFolder(folder)` e `null` → `400 { ok:false, error:'folder invalid sau inexistent' }`. Altfel → `launchTarget(folder)`, răspunde `200 { ok:true }`.
- **`POST /api/new-session`** — body `{ folder: string }`. Aceeași validare. Dacă valid → `launchTarget('claude://code/new?' + new URLSearchParams({ folder }).toString())`, răspunde `200 { ok:true }`. Dacă invalid → `400 { ok:false, error:'folder invalid sau inexistent' }`.

`URLSearchParams` e global în Node, nu necesită `require`.

### 2. `public/app.js` — 2 acțiuni noi + 2 butoane în panoul de detalii

În `renderDetails()` (linia ~608), adaugă 2 butoane noi lângă `open-btn`/`hide-btn`, în același `<div>`:

```html
<div><button id="open-btn">Open</button> <button id="new-session-btn">New session</button> <button id="reveal-btn">Reveal in folder</button> <button id="hide-btn">Hide</button> <span id="open-error" class="open-error"></span></div>
```

Adaugă listener-ele corespunzătoare, lângă cele existente pentru `open-btn`/`hide-btn`:

```js
document.getElementById('new-session-btn').addEventListener('click', () => {
  newSessionForAgent(agent.cwd);
});
document.getElementById('reveal-btn').addEventListener('click', () => {
  revealAgentFolder(agent.cwd);
});
```

Adaugă cele 2 funcții noi, după `openAgentSession()` existentă, urmând EXACT același tipar (fetch POST, `errorEl.textContent` la eșec):

```js
async function newSessionForAgent(cwd) {
  const errorEl = document.getElementById('open-error');
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/new-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: cwd }),
    });
    if (!res.ok) {
      errorEl.textContent = 'nu am putut porni o sesiune nouă';
    }
  } catch (e) {
    errorEl.textContent = 'nu am putut porni o sesiune nouă';
  }
}

async function revealAgentFolder(cwd) {
  const errorEl = document.getElementById('open-error');
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: cwd }),
    });
    if (!res.ok) {
      errorEl.textContent = 'nu am putut deschide folderul';
    }
  } catch (e) {
    errorEl.textContent = 'nu am putut deschide folderul';
  }
}
```

### 3. `public/style.css` — folosește assets Tiny Swords pentru panou și butoane

Asset-uri deja copiate de planner (licență Tiny Swords, deja înregistrată):
- `public/ui/panel-paper.png` — 320×320, grilă 3×3 de piese (colțuri/margini/centru, gen "9-slice"), textură de hârtie/pergament.
- `public/ui/button-regular.png` / `public/ui/button-pressed.png` — 128×128 fiecare, buton pătrat albastru.

Stilizează panoul `.details` (păstrează `position`/`top`/`right`/`z-index`/`max-width` neschimbate) adăugând:

```css
.details {
  border-image-source: url('/ui/panel-paper.png');
  border-image-slice: 33.333% fill;
  border-image-width: 24px;
  border-image-repeat: stretch;
  background: transparent;
  border-style: solid;
  color: #222; /* textul trebuie citibil pe hârtie deschisă la culoare, nu pe fundal închis */
}
```

Elimină/înlocuiește `background: rgba(26, 26, 26, 0.9);` din `.details` (nu mai e nevoie, fundalul vine acum din `border-image-slice: ... fill`).

`.details .label` (culoare `#888`, gândită pentru fundal închis) devine ilizibilă pe hârtie deschisă — schimbă la o culoare închisă, ex. `color: #6b5940;` (maro, se potrivește cu hârtia).

Pentru butoane, adaugă o regulă comună (aplicabilă la toate butoanele din `.details`, nu doar la cele noi — `open-btn`/`hide-btn` rămân consistente vizual):

```css
.details button {
  background-image: url('/ui/button-regular.png');
  background-size: 100% 100%;
  border: none;
  color: #fff;
  padding: 4px 10px;
  font-family: monospace;
  cursor: pointer;
}

.details button:active {
  background-image: url('/ui/button-pressed.png');
}
```

Nu modifica `#hidden-panel`, `#title`, `#canvas` — doar `.details` și ce ține de ea.

## Constrângeri dure

- Nu adăuga npm dependencies.
- Nu modifica `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `public/index.html`.
- Nu schimba comportamentul `open-btn`/`hide-btn` — doar aspectul vizual (CSS) și redenumirea internă `openInClaudeCode` → `launchTarget` (funcțional identic pentru cazul `/api/open`).
- Validarea de folder trebuie să respingă orice cale relativă sau inexistentă — nu presupune că `agent.cwd` e mereu valid (poate fi un folder șters între timp).

## Ce NU are voie să atinge

Orice fișier în afară de `server.js`, `public/app.js`, `public/style.css`.

## Predare

`docs/handoff/T-18-coder-raport.md`: ce ai adăugat/modificat exact în fiecare din cele 3 fișiere, și confirmă (descriere, nu rulare — nu ai unelte de rulare) ce răspuns ar da fiecare endpoint nou pentru un folder valid vs. unul inexistent/relativ.
