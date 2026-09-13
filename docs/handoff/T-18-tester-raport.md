# T-18 — Raport tester

## Fișiere

### `test/server.test.mjs` (NOU)

Pornește serverul real pe portul 5393 (dedicat, diferit de 5311/5391/5392), exact tiparul din `test/api-open.test.mjs`/`test/state.test.mjs` (interceptare temporară `http.createServer`, apoi restaurare). Testează, pentru FIECARE din `/api/reveal` și `/api/new-session` (buclă `for...of`, 12 teste generate + 1 test de robustețe + comentariu de limitare):

1. Folder absolut existent (director) — folosesc `__dirname` al testului însuși — → `200 {ok:true}`.
   - Ce l-ar face să cadă: dacă `resolveFolder` ar respinge o cale absolută validă, sau dacă handler-ul ar răspunde cu alt status/body.
2. Cale relativă (`"relative/path"`) → `400 {ok:false, error: string nevid}`.
   - Cade dacă cineva scoate verificarea `path.isAbsolute`.
3. Folder absolut inexistent → `400`.
   - Cade dacă `fs.statSync` nu mai e verificat / try-catch-ul e eliminat.
4. Cale absolută existentă dar care e FIȘIER (`__filename` al testului) → `400`.
   - Cade dacă cineva scoate `stat.isDirectory()`.
5. Body JSON invalid → `400 {ok:false, error:'invalid JSON'}`.
6. Body `{}` (fără `folder`) → `400`.
   - Cade dacă `resolveFolder(undefined)` nu mai întoarce `null` (ex. cineva schimbă semnătura).

Plus:
- Test de robustețe: după POST-uri cu body stricat pe ambele rute noi, `GET /api/agents` tot răspunde `200` cu array — reproduce regresia ERR_HTTP_HEADERS_SENT verificată deja pentru `/api/open`.
- NU am retestat `/api/open` — brief-ul spunea explicit să nu redublez `test/api-open.test.mjs`; l-am citit și confirm că testul #1 de acolo (`sessionId` valid → `200 {ok:true}`) acoperă deja faptul că `launchTarget` (redenumirea din `openInClaudeCode`) nu a stricat comportamentul — planner trebuie doar să ruleze suita existentă și să confirme că tot trece.

Nu am testat efectul real al `rundll32`/Explorer — motivat explicit în fișier, ca în `api-open.test.mjs`.

### `test/app.test.mjs` (extins)

Am extins `loadApp()`:
- mock-uri noi `fakeNewSessionBtn`/`fakeRevealBtn` înregistrate în `document.getElementById('new-session-btn'/'reveal-btn')`, analog cu `fakeHideBtn`.
- `mockFetch` distinge acum și `/api/new-session`/`/api/reveal` (POST), cu succes implicit `200 {ok:true}` și posibilitate de override (`setNewSessionImpl`/`setRevealImpl`) pentru simularea eșecului/non-ok, la fel ca `setPutStateImpl`.
- helpere noi expuse: `clickNewSession()`/`clickReveal()` (apelează handler-ul, apoi flush de microtask-uri, fiindcă listener-ul din `renderDetails()` nu întoarce promisiunea funcției async), `getNewSessionCalls()`/`getRevealCalls()`, `openErrorText` (getter pe `#open-error`).

Teste noi adăugate (secțiunea "13. T-18"), 8 la număr:

7. `renderDetails()` include `new-session-btn`/`reveal-btn` — verifică `innerHTML` conține ambele id-uri și etichetele text.
   - Cade dacă butoanele sunt eliminate sau redenumite.
8. Click pe `new-session-btn` → exact o chemare `POST /api/new-session` cu `{folder: agent.cwd}`.
   - Cade dacă listener-ul nu (mai) trimite body-ul corect, sau nu cheamă deloc `fetch`.
9. Click pe `reveal-btn` → exact o chemare `POST /api/reveal` cu `{folder: agent.cwd}`.
   - Analog, pentru celălalt buton.
10. Patru teste de eroare: New session + Reveal, fiecare cu (a) răspuns non-ok (400) și (b) fetch care aruncă (eroare de rețea) → `#open-error` conține mesaj nevid.
    - Cade dacă `errorEl.textContent` nu mai e setat la eșec (ex. cineva șterge blocul `if (!res.ok)`/`catch`).
11. Test de control: click reușit (200 `{ok:true}`) pe New session → `#open-error` rămâne gol.
    - Cade dacă mesajul de eroare ar apărea și la succes (fals-pozitiv de eroare), sau dacă eroarea din testul anterior nu mai e resetată la începutul funcției (`errorEl.textContent = ''`).

## Ce NU am acoperit (și de ce)

- Efectul real de sistem al `rundll32`/Explorer/`claude://` — nedeterminist, nu poate fi testat automat, explicit interzis de brief.
- Nu am adăugat teste noi pentru `/api/open` — deja acoperit de `test/api-open.test.mjs`; brief cerea doar confirmare, nu duplicare.
- Nu am testat CSS-ul (`style.css`) — nu e testabil din `node --test`, rămâne verificare vizuală a planner-ului (menționat explicit ca "nu e un test valid" în brief).
- Nu am verificat conținutul exact al mesajului de eroare din `#open-error` (doar că e nevid) — brief-ul specifica mesajele ("nu am putut porni o sesiune nouă"/"nu am putut deschide folderul"), dar am preferat să nu fixez text exact ca test de contract HTTP/UI, ca să nu pice la o simplă reformulare a mesajului; dacă planner-ul vrea verificare exactă a textului, e ușor de strâns (`assert.equal` în loc de `assert.notEqual('')`).

## Suspiciuni de bug

Niciuna găsită — codul din `server.js`/`public/app.js` respectă exact tiparul descris în `T-18-coder.md`/`T-18-coder-raport.md` (am citit sursa efectivă din `server.js` liniile 65-170 și `public/app.js` liniile 595-630 ca să confirm, nu doar raportul coder-ului).

## Comanda exactă de rulare

```powershell
node --test test/
```

sau, pentru a rula doar fișierele relevante T-18:

```powershell
node --test test/server.test.mjs test/app.test.mjs test/api-open.test.mjs
```
