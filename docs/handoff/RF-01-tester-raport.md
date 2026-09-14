# RF-01 — raport tester

**Data:** 15-09-2026, EET.

## Ce am acoperit

Pe defect (D1–D12), fișier, ce dovedește, și de ce ar fi eșuat pe codul vechi:

- **D1** — `test/server.test.mjs`: `createServer()` fără `listen` are `s.listening === false` și `s.address() === null`; un test separat monkey-patch-uiește temporar `fs.readdirSync` și verifică `calls.length === 0` până la primul `GET /api/agents`. Pe baseline nu exista `createServer`/`startServer` deloc (`require('../server.js')` pornea singur `listen(5311)` și citea `~/.claude/sessions`) — testul ar fi eșuat imediat la `require('../server.js').createServer`, care e `undefined`.
- **D2** — `test/server.test.mjs`: `srv.address.address === '127.0.0.1'`, explicit diferit de `::`/`0.0.0.0`. Pe baseline `server.listen(PORT)` fără host asculta pe toate interfețele (confirmat în oracol).
- **D3** — `test/http-guards.test.mjs` (unitar pe `checkOrigin`) + `test/server.test.mjs` (integrare HTTP): Host corect + Origin cu alt port → 403; Host cu port greșit → 403 (verificat cu `http.request` brut, `Host` suprascris manual); Origin/Host ambele corecte → trece. Pe baseline, `hostnameOf()` arunca portul din Origin, deci un port diferit trecea (200) — confirmat în oracol.
- **D4** — `test/http-guards.test.mjs` (unitar pe `resolveStaticPath`) + `test/server.test.mjs` (HTTP capăt-la-capăt, cu `publicDir` fixture temporar și director frate `public-secret`): traversal simplu, `..%2F` codat, backslash Windows, byte nul, și o cale legitimă adâncă (`/sprites/pawn.png`) care trebuie să meargă. Verific explicit că textul secret nu apare în răspuns. Pe baseline, `startsWith(publicRoot)` pe prefix de șir lăsa `public-secret` să treacă (200 cu conținutul fișierului) — exact defectul din oracol.
- **D5** — `test/state.test.mjs`: stare inexistentă + `baseUpdatedAt:0` → 200; stare existentă (rev>0) + `baseUpdatedAt:0` → 409, disk neschimbat (comparat byte-cu-byte înainte/după). Pe baseline, `if (base && ...)` trata `0` ca fals și sărea peste verificare necondiționat — oracolul a confirmat că un `PUT` cu `baseUpdatedAt:0` pe o stare existentă înlocuia tot fără 409.
- **D6** — `test/state.test.mjs`: `archived` obiect, `archivedAt` string, câmp necunoscut, `version:2`, `__proto__` direct în `archivedAt`, `__proto__` imbricat la adâncime 4 în `plots`, `plots` la adâncime exact 8 (acceptat) vs 9 (respins), `plots` peste/sub 512 KiB. După fiecare 400 verific `readDiskStateRaw()` neschimbat byte-cu-byte. Pe baseline nu exista nicio validare de schemă — orice tip trecea și se persista (confirmat în oracol: `archived` obiect + `archivedAt` string au fost scrise pe disc cu 200).
- **D7** — `test/state-store.test.mjs` (direct pe `createStateStore`, ceas înghețat `now: () => 1700000000000`): două `writeState` consecutive produc `updatedAt` strict crescător. Pe baseline, revizia venea din `Date.now()`; cu ceasul înghețat (exact tehnica din oracol), două scrieri ar fi primit aceeași revizie.
- **D8** — `test/body.test.mjs`: `Content-Length` declarat peste 1 MiB → 413 imediat, cu dovadă că body-ul NU a fost citit (trimit doar 16 octeți reali sub un `Content-Length` mult mai mare; dacă serverul ar aștepta restul, cererea ar expira din timeout, nu ar primi 413 prompt). Body real >1 MiB trimis chunked (fără `Content-Length`) → 413 la acumulare. Ambele sub limită → 200. Pe baseline nu exista niciun plafon (`body += chunk`) — oracolul a confirmat 8 MB acceptat fără eroare.
- **D9** — `test/server.test.mjs`: `GET /app.js?v=1` → 200, conținut identic cu `GET /app.js`; `GET /api/agents?x=1` → tratat ca rută API (200, array), nu ca fișier. Pe baseline, `?v=1` ajungea literal în `path.join`, deci `/app.js?v=1` dădea 404 (confirmat în oracol).
- **D10** — `test/server.test.mjs`: tabel parametrizat cu metodă greșită pe fiecare rută (`/api/agents`, `/api/open`, `/api/reveal`, `/api/new-session`, `/api/state`, și o rută statică) → 405 + header `Allow` exact. Pe baseline, `DELETE /api/agents` răspundea 200 cu lista de agenți (confirmat în oracol) — ruta se potrivea doar pe URL, nu pe metodă.
- **D11** — `test/state.test.mjs`: monkey-patch temporar pe `fs.writeFileSync` (eșuează o singură dată cu `ENOSPC` simulat, apoi restaurat), pe un al doilea server dedicat cu `dataDir` propriu. Verific: (a) răspunsul e 500, primit sub un `Promise.race` cu timeout de 3s (dovadă că cererea nu atârnă); (b) un `PUT` ulterior, valid, pe ACELAȘI store, primește 200 și se persistă corect — dovadă că lanțul `writeQueue` n-a rămas rupt. Pe baseline nu exista deloc coadă de scriere serializată cu try/catch în jurul `persist`, iar acest scenariu n-ar fi avut cum să fie testat cu acest contract (nu exista `createStateStore`/`dataDir` injectabil) — migrare completă, dar exact granița pe care coder-ul o descrie ca fiind reparată de D11.
- **D12** — `test/api-open.test.mjs`: opener injectat, `opened` array verificat că primește exact ținta `claude://resume?session=...`; niciun `spawn`/`rundll32` real în nicio rulare. `sessionId` cu `\r`, `\n`, `\x00` → 400, opener NEAPELAT (verificat explicit `opened.length === 0`). Pe baseline nu exista injecție de opener (fire-and-forget necondiționat spre `spawn`), deci acest contract nu putea fi testat fără să lansăm un proces real — motivul central al migrării întregului fișier.

