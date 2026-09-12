# T-02 — Rang din model (Fleet Admiral / Captain / Cadet)

## Sarcină

Extinde `server.js` ca fiecare agent din `/api/agents` să aibă și un câmp `rank`, calculat din modelul folosit în sesiunea lui reală.

## Context

`server.js` citește acum doar `~/.claude/sessions/*.json` (registrul de procese vii — pid, cwd, status). Modelul nu e acolo. E în transcript-ul de conversație:

`~/.claude/projects/<cwd-encodat>/<sessionId>.jsonl`

unde `<cwd-encodat>` e `cwd`-ul cu `\` și `:` (și orice alt separator de cale) înlocuite cu `-` (verificat manual: `C:\Users\Lucian-PC` devine folderul `C--Users-Lucian-PC`).

Fiecare linie din `.jsonl` e un JSON separat. Liniile de tip `"type":"assistant"` au un câmp `message` (formatul răspunsului Anthropic), iar modelul e la `message.model` — ex. `"claude-sonnet-5"` (sau `claude-opus-5`, `claude-haiku-4-5-...` etc.). [Corecție post-livrare: brief-ul inițial spunea greșit că `model` e la rădăcina liniei — era de fapt imbricat. Verifică mereu cu un `node -e` real pe o linie reală înainte să presupui structura, nu doar `grep`.] Fișierul poate fi mare (am văzut unul de 5MB+) — **nu-l citi întreg**; citește doar ultimii ~10-20KB (coadă), suficient să găsești cel puțin o linie de asistent recentă. Dacă nu găsești niciuna în coadă, e acceptabil să returnezi `rank: null` — nu extinde citirea la tot fișierul doar pentru asta.

## Rezultat așteptat

- Funcție nouă (în `server.js` sau, dacă preferi, un fișier separat `rank.js` cerut de la același folder) care, dat un `cwd` și un `sessionId`, întoarce rangul.
- Maparea: modelul conține (case-insensitive) `opus` → `"Fleet Admiral"`; `sonnet` → `"Captain"`; `haiku` → `"Cadet"`; altceva sau negăsit → `null` (nu inventa un rang implicit).
- `/api/agents` include acum `rank` (și, util pentru depanare, `model` brut) pe lângă câmpurile existente.
- **Cache pe mtime al fișierului `.jsonl`**, la fel ca adaptoarele din bot-crossing — nu recitim coada fișierului la fiecare poll de 3 secunde dacă fișierul nu s-a schimbat de la ultima citire.

## Constrângeri dure

- Nu adăuga npm dependencies.
- Nu modifica `public/*` (asta ține de T-01, e deja acceptat).
- Nu modifica `.env*`, `.gitignore`, `assets/`.
- Dacă transcript-ul nu există sau nu poate fi citit (ex. permisiuni, fișier lipsă), agentul tot apare în `/api/agents`, doar cu `rank: null` — nu arunca eroare care oprește tot endpoint-ul.
- Comentează de ce facem encoding-ul de cale așa cum îl facem (nu e evident) și de ce citim doar coada, nu tot fișierul.

## Ce NU are voie să atingă

`public/`, `.env`, `.env.example`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-02-coder-raport.md`: ce fișiere ai schimbat/adăugat, cum ai implementat encoding-ul de cale (și dacă ai verificat-o manual pe un exemplu real), orice caz limită pe care l-ai observat, cum se testează manual.
