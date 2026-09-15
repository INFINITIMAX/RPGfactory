# RF-03a — brief coder: adaptor Claude Code, ingestie automată în fundal

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-03a — primul adaptor real (Claude Code), sondare automată în fundal.
**Decizii confirmate de Lucian (nu re-deschide):** Claude Code întâi, separat de Pi (RF-03b, ulterior); ingestia rulează automat, la interval, cât timp serverul e pornit — nu la cerere manuală.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

Până acum, `runs.js` (RF-02c) știe să înregistreze o sesiune observată, dar nimic nu-l cheamă cu date reale. Tu construiești primul adaptor: citește sesiunile Claude Code reale (același mecanism folosit deja de `/api/agents`, `readAgents()` din `server.js`) și le trece prin `runsStore.observeRun(...)`, automat, la interval, cât timp serverul rulează.

**Ce NU e în acest lot**: Pi (RF-03b, separat), orice asociere automată sesiune→profil (rămâne strict manuală — I26/I38, planner propune, Lucian aprobă, adaptorul DOAR observă), orice UI (RF-04).

Trei livrabile:

1. **`adapters/claude-code.js`** — o funcție PURĂ, testabilă, care face UN ciclu de sondare (nu conține ea însăși un timer).
2. **Wiring în `server.js`** — pornește/oprește sondarea periodică, legat corect de `startServer()`/`close()`.
3. Nimic nou în schemă — `runs` (RF-02c) e deja suficientă.

## 2. Contractele

### 2.1 `adapters/claude-code.js` — funcția de sondare

```js
function pollClaudeCodeSessions({ sessionsDir, isAlive, runsStore, now }) -> void (sau un rezumat, vezi mai jos)
```

Citește **exact același mecanism** ca `readAgents()` din `server.js` (nu reinventa parsarea): listează `*.json` din `sessionsDir`, parsează fiecare, ia `sessionId`, `cwd`, `pid`.

**Diferență importantă față de `readAgents()`, deliberată — citește cu atenție:**

`readAgents()` FILTREAZĂ sesiunile moarte (`.filter(a => a && a.alive)`) — nu le mai raportează deloc. **Adaptorul tău NU filtrează** — observă TOATE sesiunile găsite, vii sau moarte:

- PID viu (`isAlive(pid)` adevărat) → `runsStore.observeRun({ sourceHarness: 'claude-code', nativeId: sessionId, project: cwd, lifecycle: 'running' })`.
- PID mort (fișierul de sesiune încă există, dar procesul a dispărut) → `observeRun({ ..., lifecycle: 'stopped' })`.