## Contractele pinuite

Din §2.4:
- **Full replace, nu merge** — `test/state.test.mjs`, testul `contract: PUT care omite archived îl resetează la []`. Setup auto-suficient (nu depinde de starea lăsată de alte teste).
- **Origin diferă pe metodă** — pinuit atât unitar (`http-guards.test.mjs`: `GET` fără Origin trece, `PUT` fără Origin respins) cât și la nivel HTTP (`server.test.mjs`).
- **Rută necunoscută sub `/api/` → 404** — `server.test.mjs`, `GET /api/nu-exista`.
- **`savedAt`** — `state.test.mjs`: apare pe disc/în GET ca ISO string valid; un `PUT` care îl trimite în body e respins ca „câmp necunoscut” (400), disk neschimbat.

Din §3.4:
- **`createServer()` singur respinge tot ce e sub `/api/`** — `server.test.mjs`, testul explicit `§3.4 (pinuit)`: `createServer()` + `listen()` manual, fără `startServer`, dă 403 pe `/api/agents` chiar cu Origin/Host corecte. Am folosit `startServer` peste tot altundeva, exact cum cere brief-ul.

## Ce am găsit și nu am putut repara

**§3.2 — risc real de `unhandledRejection`, confirmat prin analiză de cod, test scris în `test/state-store.test.mjs`.**

În `state.js`, `handlePutState` face:
```js
try {
  next = persist({...});
} catch (e) { /* 500, prins */ }
res.writeHead(200, {...});   // <-- ÎN AFARA try/catch-ului de mai sus
res.end(JSON.stringify(next));
```
Dacă `res.writeHead(200, ...)` aruncă din orice alt motiv decât eșecul din `persist()` (de exemplu, headere deja trimise), excepția scapă din funcția pasată la `serialise(() => {...})`, iar `handlePutState` **ignoră promisiunea întoarsă** de `serialise`. `writeQueue` devine o promisiune respinsă pe care nimeni n-o prinde — pe Node cu comportamentul implicit strict, asta poate termina procesul.

