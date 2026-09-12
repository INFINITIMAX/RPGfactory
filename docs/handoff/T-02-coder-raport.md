# T-02 — Raport coder

## Fișiere schimbate/adăugate

- **`D:\RPGfactory\rank.js`** (nou) — modul separat cu funcția `getRank(cwd, sessionId)` care întoarce `{ rank, model }`. Am ales fișier separat (permis de brief) ca să nu încarc `server.js` cu logica de parsare JSONL + cache.
- **`D:\RPGfactory\server.js`** (modificat) — `require('./rank')`, apel `getRank(data.cwd, data.sessionId)` în `readAgents()`, câmpurile `rank` și `model` adăugate în obiectul returnat pentru fiecare agent.

## Encoding-ul de cale

`encodeCwd(cwd)` = `cwd.replace(/[\\/:]/g, '-')` — înlocuiește `\`, `/` și `:` cu `-`.

Verificat manual, nu doar teoretic: am listat `~/.claude/projects/` și există efectiv folderul `C--Users-Lucian-PC` (pentru cwd `C:\Users\Lucian-PC`) și `D--Omnia-MVP-coder` (pentru cwd `D:\Omnia-MVP\coder`). Ambele confirmă regula (fiecare `\`/`:` devine un singur `-`, fără compactare). Am mai verificat direct conținutul unui `.jsonl` real (`24bcc25f-...jsonl` din `C--Users-Lucian-PC`) și liniile de tip `assistant` au câmpul `"model":"claude-sonnet-5"` la nivel rădăcină, exact cum descrie brief-ul.

## Implementare

- `readTail(filePath, size)`: `fs.statSync` pentru mărime, apoi `fs.openSync` + `fs.readSync` doar pe ultimii `TAIL_BYTES` (20KB), nu tot fișierul. Întoarce și `truncated: start > 0`.
- `findLastAssistantModel(text, truncated)`: dacă am tăiat coada, arunc prima linie (poate fi JSON parțial, tăiat la mijloc); parcurg liniile rămase de la coadă spre început, primul `JSON.parse` reușit cu `type === 'assistant' && entry.model` câștigă. Linii nevalide (parse error) sunt ignorate silențios — nu opresc căutarea.
- `modelToRank(model)`: `includes` case-insensitive pe `opus` / `sonnet` / `haiku`, altfel `null`. Nu inventează un rang implicit.
- **Cache**: `Map` cheie = cale fișier `.jsonl`, valoare `{ mtimeMs, rank, model }`. La fiecare apel verific `fs.statSync(filePath).mtimeMs` — dacă e identic cu ce am în cache, întorc direct valorile cache-uite, fără să mai citesc coada. Dacă `.jsonl` nu există (nici `statSync` inițial), întorc `{ rank: null, model: null }` fără să arunc.
- Orice eroare la citire/parsare e prinsă local (try/catch) și degradează la `model: null` → `rank: null`, fără să propage excepție spre `readAgents()`/`/api/agents`.

## Cazuri limită observate

- Prima linie a unui `.jsonl` poate fi `{"type":"mode",...}` fără `model` — ignorată normal de bucla de parsare (nu are `type === 'assistant'`).
- Dacă tot fișierul e sub 20KB, `truncated` e `false` și nu arunc nicio linie (fișierul întreg e valid JSON pe linii).
- Am văzut și fișiere `.jsonl` în subfoldere `subagents/` (pentru sesiuni de agenți lansați de alt agent) — nu le-am tratat special, brief-ul cere doar `<cwd-encodat>/<sessionId>.jsonl` direct în `projects/`.

## Testare manuală sugerată

1. Pornește `node server.js` din `D:\RPGfactory`.
2. `curl http://localhost:5311/api/agents` (sau browser) — fiecare agent viu trebuie să aibă acum `rank` și `model`.
3. Pentru un agent cu sesiune reală în `~/.claude/projects/<cwd-encodat>/<sessionId>.jsonl` conținând linii `assistant` cu model sonnet/opus/haiku, verifică maparea corectă (`Captain`/`Fleet Admiral`/`Cadet`).
4. Pentru un agent al cărui `sessionId`/`cwd` nu are transcript corespunzător, verifică `rank: null, model: null` și că endpoint-ul nu crapă.
5. Verifică cache-ul: apelează endpoint-ul de două ori la rând fără să modifici transcript-ul — a doua oară nu ar trebui să existe I/O suplimentar pe fișier (poate fi verificat prin logging temporar sau prin `fs` watch, la latitudinea planner-ului).

## Ce NU am făcut

- Nu am atins `public/`, `.env*`, `.gitignore`, `README.md`, `assets/`.
- Nu am adăugat dependențe npm.
- Nu am scris teste (rolul tester-ului).
