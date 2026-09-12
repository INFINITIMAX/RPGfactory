# T-02 — Teste pentru rangul din model

## Sarcină

Scrie teste pentru `rank.js` (funcțiile exportate: `getRank`, `encodeCwd`, `modelToRank`) — vezi `docs/handoff/T-02-coder.md` (**citește nota de corecție de la final** — brief-ul original a avut o greșeală de structură JSON, corectată ulterior) și `docs/handoff/T-02-coder-raport.md` pentru context.

Notă importantă: brief-ul inițial al coder-ului spunea greșit că `model` e la rădăcina liniei `assistant`. Planner-ul a găsit bug-ul manual (verificând o linie reală cu `node -e`) și a corectat `rank.js` direct — modelul e de fapt la `entry.message.model`. Verificat manual că funcționează: `curl /api/agents` întoarce acum `rank`/`model` corecte pentru sesiunea curentă. Scrie testele pe codul curent din `rank.js` (cel corectat), nu pe ce descrie brief-ul original.

## Ce trebuie testat cu adevărat

`rank.js` exportă funcții pure, ușor de testat izolat cu `import`/`require` direct — nu ai nevoie de `node:vm` ca la T-01 (fișierul chiar are `module.exports`).

1. **`modelToRank`**: `"claude-opus-5"` → `"Fleet Admiral"`; `"claude-sonnet-5"` → `"Captain"`; `"claude-haiku-4-5-20251001"` → `"Cadet"`; un model necunoscut (ex. `"gpt-4"`) → `null`; `null`/`undefined`/`""` ca input → `null`, fără să arunce. Verifică și case-insensitivity (ex. `"Claude-Opus-5"` tot ar trebui să dea `"Fleet Admiral"`).
2. **`encodeCwd`**: `"C:\\Users\\Lucian-PC"` → `"C--Users-Lucian-PC"` (verificat manual de coder pe disc — folosește exact acest exemplu, nu unul inventat). Testează și un cwd cu `/` (dacă apare vreodată pe alt OS).
3. **`getRank` cu fixture-uri reale de fișier** — cel mai important test: creează un fișier `.jsonl` temporar (în `os.tmpdir()`, șters după test) cu conținut controlat de tine, ce conține o linie `{"type":"assistant","message":{"model":"claude-opus-5"}}` — dar **nu poți controla ușor unde caută `getRank`** (calea e derivată din `~/.claude/projects/`). Dacă `rank.js` nu permite injectarea unui folder de bază pentru teste, notează asta ca limitare în raport (nu modifica `rank.js` ca să-l faci testabil — nu e rolul tău) și testează în schimb `findLastAssistantModel`/`readTail` dacă sunt exportate separat; dacă nu sunt exportate deloc, testează ce poți din funcțiile publice și documentează clar ce ai lăsat neacoperit și de ce.
4. **Cache**: dacă poți testa comportamentul de cache fără să depinzi de fișiere reale din `~/.claude`, fă-o; altfel documentează ca netestat izolat (motivat).
5. **Linie `assistant` fără `message.model`** (ex. `{"type":"assistant","message":{}}`) → nu trebuie să arunce, trebuie să continue căutarea în liniile anterioare sau să întoarcă `null` dacă nu găsește nimic valid.

## Ce NU e un test valid

- Nu testa împotriva fișierelor reale din `~/.claude/projects/` ale lui Lucian — sunt date personale, se pot schimba oricând, testul ar deveni fragil/nedeterminist. Folosește fixture-uri proprii, izolate, în `os.tmpdir()`.
- Nu scrie un test care doar verifică că funcția "nu aruncă" fără să verifice și valoarea returnată, unde valoarea contează.

## Constrângeri dure

- Nu modifica `rank.js` sau `server.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără framework nou.

## Predare

Fișier de teste (ex. `test/rank.test.mjs`) + `docs/handoff/T-02-tester-raport.md`: ce ai testat, ce NU (și de ce — în special dacă `getRank` nu e testabil izolat din cauza căii hardcodate spre `~/.claude`), comanda exactă de rulare.
