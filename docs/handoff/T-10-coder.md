# T-10 — Integrarea zonelor în randare (înlocuiește grila globală pe hash)

## Sarcină

Cea mai mare schimbare de până acum: `public/app.js` renunță la poziționarea individuală pe hash global (`hashToCellIndex`/`cellIndexToPosition`, grilă fixă 8×8) și trece la poziționare **per proiect** — agenții din același `cwd` se grupează într-o zonă (calculată de `zones.js`, T-08), zona se desenează ca fundal, iar fiecare agent se poziționează într-o celulă din zona proiectului lui.

## Context — tiparul exact de salvare-doar-la-schimbare, verificat în `src/main.js` (bot-crossing)

```js
const layout = colony.layoutForSave();
const signature = JSON.stringify(layout);
if (signature !== lastLayout) {
  lastLayout = signature;
  state.plots = layout;
  queueSave();
}
```
Layout-ul se recalculează la fiecare poll, dar se salvează pe disc DOAR când semnătura (JSON-ul lui) chiar diferă de ultima salvată — altfel am declanșa o scriere la fiecare 3 secunde, mereu.

## Rezultat așteptat, în `public/app.js`

### 1. Calcularea proiectelor, la fiecare `tick()` (după ce vin agenții noi)

```js
const counts = {};
for (const agent of agents) {
  if (!agent.alive || state.archived.includes(agent.sessionId)) continue;
  counts[agent.cwd] = (counts[agent.cwd] || 0) + 1;
}
const projects = Object.entries(counts)
  .map(([id, size]) => ({ id, size }))
  .sort((a, b) => b.size - a.size); // cel mai mare primul, cum cere zones.js
```

### 2. Alocarea zonelor

```js
const previousMap = new Map(Object.entries(state.plots || {}));
const newPlotsMap = allocateCells(projects, previousMap); // din zones.js — <script>-uiește-l în index.html, înainte de app.js
const newPlots = Object.fromEntries(newPlotsMap);
```

### 3. Salvare doar la schimbare (tiparul exact de mai sus)

```js
const signature = JSON.stringify(newPlots);
if (signature !== lastPlotsSignature) {
  lastPlotsSignature = signature;
  state.plots = newPlots;
  queueSave();
} else {
  state.plots = newPlots; // aceleași date, doar actualizăm referința, fără salvare
}
```
(`lastPlotsSignature` — variabilă nouă la nivel de script, inițializată la `null` sau `JSON.stringify(state.plots)` din `initState()`, ca să nu declanșeze o salvare falsă chiar la pornire dacă nimic nu s-a schimbat față de disc.)

### 4. Poziționarea unui agent în zona lui

Sistemul de coordonate al zonelor (din `zones.js`) e centrat la `{x:0,y:0}`, nemărginit logic. Conversia în pixeli pe canvas:

```js
const CANVAS_CENTER_X = canvas.width / 2;
const CANVAS_CENTER_Y = canvas.height / 2;

function zoneCellToPixels(cell) {
  return {
    x: CANVAS_CENTER_X + cell.x * CELL_SIZE,
    y: CANVAS_CENTER_Y + cell.y * CELL_SIZE,
  };
}
```
(`CELL_SIZE` — constanta deja existentă din T-01, 80px — o reutilizezi, nu inventezi alta.)

Un agent își alege celula din zona proiectului lui printr-un hash pe `sessionId` (același principiu ca la T-01 — poziție stabilă, nu recalculată din ordine):
```js
function cellForAgent(agent, projectCells) {
  if (!projectCells || projectCells.length === 0) return { x: 0, y: 0 }; // fallback dacă proiectul n-a primit nicio celulă (pool epuizat, vezi T-08)
  const index = hashToCellIndex(agent.sessionId) % projectCells.length; // hashToCellIndex rămâne utilă ca hash generic, chiar dacă nu mai indexează grila globală
  return projectCells[index];
}
```
Dacă mai mulți agenți din același proiect cad pe aceeași celulă (posibil, hash-ul nu garantează distribuție unică), aplică un mic jitter vizual (deplasare de câțiva pixeli în cerc, în funcție de poziția agentului în lista celor de pe acea celulă) — la fel ca la harta hexagonală de mai devreme din proiect, nu suprapune sprite-urile exact.

### 5. Desenarea zonelor (fundal, înainte de agenți)

Pentru fiecare proiect, pentru fiecare celulă din zona lui: un dreptunghi de `CELL_SIZE × CELL_SIZE` (centrat pe `zoneCellToPixels(cell)`), cu un contur subțire și o umplere ușor colorată — culoare diferită per proiect, ciclată dintr-o paletă mică fixă (5-6 culori, alege tu, coerente cu restul stilului). Deasupra/lângă zonă, numele proiectului: **doar ultimul segment al căii** (`cwd.split(/[\\/]/).pop()`), nu calea completă — nimeni nu vrea `C:\Users\Lucian-PC\...` scris pe hartă.

### 6. Ce se întâmplă cu `hashToCellIndex`/`cellIndexToPosition`

`cellIndexToPosition` (grila globală fixă 8×8) nu mai are rol — nu mai poziționează nimic direct. **Nu o șterge** dacă alte teste/cod încă o folosesc fără legătură cu poziționarea globală (verifică înainte); dacă devine complet neutilizată, poți s-o elimini, dar menționează explicit în raport ce ai decis și de ce. `hashToCellIndex` rămâne folosită (ca hash generic pentru alegerea celulei din zonă).

## Constrângeri dure

- Nu modifica `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Adaugă `<script src="/zones.js"></script>` în `index.html`, ÎNAINTE de `app.js` (după `merge-state.js`, ordinea nu contează între ele două, dar ambele înainte de `app.js`).
- Nu integra sprite-uri/culori de facțiune diferite per proiect — doar culoarea fundalului zonei, nu schimbă sprite-ul agentului.
- `Open`, `Hide`/`Unhide`, indicatorul de status, animația sprite-ului — funcționalitate neschimbată, doar poziția se calculează altfel.

## Ce NU are voie să atingă

`public/zones.js`, `state.js`, `public/merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-10-coder-raport.md`: ce ai făcut cu `cellIndexToPosition` (păstrat/eliminat, de ce), cum ai ales paleta de culori pentru zone, cum se testează manual (cu 2+ agenți din `cwd`-uri diferite — chiar ai asta acum, 2 sesiuni vii — verifică vizual că apar în zone separate, cu nume de proiect deasupra). **Include comanda/output-ul exact al oricărei verificări.**