Testul din `test/state-store.test.mjs` reproduce exact acest lanț: un `fakeRes.writeHead` care aruncă la prima chemare (simulând „headers already sent”), apelat prin `store.handlePutState(fakeReq, fakeRes)` cu un body altfel valid. Înregistrez un listener `process.on('unhandledRejection', ...)` **înainte** de a declanșa scenariul (ceea ce suprimă crash-ul implicit pe acel eveniment, deci testul e sigur de rulat) și verific dacă listener-ul a fost efectiv chemat.

Nu am rulat testul (nu am voie), deci nu pot confirma empiric rezultatul — dar pe baza citirii codului, mă aștept ca testul să **treacă demonstrând bug-ul** (adică să confirme că apare un `unhandledRejection` neprins). Dacă planner-ul rulează suita și acest test eșuează cu mesajul „nu am reușit să observ un unhandledRejection”, înseamnă că ceva prinde excepția pe altă cale decât am înțeles eu din cod — raportați înapoi, merită reexaminat codul.

**Severitate:** medie-mare — nu e declanșat de intrare obișnuită (necesită un `res` care aruncă la `writeHead`, ceva ce nu se întâmplă în trafic normal HTTP), dar dacă se întâmplă vreodată (client care închide brusc conexiunea în punctul greșit, dublu-răspuns dintr-un bug viitor etc.), efectul e opac: procesul poate cădea, nu doar cererea.

**Nu am reparat nimic** — am doar scris testul care expune riscul, conform regulilor mele.

## Ce nu am putut testa

- **§3.3 — 413 scris, apoi `req.destroy()`: ECONNRESET vs 413 la client.** Am scris testul (`test/body.test.mjs`, ultimul din fișier) folosind `http.request` brut și verificând ce primește efectiv clientul. L-am structurat cu `t.skip(...)` pe ramura de eroare (`req.on('error', ...)`), nu cu un `assert` care ar eșua suita la o cursă reală de rețea — exact cum cere brief-ul. Nu pot confirma din citirea codului dacă va reproduce ECONNRESET sau va primi 413 curat; planner-ul va vedea rezultatul real la rulare (fie `pass` cu 413, fie `skip` cu motivul consemnat).
- **Politica symlink/junction pe containment-ul static** — explicit exclusă și de coder, și de oracol, ca fiind în afara acestui lot. Nu am scris teste pentru ea.
- **`rundll32` chiar deschide `claude://...`** — intenționat netestat, ca și în suita veche; `opener` e injectat și verificat doar la nivel de contract HTTP (target primit), nu de proces real.
- Nu am putut verifica empiric NICIUNUL dintre testele scrise — nu am voie să rulez comenzi. Toate afirmațiile de mai sus sunt „am scris un test care verifică X”, nu „X trece”.

## Migrarea testelor existente