**De ce**: `spec.md` §4 cere ca lifecycle-ul să fie onest, nu ascuns prin filtrare tăcută — o sesiune care s-a oprit trebuie să ajungă `'stopped'` în `runs`, nu pur și simplu să dispară din citiri fără urmă. Dacă fișierul de sesiune dispare complet de pe disc între două sondări (procesul a murit ȘI fișierul s-a șters înainte să apucăm să-l vedem mort), rândul din `runs` rămâne la ultima stare observată — asta e o limitare acceptată a sondării la interval, nu o eroare de reparat aici (menționeaz-o în raport, dar nu construi detectare de „a dispărut complet" în acest lot — e complexitate în plus, nefolosită încă de nimic).

Fișier de sesiune corupt/JSON invalid → sari peste el (exact ca `readAgents()`, `try/catch` care ignoră), nu opri tot ciclul de sondare pentru o singură sesiune stricată.

**`sessionsDir` inexistent** → zero sesiuni, fără excepție (ca la `readAgents()`).

**Rezultatul funcției**: nu trebuie să întoarcă nimic anume (efectul e prin `observeRun`), dar e util pentru tester/diagnosticare să întoarcă un mic rezumat, ex. `{ observed: number, errors: number }` — decide și documentează.

**De ce e o funcție pură, fără timer intern**: testabilă direct, fără să aștepți intervale reale în teste (lecția din tot RF-02: logica separată de wiring-ul HTTP/timer se testează mult mai simplu).

### 2.2 Wiring în `server.js` — pornire/oprire legate corect de ciclul de viață

**Regula strictă, aceeași ca la `db`/`profilesStore`/`runsStore`**: `createServer(options)` NU pornește sondarea la construcție — un `setInterval` pornit la `createServer()` ar citi sesiuni reale de pe disc doar prin faptul că cineva a CONSTRUIT serverul, chiar dacă nu l-a pornit niciodată. Asta ar încălca regula „fără efecte secundare la import/construcție" (RF-01, D1) la fel de grav ca a deschide o bază de date la construcție.

Contract:

```js
// în createServer(options): pregătește, NU pornește
server.startPolling = () => { /* pornește setInterval, idempotent — a doua chemare nu creează al doilea timer */ };
server.stopPolling = () => { /* clearInterval, idempotent — sigur de chemat chiar dacă n-a pornit niciodată */ };
```

- `startServer(...)` cheamă `server.startPolling()` imediat după `listen()` (lângă `server.setAllowedOrigins(...)`).
- **`close()` trebuie să oprească și sondarea** — extinde ACELAȘI wrapper de `server.close` deja existent (RF-02b-c, extins la RF-02c pentru `runsStore`) cu `server.stopPolling()`. **Nu crea alt wrapper paralel** — asta a fost deja greșeala de la RF-02b-b, reparată la RF-02b-c; nu o repeta.
- `options.pollIntervalMs` — injectabil, implicit `5000` (5 secunde). Documentează valoarea aleasă.
- `options.sessionsDir`, `options.isAlive` — deja există ca opțiuni ale lui `createServer` (folosite de `/api/agents`) — refolosește-le pe ACELEAȘI, nu introduce o cale de configurare paralelă.
- Timer-ul (`setTimeout`/`setInterval` returnat) — verifică dacă merită `.unref()` (ca procesul Node să nu rămână agățat DOAR din cauza timer-ului, dacă tot restul s-a închis) — documentează decizia, nu o lua fără s-o explici.

## 3. Ce NU face acest lot

- **Nu citește Pi.** RF-03b, separat, mai târziu.
- **Nu asociază automat sesiuni la profiluri.** Rămâne strict manual (`POST /api/runs/{id}/associate`, deja existent din RF-02c) — I26/I38.
- **Nu adaugă rute HTTP noi.** Sondarea e internă, în fundal — nu există un endpoint „sondează acum" în acest lot (Lucian a ales explicit varianta automată, nu manuală).
- **Nu adaugă coloane noi în `runs`** sau alte axe de stare (activitate, atenție, prospețime) — doar `lifecycle`, ca la RF-02c.
- **Nu detectează „sesiune dispărută complet de pe disc"** — vezi §2.1, limitare acceptată, documentată.

## 4. Fișiere

**Poți crea:** `adapters/claude-code.js` (creează directorul `adapters/` dacă nu există).

**Poți modifica:** `server.js` (wiring `startPolling`/`stopPolling`, extinderea wrapper-ului de `close()`, apelul din `startServer()`).

**NU atinge:** `db.js`, `profiles.js`, `runs.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `test/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 5. Raportul

`docs/handoff/RF-03a-coder-raport.md`:

```
## Ce am implementat
adapters/claude-code.js + wiring-ul din server.js.

## De ce am ales lifecycle 'running'/'stopped' (nu am filtrat sesiunile moarte)
Confirmă că ai citit §2.1 și explică-l cu cuvintele tale.

## startPolling/stopPolling — idempotență
Cum ai garantat că a doua chemare a lui startPolling() nu creează un al doilea timer, și că stopPolling() e sigur chiar dacă n-a pornit niciodată.

## unref() pe timer — decizia ta

## Extinderea wrapper-ului de close()
Confirmă că ai extins wrapper-ul existent, nu ai creat altul.

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Riscuri pentru tester

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 6. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „funcționează".
- Nu delega. Română, în cod și raport.

### Citește înainte

1. `server.js` — `readAgents()` (mecanismul exact de citire a sesiunilor, NU-l reinventa), wrapper-ul de `close()` de la RF-02c
2. `runs.js` — `observeRun`, ca să știi exact ce parametri așteaptă
3. `spec.md` §4 (axele de stare — DOAR lifecycle e relevant aici) și §5 (secțiunea Claude Code)
4. `docs/DECISIONS.md` — I26, I38 (asocierea rămâne manuală, nu ghicim)
