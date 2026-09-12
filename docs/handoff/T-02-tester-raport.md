# T-02 — Raport tester

## Fișier de teste

`D:\RPGfactory\test\rank.test.mjs` — `node --test`, aceeași convenție ca `test/app.test.mjs` (ESM, `node:test` + `node:assert/strict`, fără librărie nouă).

Import: `rank.js` e CommonJS (`module.exports = {...}`); l-am încărcat cu `createRequire(import.meta.url)('../rank.js')` (nu `import` direct), ca să evit orice ambiguitate de interop CJS/ESM.

## Ce testez și ce ar pica fiecare test

### `modelToRank`
- mapare corectă opus/sonnet/haiku → pică dacă se schimbă pragurile `includes(...)` sau șirurile de rang returnate.
- case-insensitivity (`Claude-Opus-5`) → pică dacă se elimină `.toLowerCase()`.
- model necunoscut (`gpt-4`, `gemini-pro`) → `null` — pică dacă funcția ar întoarce implicit un rang oarecare.
- `null`/`undefined`/`''` → `null`, fără să arunce — pică dacă s-ar elimina guard-ul `if (!model) return null`.

### `encodeCwd`
- exemplul exact din raportul coder-ului (`C:\Users\Lucian-PC` → `C--Users-Lucian-PC`) — pică dacă regex-ul de replace se schimbă.
- variantă cu `/` și variantă mixtă `:`+`/`+`\` — pică dacă regex-ul ar trata doar `\` (ex. dacă cineva îl restrânge la Windows-only).

### `getRank` — prin mock manual de `fs` (nu fixture-uri pe disc)
`PROJECTS_DIR` e derivat hardcodat din `os.homedir()`, deci calea de bază nu e injectabilă fără să modific `rank.js` (interzis). În loc să scriu fișiere sub `~/.claude/projects/` (ar atinge un folder real al lui Lucian, chiar cu nume sintetice — riscant), am mock-uit direct `fs.statSync`/`openSync`/`readSync`/`closeSync` (salvare/restaurare manuală în `try/finally`, fără dependențe noi), interceptând doar calea fixture-ului testului curent; orice altă cale trece prin `fs` real. Asta acoperă **indirect** și `readTail`/`findLastAssistantModel`, care nu sunt exportate.

Teste:
1. **model găsit în ultima linie assistant validă** → `{rank:'Fleet Admiral', model:'claude-opus-5'}`. Pică dacă bucla de căutare înapoi sau maparea la `modelToRank` se strică.
2. **linie assistant fără `message.model`** (`message:{}` sau fără `message`) — căutarea trebuie să continue la linia anterioară validă. Pică dacă `entry.message && entry.message.model` e slăbit greșit (ex. ar accepta `message:{}` ca "găsit" și ar întoarce `model: undefined`).
3. **linie JSON invalidă** (`nu e deloc JSON valid {{{`) ignorată silențios, fără să arunce, cu rezultat corect din linia validă rămasă. Pică dacă `try/catch` din jurul `JSON.parse` e eliminat (test-ul chiar ar arunca, nu doar ar da rezultat greșit).
4. **niciun `assistant` valid** → `{rank:null, model:null}`. Pică dacă bucla ar întoarce ceva nedefinit sau ar arunca la finalul iterației.
5. **fișier lipsă** (`statSync` aruncă ENOENT) → `{rank:null, model:null}`, fără excepție propagată. Pică dacă try/catch din `getRank` din jurul `fs.statSync` inițial e eliminat.
6. **`cwd`/`sessionId` lipsă → null imediat, fără să atingă `fs` deloc** — mock-uiesc `fs.statSync` să arunce necondiționat dacă e apelat, apoi verific `getRank(undefined,...)`, `getRank(...,undefined)`, `getRank('','')`, `getRank(null,null)`. Pică dacă guard-ul de intrare e eliminat sau slăbit (ex. verifică doar `cwd` fără `sessionId`).
7. **truncare pe fișiere mari** — filler de 30KB fără newline la început + linii valide la coadă; verific că prima linie "usable" (parțială) e ignorată și modelul din ultima linie tot e găsit. Pică dacă logica `truncated ? lines.slice(1) : lines` e eliminată/inversată (ar începe să parseze linia parțială, posibil aruncând sau găsind alt rezultat).
8. **cache — hit**: apelez `getRank` de două ori cu același `mtimeMs`, verific prin contor pe mock că `openSync` e chemat o singură dată. Pică dacă cache-ul e eliminat sau cheia de comparație (`mtimeMs`) e greșită.
9. **cache — invalidare**: schimb `mtimeMs` între cele două apeluri (conținut diferit) și verific atât valoarea nouă returnată, cât și că fișierul a fost re-citit (`openSync` incrementat). Pică dacă cache-ul nu se invalidează la schimbare de mtime (ar întoarce greșit modelul vechi din cache).

Fiecare test de `getRank` folosește un `sessionId` unic (`crypto.randomUUID()`) ca să nu se lovească de cache-ul modulului `rank.js`, care e un `Map` la nivel de modul și persistă între teste din același fișier (nu există hook de reset expus — nu l-am cerut, nu era rolul meu să modific `rank.js`).

## Ce NU am acoperit (și de ce)

- **`readTail`/`findLastAssistantModel` direct** — nu sunt exportate din `rank.js`; le-am acoperit doar indirect prin `getRank` + mock de `fs`, conform brief-ului.
- **Comportament real cu `~/.claude/projects/` al lui Lucian** — explicit interzis de brief (date personale, nedeterministe).
- **Concurență/race pe cache** (două apeluri simultane la același fișier în timp ce se scrie) — nu am găsit un scenariu determinist de testat fără `fs` async real; risc scăzut, dat fiind că totul e sincron (`fs.*Sync`).
- **Integrarea cu `server.js`/`/api/agents`** — nu era în scope-ul T-02 (brief-ul cere teste pentru `rank.js`); dacă planner-ul vrea acoperire end-to-end pe endpoint, e un task separat.

## Suspiciuni de bug

Niciuna găsită în `rank.js` — codul se comportă conform documentației proprii (early-return pe input invalid, try/catch la fiecare punct de eșec posibil, cache pe mtime, truncare sigură).

## Comanda de rulare

```
node --test test/
```
sau, doar fișierul nou:
```
node --test test/rank.test.mjs
```
(rulat din `D:\RPGfactory`)