- **`test/api-open.test.mjs`** — rescris integral pe `startServer({port:0, opener injectat})`. Eliminat complet monkey-patch-ul pe `http.createServer` și portul fix 5391. Păstrate toate cazurile vechi (sessionId valid/lipsă/gol/numeric, JSON invalid, „serverul rămâne funcțional după body stricat”). Adăugat: verificare explicită a țintei primite de opener (nu doar status HTTP), și cazurile D12 (`\r`/`\n`/`\x00`).
- **`test/server.test.mjs`** — rescris pe `startServer`. Păstrate din T-18: rutele `/api/reveal`/`/api/new-session` (folder valid/relativ/inexistent/fișier/JSON invalid) și din T-19: toate cazurile Host/Origin (H1–H7), rescrise ca teste D3/contract, cu `http.request` brut pentru cazurile de `Host` falsificat. Adăugate: D1, D2, D4 (HTTP), D9, D10, §3.4. Eliminat portul fix 5393.
- **`test/state.test.mjs`** — rescris pe `startServer({dataDir: temp})`. Eliminat complet backup/restore pe `data/state.json` real și portul fix 5392. Păstrate din T-06/T-09: GET pe stare inexistentă, scriere/citire de bază, format JSON indentat pe disc, fără fișiere `.tmp` reziduale, defaults la fișier vechi fără `plots`, `plots` deja populat nu e resetat. **Am eliminat** testul vechi „PUT fără `baseUpdatedAt` → 200, scrie necondiționat” — comportamentul s-a schimbat intenționat: acum `baseUpdatedAt` e obligatoriu (validat ca număr finit), iar lipsa lui dă 400, nu scriere necondiționată. L-am înlocuit cu un test care fixează exact acest lucru nou. Am eliminat și testul vechi „baseUpdatedAt=0 tratat ca lipsă” — era documentarea explicită a **defectului D5**; l-am înlocuit cu D5a/D5b care fixează comportamentul corect (0 valid doar când chiar corespunde stării curente).
- **Fișiere noi:** `test/http-guards.test.mjs` (unitar, D3/D4/contracte/§3.4), `test/body.test.mjs` (D8, §3.3), `test/state-store.test.mjs` (§3.1, §3.2, D7 la nivel de modul, fără HTTP).

## Contradicții găsite în brief

Niciuna.

## RF-01b — corecție așteptare D4

**Ce am schimbat și de ce noua aserțiune e mai bună:**

În `test/server.test.mjs`, testul D4 vechi (`GET /../public-secret/leak.txt -> 403`) codifica un mecanism intern (containment) în loc de proprietatea de securitate reală. La nivel HTTP, `new URL(req.url, base)` din `server.js` normalizează singur `..` din calea neîncodată *înainte* ca `resolveStaticPath` să vadă ceva — deci acest caz particular nu ajunge niciodată la verificarea de containment, iar 404 e răspunsul corect (fișier inexistent sub `public/`), nu 403.

Am înlocuit testul cu:

