# T-05 — Stare reală: working / waiting / sleeping (metoda exactă bot-crossing)

## Sarcină

Adaugă un câmp nou `activity` pe fiecare agent din `/api/agents`, calculat exact ca la bot-crossing (verificat direct în `server/harnesses/claude-code.mjs` din repo-ul lor clonat — nu ghicit), și folosește-l în `public/app.js` pentru indicatorul de status, în locul câmpului brut `status` (`busy`/altceva).

## Context — algoritmul, verificat în codul lor

Sursă: `awaitingReply()` + logica din jurul liniei 470 din `claude-code.mjs` (bot-crossing).

**Constante exacte** (nu inventa altele):
```js
const ACTIVE_WINDOW_MS = 30 * 60 * 1000; // 30 minute
const TAIL_BYTES = 64 * 1024; // 64KB — diferit de cei 20KB din rank.js (T-02); păstrează 64KB aici, ca la ei
```

**Algoritmul `awaitingReply(transcriptPath)`** — citește coada transcript-ului (JSONL, o linie = un JSON), parcurge liniile de la ultima spre prima:
- dacă o linie are `type === 'user'` → oprește căutarea, întoarce `false` (nu așteaptă — modelul urmează să vorbească).
- dacă o linie are `type !== 'assistant'` → sari peste ea, continuă cu linia anterioară.
- dacă o linie are `type === 'assistant'`: uită-te la `entry.message.content` (array). Dacă vreun element din array are `type === 'tool_use'`, înseamnă că modelul a chemat un tool — încă lucrează, întoarce `false`. Altfel (n-a chemat niciun tool) **și** `entry.message.stop_reason !== 'tool_use'` → întoarce `true` (a predat rândul înapoi, așteaptă răspunsul tău). Oprește căutarea la prima linie de tip `assistant` găsită (nu continua mai departe).
- dacă nu găsești nimic relevant până la începutul cozii → `false`.

**Determinarea stării finale**, per agent:
```
mtime = mtime-ul fișierului transcript (.jsonl)
fresh = (Date.now() - mtime) < ACTIVE_WINDOW_MS

dacă transcript-ul nu există → activity = null
dacă !fresh → activity = "sleeping"
dacă fresh și awaitingReply(transcript) → activity = "waiting"
dacă fresh și !awaitingReply(transcript) → activity = "working"
```

Notă: la bot-crossing, "fresh" se calculează din `lastActivityAt` al thread-ului (bookkeeping-ul lor intern); la noi, cel mai apropiat echivalent verificabil e **mtime-ul fișierului transcript** — folosește asta.

## Rezultat așteptat

1. **Fișier nou `status.js`** (la fel structurat ca `rank.js` — un modul separat, nu îngrămădit în `server.js`), care exportă `getActivityState(cwd, sessionId)` → `{ activity: 'working'|'waiting'|'sleeping'|null }`.
   - **Reutilizează `encodeCwd` din `rank.js`** (`const { encodeCwd } = require('./rank');`) — nu reimplementa aceeași logică de encoding a doua oară.
   - Cache pe mtime, la fel ca `rank.js` (Map separată, cheie = calea fișierului) — nu recitim coada la fiecare poll dacă transcript-ul nu s-a schimbat.
   - Nu aruncă niciodată — orice eroare (fișier lipsă, JSON invalid) degradează la `activity: null`.
2. **`server.js`**: integrează `getActivityState` în `readAgents()`, adaugă `activity` pe fiecare agent, alături de `rank`/`model` existente.
3. **`public/app.js`**: indicatorul mic de status de pe sprite (cercul din colț, adăugat la T-04) folosește acum `activity`, nu `status`:
   - `working` → albastru accent (`#2A5FAE`, culoarea folosită anterior pentru `busy`)
   - `waiting` → amber (`#B4801E`)
   - `sleeping` → gri (`#888`)
   - `null`/necunoscut → gri, cu `console.log` de avertizare (păstrează tiparul din `colorForStatus`, dar redenumește-o dacă are sens — motivează decizia în raport).
4. Câmpul vechi `status` (`busy`/etc.) **rămâne** în răspunsul `/api/agents` (nu-l șterge — s-ar putea să fie util mai târziu), dar nu mai e folosit pentru randare.

## Constrângeri dure

- Nu adăuga npm dependencies.
- Nu modifica `rank.js` decât ca să exporți `encodeCwd` dacă nu e deja exportat (verifică întâi — cred că e deja exportat din T-02, confirmă în raport).
- Nu atinge `.env*`, `.gitignore`, `assets/`, `README.md`.
- Nu modifica `hashToCellIndex`, `cellIndexToPosition`, `tick`, `renderDetails`, `openAgentSession`, bucla de animație a sprite-ului.

## Ce NU are voie să atingă

`.env*`, `.env.example`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-05-coder-raport.md`: confirmă dacă `encodeCwd` era deja exportat sau a trebuit adăugat, orice caz limită observat la parcurgerea liniilor `assistant`/`user`, cum se testează manual. **Include comanda/output-ul exact al oricărei verificări manuale.**
