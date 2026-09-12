# T-03 — Click pe agent → deschide sesiunea în Claude Code

## Sarcină

Adaugă un buton "Open" în panoul de detalii (`public/index.html`/`app.js`) care, la click, cere serverului să deschidă sesiunea selectată înapoi în Claude Code (aplicația desktop sau CLI, depinde ce răspunde la URL scheme).

## Context — verificat direct în codul bot-crossing, nu ghicit

Am citit efectiv `server/harnesses/claude-code.mjs` și `server/api.mjs` din repo-ul clonat local (`bot-crossing-trial`) înainte de a scrie brief-ul, ca să nu repetăm greșeala de la T-02.

**Formatul URL-ului**, confirmat din `claude-code.mjs`:
```
claude://resume?session=<sessionId>
```
unde `<sessionId>` e id-ul sesiunii CLI (exact ce avem deja în `data.sessionId` din `~/.claude/sessions/*.json`).

**Cum se dă URL-ul sistemului de operare pe Windows**, confirmat din `server/api.mjs` (comentariu explicativ inclus în cod, motivat):
```js
const { spawn } = require('child_process');
const child = spawn('rundll32', ['url.dll,FileProtocolHandler', url], { stdio: 'ignore', detached: true });
child.on('error', () => {}); // opener-ul poate lipsi; nu trebuie să oprească serverul
child.unref();
```
Alte metode (`explorer.exe <url>`, `cmd /c start`) sunt evitate deliberat de bot-crossing — pierd query string-uri sau parsează greșit escape-urile. Folosim exact `rundll32 url.dll,FileProtocolHandler`, nu inventăm altă metodă. Suntem doar pe Windows acum (nu Linux/macOS) — nu implementa fallback-uri pentru alte OS-uri.

## Rezultat așteptat

1. **Backend**: endpoint nou `POST /api/open` în `server.js`, care primește `{ sessionId }` în body JSON, construiește URL-ul `claude://resume?session=<sessionId>`, îl dă lui `rundll32` prin `spawn` (ca mai sus), și răspunde `{ ok: true }` imediat (nu aștepta ca aplicația Claude să pornească — `spawn` cu `detached`/`unref` e fire-and-forget, exact ca la ei).
2. **Frontend**: în panoul de detalii (`renderDetails()` din `app.js`), adaugă un buton `<button id="open-btn">Open</button>` (sau similar) care, la click, face `fetch('/api/open', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sessionId: agent.sessionId }) })`.
3. Dacă `fetch`-ul eșuează (răspuns non-200 sau eroare de rețea), afișează un mesaj scurt de eroare lângă buton (ex. text roșu temporar) — nu bloca restul paginii, nu folosi `alert()`.

## Constrângeri dure

- Nu adăuga npm dependencies — `child_process.spawn` e nativ.
- Nu implementa suport pentru macOS/Linux — doar Windows (`rundll32`), conform mediului real al lui Lucian.
- Nu modifica logica de `readAgents()`/randare canvas existentă — doar adaugă noul endpoint și butonul.
- Nu atinge `.env*`, `.gitignore`, `assets/`, `rank.js` (T-02, deja acceptat).
- Body-ul cererii POST trebuie citit corect (Node nativ, fără `express`/`body-parser`) — acumulează chunk-urile din `req` și parsează JSON după `req.on('end')`; tratează JSON invalid cu un răspuns 400, nu cu un throw necaptat care ar dărâma serverul (am avut deja un incident cu server-ul căzut la o eroare necaptată — vezi `docs/handoff/T-01-coder-raport.md` context istoric, evită tiparul).

## Ce NU are voie să atingă

`rank.js`, `.env*`, `.env.example`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-03-coder-raport.md`: ce fișiere ai schimbat, cum ai citit body-ul POST-ului, cum ai testat manual (comandă exactă + ce ar trebui să se întâmple — inclusiv ce se întâmplă dacă `sessionId` nu corespunde unei sesiuni reale). **Dacă afirmi că ai verificat ceva manual, include comanda/output-ul exact, nu doar concluzia** (cerere explicită după observația reviewer-ului de la T-02).
