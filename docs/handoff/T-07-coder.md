# T-07 — Arhivare, integrată în frontend (butonul + filtrarea + salvarea)

## Sarcină

Integrează persistența de la T-06 (`/api/state`, `public/merge-state.js`) în `public/app.js`: un buton "Hide" în panoul de detalii care ascunde agentul de pe hartă, plus o listă mică pentru a-i readuce înapoi.

## Context — tiparul exact din `src/main.js` (bot-crossing), verificat direct

Citat din codul lor:
```js
archiveThread: () => {
  const thread = threads.find((t) => t.id === selectedId);
  if (!thread) return;
  state.archived = [...new Set([...state.archived, thread.id])];
  state.archivedAt = { ...state.archivedAt, [thread.id]: Date.now() };
  queueSave();          // debounce 500ms, apoi salvează
  select(null, {});     // deselectează imediat
  applyThreads(threads); // re-randează, optimist, înainte ca salvarea să confirme ceva
}
```
și pentru salvare:
```js
function queueSave() {
  clearTimeout(pendingSave);
  pendingSave = setTimeout(async () => {
    try {
      state = await saveState(state); // adoptă orice vine înapoi (merge-uit sau neschimbat)
    } catch {
      // eșecul de salvare nu oprește colonia — se reîncearcă la următoarea schimbare
    }
  }, 500);
}
```
`saveState` (din `src/game/api.js`, deja citit la T-06) încearcă `PUT /api/state` cu `baseUpdatedAt`; la `409`, face `mergeState(baseSnapshot, local, remote)` (avem deja `mergeState` în `public/merge-state.js`) și reîncearcă, până la 3 încercări.

## Rezultat așteptat, în `public/app.js`

1. **La pornire** (înainte de primul `tick()`): `fetch('/api/state')` → păstrează local `state = { archived, archivedAt, updatedAt }` și `baseUpdatedAt = state.updatedAt`, `baseSnapshot = structuredClone(state)` (sau echivalent simplu de copiere, `JSON.parse(JSON.stringify(state))` — motivează alegerea).
2. **Filtrare la randare**: în `draw()` (și în hit-test-ul de click), sări agenții al căror `sessionId` e în `state.archived` — nu-i mai desena, nu mai pot fi selectați de pe hartă.
3. **Buton "Hide"** în `renderDetails()`, lângă butonul "Open" existent (nu-l modifica pe acela). La click:
   - actualizează optimist `state.archived`/`state.archivedAt` (exact tiparul lor de mai sus, cu `sessionId` în loc de `thread.id`)
   - deselectează (`selectedSessionId = null`), re-randează imediat
   - cheamă `queueSave()` (debounce 500ms — implementează exact acest tipar, nu salva la fiecare click imediat)
4. **`queueSave()` + salvare cu retry+merge** — portează logica din `saveState` (bot-crossing, `src/game/api.js`, citită la T-06):
   - `PUT /api/state` cu `{ archived, archivedAt, baseUpdatedAt }`
   - la `409`: `state = mergeState(baseSnapshot, state, body)` (folosește `mergeState` din `merge-state.js` — adaugă `<script src="/merge-state.js"></script>` în `index.html`, ÎNAINTE de `app.js`), actualizează `baseSnapshot`/`baseUpdatedAt` din `body`, reîncearcă (max 3 încercări, ca la ei)
   - la succes: actualizează `baseSnapshot`/`baseUpdatedAt`
   - eșec după 3 încercări sau eroare de rețea: nu bloca UI-ul, doar loghează în consolă (fără `alert`) — coloana continuă să funcționeze local, se reîncearcă la următoarea schimbare
5. **Listă minimă de agenți ascunși**, ca să existe o cale înapoi (bot-crossing are UI dedicat pentru asta, în afara scopului nostru — facem varianta minimă): sub `<div id="details">`, un link/buton mic "Arată ascunși (N)" care, la click, afișează o listă simplă cu numele agenților din `state.archived` (caută-le numele din ultimul `agents` cunoscut, dacă nu mai sunt live afișează doar `sessionId`), fiecare cu un buton "Unhide" care scoate id-ul din `state.archived`/`archivedAt` și declanșează `queueSave()` la fel ca mai sus.

## Constrângeri dure

- Nu modifica `state.js`, `rank.js`, `status.js`, `server.js` (rutele existente sunt suficiente).
- Nu modifica `public/merge-state.js` — doar îl încarci cu `<script>`.
- Nu adăuga npm dependencies.
- Nu atinge `hashToCellIndex`, `cellIndexToPosition`, `colorForActivity`, bucla de animație a sprite-ului, `openAgentSession`.
- Debounce-ul de 500ms e important — nu-l scurta/elimina "ca să fie mai simplu de testat", păstrează exact tiparul lor.

## Ce NU are voie să atinge

`state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-07-coder-raport.md`: cum ai structurat lista de "ascunși" (unde ții numele agenților ascunși care nu mai sunt live), cum ai testat manual fluxul complet (hide → reapare în listă → unhide → reapare pe hartă), inclusiv un test manual de conflict (deschide două file/tab-uri, ascunde din unul, verifică că celălalt nu suprascrie la următoarea lui salvare). **Include comanda/output-ul exact al oricărei verificări.**
