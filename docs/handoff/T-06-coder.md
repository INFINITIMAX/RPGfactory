# T-06 — Persistență completă pentru arhivare (backend), fidelă bot-crossing

## Sarcină

Implementează partea de **server** pentru arhivarea agenților: un fișier de stare local (`data/state.json`), citit/scris cu exact aceeași siguranță ca la bot-crossing — scriere atomică, coadă de scriere serializată, concurență optimistă. Frontend-ul (butonul de arhivare, UI) vine într-un task separat (T-07) — aici doar backend-ul.

## Context — verificat direct în `server/api.mjs` din bot-crossing (nu ghicit)

Am citit efectiv codul lor. Schema lor completă are 9 câmpuri (`plots`, `seen`, `hiddenProjects`, `viewedAt`, `settings` etc.) — **niciunul din astea nu se aplică la noi**. Păstrăm doar ce ne trebuie: `archived` (listă de `sessionId`) + `archivedAt` (map `sessionId → epochMs`). Restul mecanicii (atomicitate, coadă, concurență optimistă) se reproduce **identic**, la cererea explicită a lui Lucian.

### Schema stării (simplificată față de a lor)

```js
{
  version: 1,           // nu avem nicio versiune anterioară de migrat — fără logica lor de `migrate()`
  archived: [],          // array de sessionId
  archivedAt: {},         // { [sessionId]: epochMs }
  updatedAt: 0,           // stampat de server, niciodată de client
}
```

Fișierul: `D:\RPGfactory\data\state.json`. Creează folderul `data/` dacă nu există (`fs.mkdirSync(dir, {recursive:true})`).

### Scriere atomică + coadă serializată — exact tiparul lor

Citat din comentariul lor (`server/api.mjs`), motivul e real, nu stilistic:
> "A shared tmp file means two saves landing together race on the rename and one throws ENOENT. And read-then-write is not atomic across an await, so without the chain two callers can both pass the version check before either writes."

Implementare cerută:
```js
let writeQueue = Promise.resolve();
let tmpSeq = 0;
function serialise(fn) { writeQueue = writeQueue.then(fn, fn); return writeQueue; }

function writeState(next) {
  const state = { version: 1, archived: [...], archivedAt: {...}, updatedAt: Date.now() };
  const tmp = STATE_FILE + '.' + process.pid + '.' + (++tmpSeq) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return state;
}
```
(Poți folosi variantele sincrone `fs.writeFileSync`/`renameSync` — restul serverului nostru e deja sincron, nu e nevoie de `fs/promises` ca la ei, care erau deja pe async.)

### Concurență optimistă — exact tiparul lor

`GET /api/state` → întoarce starea curentă (sau starea goală dacă fișierul nu există încă).

`PUT /api/state` → body: `{ archived, archivedAt, baseUpdatedAt }`.
```js
const current = readState();
if (base && current.updatedAt !== base) {
  // 409 — nu "mai vechi decât", ci diferit (poate reveni și înapoi, dintr-un backup)
  return res 409, current;
}
return res 200, writeState(body);
```
Citat din motivarea lor pentru `!==` în loc de `<`: fișierul se poate întoarce în timp (restaurat dintr-o copie), iar un tab cu o bază mai nouă decât disk-ul ar trece de un test `>` și ar suprascrie starea restaurată.

Un `baseUpdatedAt` lipsă sau 0 e permis fără verificare — prima scriere.

Rutele astea se adaugă lângă cele existente (`/api/agents`, `/api/open`) în `server.js`, sau într-un modul separat `state.js` (recomand modul separat, la fel ca `rank.js`/`status.js` — motivează alegerea în raport).

## Merge pe 3 căi — modul separat, folosit de FRONTEND (nu de server)

**Important**: la bot-crossing, merge-ul NU se întâmplă pe server — serverul doar refuză și întoarce starea de pe disc; browser-ul face merge-ul și retrimite. Scrie logica de merge într-un fișier separat, `public/merge-state.js` (încărcat cu `<script>` înainte de `app.js`, la fel ca restul — nu modul ES, cod clasic, ca să fie consecvent cu restul frontend-ului), NU în `server.js`.

Din codul lor (`src/game/merge-state.js`), portează doar ce ne trebuie:

**`mergeSet(base, local, remote)`** — pentru `archived` (set de id-uri): `(remote ∪ (local \ base)) \ (base \ local)`. Cod exact, adaptat:
```js
function mergeSet(base, local, remote) {
  const baseSet = new Set(base || []);
  const localSet = new Set(local || []);
  const removed = new Set([...baseSet].filter((id) => !localSet.has(id)));
  const out = [];
  const seen = new Set();
  for (const id of (remote || [])) {
    if (removed.has(id) || seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  for (const id of localSet) {
    if (baseSet.has(id) || seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  return out;
}
```

**`mergeMap(base, local, remote)`** — pentru `archivedAt` (map cheie→valoare), key-by-key, la fel ca la ei (remote e baza, diff-ul local se aplică peste):
```js
function mergeMap(base, local, remote) {
  const baseMap = base || {};
  const localMap = local || {};
  const out = { ...(remote || {}) };
  for (const [k, v] of Object.entries(localMap)) {
    if (k in baseMap && baseMap[k] === v) continue; // neatins aici, lăsăm varianta remote
    out[k] = v;
  }
  for (const k of Object.keys(baseMap)) {
    if (k in localMap) continue;
    delete out[k]; // șters aici
  }
  return out;
}
```
(La ei `sameValue` face egalitate profundă pentru array-uri/obiecte imbricate, pentru că `plots`/`seen` au valori complexe. La noi, `archivedAt` are doar numere ca valori — egalitate simplă `===` e suficientă. Menționează asta explicit în raport ca simplificare conștientă, nu omisiune.)

**`mergeState(base, local, remote)`**:
```js
function mergeState(base, local, remote) {
  return {
    version: 1,
    archived: mergeSet(base?.archived, local?.archived, remote?.archived),
    archivedAt: mergeMap(base?.archivedAt, local?.archivedAt, remote?.archivedAt),
  };
}
```

Testele pentru `merge-state.js` vin la tester — nu le scrie coder-ul.

## Constrângeri dure

- Nu adăuga npm dependencies.
- Nu atinge `rank.js`, `status.js`, `public/app.js`, `.env*`, `.gitignore`, `assets/`, `README.md` — acest task e strict backend de stare + modulul de merge (folosit de frontend la T-07, dar nu integrat încă).
- Adaugă `data/` în `.gitignore` (starea locală nu intră în git) — poți atinge `.gitignore` DOAR pentru asta, un singur rând.
- Nu implementa `hiddenProjects`/`plots`/`seen`/`viewedAt`/`settings` — nu există la noi.
- Nu scrie UI/buton de arhivare — vine la T-07.

## Ce NU are voie să atingă

`rank.js`, `status.js`, `public/app.js`, `.env*`, `.env.example`, `README.md`, `assets/`. (`.gitignore` — doar adăugarea liniei `data/`.)

## Predare

`docs/handoff/T-06-coder-raport.md`: ce fișiere ai creat, unde ai pus rutele noi, ce simplificări conștiente ai făcut față de codul lor (ex. `sameValue` → `===`, lipsa migrării de versiune), cum se testează manual (comenzi `curl`/`Invoke-RestMethod` pentru GET/PUT, inclusiv un caz de conflict 409 simulat cu un `baseUpdatedAt` greșit). **Include comanda/output-ul exact al oricărei verificări.**