1. **Un bucle parametrizată pe proprietate**, pentru toate cele trei variante (`..` neîncodat, `..%2F` codat, backslash Windows): `status !== 200` și conținutul secret absent din body. Asta e ce contează pentru securitate — indiferent care mecanism intern oprește cererea.
2. **Trei teste separate care pinuiesc mecanismul exact al fiecărei variante**, cu comentariu care explică de ce diferă:
   - `/../public-secret/leak.txt` → **404**, pentru că `..` e normalizat de `new URL()` înainte de `resolveStaticPath`.
   - `/..%2Fpublic-secret%2Fleak.txt` → **403**, pentru că `%2F` supraviețuiește normalizării, `..` ajunge intact și e prins la containment. (Acesta era deja corect în testul vechi — l-am păstrat, doar cu comentariul de mecanism adăugat.)
   - `/..\public-secret\leak.txt` (backslash) → **404**, pe același mecanism ca varianta 1: pentru scheme speciale (`http`), parser-ul WHATWG URL tratează `\` ca separator de cale identic cu `/`, înainte de a colapsa `..`. Deci ajunge la aceeași normalizare ca prima variantă.

Nu am putut rula suita — comentariul de la testul cu backslash marchează explicit că statusul 404 e **dedus din spec-ul URL, nu verificat prin execuție**. Dacă planner-ul rulează și primește alt status decât 404 pe acel test, e un semnal real de reexaminat mecanismul, nu doar de reparat orbește aserțiunea.

Ce anume ar face fiecare test să cadă:
- bucla pe proprietate: orice modificare de cod care ar face secretul să scape (status 200 cu conținutul fișierului din `public-secret/`) pe oricare din cele trei variante.
- testele de mecanism: dacă vreo variantă începe să dea alt status decât cel pinuit — semnal că mecanismul intern (normalizare `new URL` vs. containment în `resolveStaticPath`) s-a schimbat, chiar dacă proprietatea de securitate (secretul nu apare) rămâne intactă.

**Alte teste cu același tipar pe care le-am găsit (sau confirmarea că nu există):**

Am verificat tot `server.test.mjs` și `http-guards.test.mjs`. Nu am găsit alt caz din tiparul "statusul exact codifică un mecanism intern care variază legitim" — celelalte statusuri exacte (403 pe Origin/Host greșit, 405 + `Allow` pe metodă greșită, 404 pe rută necunoscută, 400 pe validare de schemă) sunt contracte HTTP stabile ale API-ului, nu depind de o cale de normalizare care poate lua ramuri diferite pentru intrări echivalente ca intenție.

Am reexaminat separat testele unitare pe `resolveStaticPath` din `http-guards.test.mjs` (liniile ~120-155): acestea apelează funcția direct, cu un pathname deja "brut" (neîncodat, cu `..` intact) — un input care, în fluxul HTTP real, nu ajunge niciodată acolo neschimbat (e normalizat mai devreme de `new URL()` în `server.js`, exact mecanismul confirmat pentru D4). Nu sunt totuși din același tipar defect: sunt teste unitare deliberate de robustețe pe funcția de containment în izolare (defense-in-depth — dacă vreodată un apelant viitor trimite `..` neschimbat, funcția trebuie tot să-l prindă), nu afirmații despre comportamentul HTTP capăt-la-capăt. Le-am lăsat neatinse.

**Fișiere atinse:** doar `test/server.test.mjs` (secțiunea D4 HTTP). Nu am atins `test/http-guards.test.mjs` (nu era nevoie), `body.js`, `state.js`, `server.js`, `server/http-guards.js`, `test/body.test.mjs`, `test/state-store.test.mjs`.

**Nu am rulat nimic** — planner-ul confirmă rezultatul, în special testul cu backslash marcat mai sus ca dedus, nu verificat.

## RF-01b — completare după verificarea planner-ului (`%5C`)

Planner-ul a rulat suita: deducția mea pe backslash brut (`/..\public-secret\leak.txt` → 404) s-a confirmat. Am actualizat comentariul acelui test: am scos „NEVERIFICAT” și l-am înlocuit cu „Verificat de planner, 15-09-2026”.

Planner-ul a găsit separat un caz neacoperit: **`%5C`, backslash codat procentual** (`/..%5Cpublic-secret%5Cleak.txt`), măsurat manual la **403**. Simetric cu `%2F`: `new URL()` normalizează backslash-ul *brut* la `/` înainte de a colapsa `..`, dar nu atinge `%5C` (rămâne segment codat). Ajunge intact la `resolveStaticPath`, e decodat acolo (`\` literal), iar pe Windows `path.resolve` tratează `\` ca separator — calea decodată chiar iese din `publicDir`, și verificarea de containment o prinde → 403.

Am adăugat:
- `%5C` în bucla de proprietate (status ≠ 200, secretul absent din body) — cade dacă vreo modificare de cod ar lăsa acest vector să scape cu 200.
- un test de mecanism separat, pinuind **403**, cu comentariu care explică simetria cu `%2F` și de ce e specific containment-ului pe Windows (pe POSIX, `\` decodat n-ar fi separator de cale, deci probabil 404 — netestat, notat explicit ca presupunere, fiindcă mediul de test e Windows).

**Variante mixte/dublu-codate (`%2F%5C`, `%252F`):** nu le-am adăugat. Motivul: nu introduc un mecanism nou de securitate distinct de ce e deja pinuit. Un mix `%2F`+`%5C` ar fi prins tot la containment, prin același mecanism ca fiecare parte individual (segment codat supraviețuiește normalizării `new URL`, decodat mai târziu, `path.resolve` iese din root). Dublu-codatul (`%252F`) s-ar decoda o singură dată (dacă `resolveStaticPath` face un singur `decodeURIComponent`) la literalul `%2F`, care nu e separator de cale pentru nimic — cel mai probabil 404 pe un nume de fișier inexistent, nu un vector de traversal nou. Adăugarea lor ar umfla numărul de teste fără să acopere un mecanism nou; le-am lăsat afară conform instrucțiunii explicite de a nu umfla testele fără motiv real. Dacă planner-ul vrea totuși acoperire pe dublu-codare (de ex. dacă `resolveStaticPath` chiar face decodare recursivă/multiplă undeva), e un semnal diferit și merită un task separat, nu o extensie tăcută aici.

**Fișiere atinse la această completare:** doar `test/server.test.mjs` (comentariul backslash actualizat + testul `%5C` nou, în bucla de proprietate și ca test de mecanism). Nimic altceva schimbat.

## RF-01c — inversarea testului §3.2 (`unhandledRejection` → coadă sănătoasă)

**Context:** planner-ul a semnalat că fixul RF-01b (helper `respond(res, status, body)`, cu try/catch aplicat pe toate cele trei ieșiri din `serialise()` din `handlePutState`: 409, 500, 200) a rezolvat exact bug-ul pe care testul meu original din `test/state-store.test.mjs` îl documenta. Testul vechi afirma **prezența** bugului (`assert.fail` dacă NU apărea un `unhandledRejection`) — corect la vremea lui, dar acum pică din motivul opus: nu mai apare rejecția pe care o cerea.

**Ce am schimbat:** am rescris blocul §3.2 din `test/state-store.test.mjs` (singurul fișier atins) cu trei teste, câte unul pentru fiecare cale protejată de `respond`:

1. **200 (succes):** `res.writeHead` aruncă imediat după ce `persist()` a reușit. Verific `unhandled === null`, apoi apelez `store.writeState(...)` din nou și confirm că primește **rev 2** — dovadă că `writeQueue` a rămas funcțională și că scrierea eșuată la trimiterea răspunsului chiar a persistat pe disc (rev 1).
2. **409 (conflict CAS):** pre-populez o revizie reală (rev 1), apoi trimit un PUT cu `baseUpdatedAt` greșit, cu `writeHead` care aruncă la trimiterea 409-ului. Verific `unhandled === null` și că o scriere validă ulterioară primește **rev 2**.
3. **500 (eroare de disc):** monkey-patch temporar pe `fs.writeFileSync` (aceeași tehnică folosită deja la D11 din `test/state.test.mjs`), care face `persist()` să arunce; `writeHead` aruncă și el la trimiterea 500-ului — deci ambele straturi de protecție (try/catch din `handlePutState` în jurul lui `persist`, și try/catch din `respond` în jurul lui `writeHead`) sunt exercitate în același test. Verific `unhandled === null`, restaurez `fs.writeFileSync`, apoi confirm că scrierea validă ulterioară primește **rev 1** (scrierea eșuată nu a atins discul).

Pentru fiecare test verific și `writeHeadCalls === 1` unde e relevant, ca dovadă că `respond` nu reîncearcă silențios sau nu cheamă `res.end` după ce `writeHead` a aruncat.

**Istoricul păstrat în comentariu:** blocul §3.2 are acum un comentariu extins care explică explicit: ce afirma testul vechi (prezența bugului, cu `assert.fail` pe absența rejecției), că a prins un bug real și a forțat reparația, ce afirmă acum (absența rejecției + coadă sănătoasă), și de ce contractul s-a inversat legitim — nu pentru că a fost slăbit ca să treacă verde.

**Ce ar face fiecare test să cadă:**
- oricare din cele trei, dacă protecția din `respond` e scoasă sau ocolită pe o cale nouă → reapare `unhandled !== null`.
- verificările de revizie (`next.updatedAt`) cad dacă `writeQueue` rămâne "înțepenită" după un eșec pe `writeHead` (de exemplu dacă cineva reintroduce un throw neprins care rupe lanțul `.then()`), chiar dacă `unhandledRejection` nu mai apare — de asta proba pe coadă e separată de proba pe rejecție, exact cum a cerut planner-ul.

**Fișiere atinse:** doar `test/state-store.test.mjs` (blocul §3.2, liniile ~49 până la finalul fișierului vechi). Nu am atins `test/body.test.mjs` (rămâne roșu intermitent, la coder pentru a treia rundă) și nici codul de producție (`state.js`, `body.js`, `server.js`, `server/http-guards.js`).

**Nu am rulat nimic** — planner-ul confirmă rezultatul.
