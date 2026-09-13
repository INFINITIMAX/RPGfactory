# T-18 — Raport coder

## `server.js`

- Redenumit `openInClaudeCode(sessionId)` în `launchTarget(target)` — corp identic (`spawn('rundll32', ['url.dll,FileProtocolHandler', target], ...)`), dar acum primește direct target-ul (URL sau cale de folder), nu doar sessionId.
- Handler-ul `/api/open` actualizat să apeleze `launchTarget('claude://resume?session=' + data.sessionId)` — comportament identic cu înainte.
- Adăugată `resolveFolder(folder)` — validează `path.isAbsolute` + `fs.statSync(...).isDirectory()`, întoarce `null` la orice eșec (cale relativă, inexistentă, sau nu e director).
- Adăugat handler `POST /api/reveal`, după `/api/open`, cu același tipar de citire body (`req.on('data')`/`req.on('end')`, `JSON.parse` cu try/catch → 400 la JSON invalid):
  - folder valid și existent → `launchTarget(folder)`, răspuns `200 { ok: true }`.
  - folder invalid/relativ/inexistent → `400 { ok: false, error: 'folder invalid sau inexistent' }`.
- Adăugat handler `POST /api/new-session`, același tipar:
  - folder valid → `launchTarget('claude://code/new?' + new URLSearchParams({ folder }).toString())`, răspuns `200 { ok: true }`.
  - folder invalid → `400 { ok: false, error: 'folder invalid sau inexistent' }`.

## `public/app.js`

- În `renderDetails()`: butonul nou `<div>` include acum `Open`, `New session` (`new-session-btn`), `Reveal in folder` (`reveal-btn`), `Hide`, plus `#open-error`, în această ordine.
- Adăugate listener-e pentru `new-session-btn` → `newSessionForAgent(agent.cwd)` și `reveal-btn` → `revealAgentFolder(agent.cwd)`, lângă listener-ele existente `open-btn`/`hide-btn`.
- Adăugate funcțiile `newSessionForAgent(cwd)` și `revealAgentFolder(cwd)`, după `openAgentSession()`, cu tipar identic (fetch POST cu `Content-Type: application/json`, body `{ folder: cwd }`, la `res.ok === false` sau excepție → `errorEl.textContent` cu mesajul specific din brief).

## `public/style.css`

- `.details`: eliminat `background: rgba(26, 26, 26, 0.9)` și `border: 1px solid #333`; adăugat `border-image-source/slice/width/repeat` (panel-paper.png, 9-slice cu `fill`), `background: transparent`, `border-style: solid`, `color: #222`. `position`/`top`/`right`/`padding`/`max-width`/`z-index` neschimbate.
- `.details .label`: culoare schimbată din `#888` în `#6b5940`.
- Adăugată regula `.details button` (background din `button-regular.png`, `background-size: 100% 100%`, `border: none`, `color: #fff`, padding, `font-family: monospace`, `cursor: pointer`) și `.details button:active` (background din `button-pressed.png`) — se aplică la toate butoanele din panou, inclusiv `open-btn`/`hide-btn` existente.
- Neatinse: `#hidden-panel`, `#title`, `#canvas`, `.open-error`.

## Comportament endpoint-uri noi (descriere, nu rulare)

- `POST /api/reveal` cu `{ folder: "C:\\cale\\absolută\\existentă" }` (director real) → `resolveFolder` întoarce calea → `launchTarget(folder)` pornește `rundll32 url.dll,FileProtocolHandler <folder>` → răspuns `200 { ok: true }`.
- `POST /api/reveal` cu folder relativ (ex. `"cale\\relativa"`) sau inexistent → `resolveFolder` întoarce `null` → `400 { ok: false, error: 'folder invalid sau inexistent' }`, fără a apela `launchTarget`.
- `POST /api/new-session` cu folder absolut existent → `launchTarget('claude://code/new?folder=' + encodeURIComponent(folder))` (prin `URLSearchParams`) → `200 { ok: true }`.
- `POST /api/new-session` cu folder relativ/inexistent → `400 { ok: false, error: 'folder invalid sau inexistent' }`.
- Body JSON invalid pe oricare din cele două → `400 { ok: false, error: 'invalid JSON' }` (identic cu tiparul din `/api/open`).

## Ce nu am făcut

- Nu am atins `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `public/index.html` — conform constrângerilor.
- Nu am adăugat dependențe npm.
- Nu am rulat/testat nimic (nu am unelte de rulare) — planner-ul trebuie să verifice manual pornirea serverului și butoanele noi în browser, plus existența efectivă a fișierelor `public/ui/panel-paper.png`, `public/ui/button-regular.png`, `public/ui/button-pressed.png` (brief spune că sunt deja copiate de planner).

## De verificat de planner

- Pornire server + click pe `New session`/`Reveal in folder` din UI, cu un agent selectat.
- Testare endpoint-uri cu curl/Postman pentru cazurile: folder absolut valid, folder relativ, folder inexistent, body JSON invalid.
- Verificare vizuală panou `.details` cu asset-urile Tiny Swords (contrast text pe hârtie, aspect butoane normal/apăsat).
