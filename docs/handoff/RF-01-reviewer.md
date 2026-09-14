# RF-01 — brief reviewer (read-only)

**Data:** 15-09-2026, EET.
**Rol:** reviewer independent, read-only.
**Lot:** RF-01 — izolare server/teste + siguranță HTTP, static, input și salvare.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. `plan.md` este înlocuit — nu îl cita.

---

## 1. Sarcina

Verifici **și codul, și testele**. Nu unul, nu celălalt — ambele, plus relația dintre ele.

Lotul a trecut prin șase iterații de cod (RF-01, apoi corecțiile b–f) și trei de teste. Suita e verde. **Tocmai de asta ești tu aici:** o suită verde după șase runde de ajustări e exact situația în care se strecoară teste care au fost slăbite ca să treacă, sau cod rămas de la o variantă abandonată.

Cinci întrebări.

### Î1 — Testele chiar dovedesc ceva?

Pentru fiecare defect D1–D12 (lista completă în `docs/handoff/RF-01-oracol-baseline.md`), există o regresie. Verifică dacă e reală:

- Ar fi **eșuat** pe codul vechi? Un test care ar fi trecut și înainte de fix nu e regresie, e decor.
- Verifică **efectul**, sau doar că o funcție a fost apelată? Aserțiuni de tip `assert.ok(res)` nu dovedesc nimic.
- Verifică **produsul**, sau copiază brief-ul? Un test care afirmă că un mesaj de eroare are un anumit text nu dovedește că validarea funcționează.
- Există aserțiuni tautologice — care ar trece indiferent de cod?

Caz special de urmărit: în `test/state-store.test.mjs`, §3.2, contractul a fost **inversat** deliberat. Testul afirma inițial *prezența* unui bug (`unhandledRejection`); după reparație, afirmă absența lui plus sănătatea cozii. Inversarea e legitimă și documentată — dar verifică dacă noua formă chiar testează ceva, sau dacă a devenit un test care trece mereu.

### Î2 — Codul are părți inutile?

Șase iterații lasă urme. Caută:

- funcții, ramuri sau variabile rămase de la o variantă abandonată și nefolosite acum;
- abstracții introduse „pentru viitor", fără utilizator real;
- cod duplicat între `body.js`, `state.js` și `server/http-guards.js`;
- comentarii care descriu o implementare care nu mai există.

Brief-ul coder-ului cerea module auxiliare **doar dacă** simplifică vizibil responsabilitățile. Evaluează dacă `body.js` și `server/http-guards.js` își merită existența, sau dacă ar fi fost mai clar în `server.js`.

### Î3 — Contractele din brief au fost respectate?

Brief-ul coder-ului (`docs/handoff/RF-01-coder.md`, §2) fixa contracte exacte: forma lui `createServer`/`startServer`, opțiunile injectabile, regulile de origine, containment-ul static, tabelul de metode, plafonul de body, forma lui `createStateStore`, contractul CAS și schema.

Verifică-le pe rând în cod. Unde diferă, e o abatere justificată în raportul coder-ului sau o scăpare tăcută?

Atenție la contractul CAS (§2.7): `updatedAt` a devenit **contor monoton**, păstrând numele pentru ca `public/app.js` să nu se schimbe. Verifică dacă asta chiar ține — frontend-ul nu a fost atins, deci contractul HTTP trebuie să fie compatibil.

### Î4 — Suita e sigură pentru datele reale?

Ăsta era **scopul principal al lotului**. Înainte, `test/state.test.mjs` ștergea `data/state.json` real, iar testele API lansau `rundll32`.

Verifică în tot `test/`:
- mai există vreo scriere în `data/` real sau în `~/.claude`?
- mai poate vreun test să lanseze un proces?
- mai există porturi ficși (5311, 5391, 5392, 5393)?
- mai există monkey-patch pe `http.createServer`?
- fiecare test își curăță după el și poate rula independent de ordine?

`test/rank.test.mjs` și `test/status.test.mjs` construiesc căi sub `~/.claude/projects`. Planner-ul a verificat că folosesc un mock de `fs` și nu scriu nimic. **Confirmă independent** — e singurul loc unde o greșeală ar atinge date reale.

### Î5 — Ce NU acoperă lotul?

Verifică dacă limitările sunt consemnate onest, nu ascunse:

- limitarea cunoscută pe plafonul de body (clientul poate primi `ECONNRESET` în loc de `413` la body-uri mari trimise integral) — e documentată în cod și în rapoarte?
- politica symlink/junction pe containment-ul static — consemnată ca netestată?
- `readAgents`, `status.js`, `rank.js` — excluse explicit din lot (aparțin RF-03)?
- există undeva o afirmație că RF-01 repară ceva ce de fapt nu repară?

---

## 2. Contextul

RPG Factory e o consolă **locală, cu un singur utilizator**, care arată agenții reali din Pi și Claude Code ca pe o lume medievală 2D. Singurul client al serverului e propria pagină din `public/`.

Ține minte asta când evaluezi proporția: e un instrument personal, nu un serviciu public. Cod defensiv util, da; apărare împotriva unor atacatori care nu există, nu.

**Ce a produs lotul:**
- `server.js` rescris — factory fără efecte secundare, injecții, rutare pe `pathname`, verificare de metodă
- `state.js` rescris — store injectabil, schemă validată, CAS cu revizie monotonă
- `body.js` nou — citirea body-ului cu plafon
- `server/http-guards.js` nou — origine + containment static
- 6 fișiere de test: 3 rescrise, 3 noi

**Dovezi existente** (rulate de planner, nu de agenți):
- `docs/handoff/RF-01-oracol-baseline.md` — cele 12 defecte reproduse pe baseline **înainte** de fix
- oracol invers pe codul reparat: 12 din 13 sonde confirmă reparația; a 13-a e limitarea cunoscută de la Î5
- suita: **257 de teste**, rulată repetat

**Ordinea de citire recomandată:**
1. `docs/handoff/RF-01-oracol-baseline.md` — ce era stricat, cu măsurători
2. `docs/handoff/RF-01-coder.md` — contractele cerute
3. `docs/handoff/RF-01-coder-raport.md` — integral, toate secțiunile RF-01 → RF-01f
4. `docs/handoff/RF-01-tester.md` și raportul tester-ului
5. `server.js`, `state.js`, `body.js`, `server/http-guards.js`
6. `test/server.test.mjs`, `test/state.test.mjs`, `test/api-open.test.mjs`, `test/body.test.mjs`, `test/http-guards.test.mjs`, `test/state-store.test.mjs`

---

## 3. Rezultatul așteptat

Raport în **română**:

```
## VERDICT

APROBAT | APROBAT CU OBSERVAȚII | RESPINS

Într-o frază: de ce.

## CONSTATĂRI

### C1 — [titlu scurt]
Severitate: BLOCANT | MAJOR | MINOR
Fișier: <cale>:<linie>
Ce e: <ce ai observat, concret>
De ce contează: <consecința reală — ce se strică, sau ce nu se dovedește>
Ce ar trebui: <propunere concretă>

## RĂSPUNS PUNCTUAL

Î1 (testele dovedesc?): ...
Î2 (cod inutil?): ...
Î3 (contracte respectate?): ...
Î4 (suita e sigură?): ...
Î5 (limitări oneste?): ...

## CE AM VERIFICAT ȘI CE NU
```

Reguli:
- `BLOCANT` = lotul nu se poate închide. Folosește-l parcimonios și justifică-l.
- Fiecare constatare are fișier și locație.
- Dacă ceva e bine făcut, spune-o. Un review care găsește probleme peste tot ca să pară util e un review prost.
- Nu propune funcționalități noi de produs.
- Nu deschide loturile viitoare (RF-02+). Evaluezi ce e livrat aici.

---

## 4. Constrângeri dure

- **Read-only.** Nu ai unelte de scriere. Nu scrii niciun fișier, nici raportul — planner-ul îl transcrie integral.
- **Fără comenzi.** Nici `git`, nici `node`, nici teste. Dacă o verificare ar cere rulare, notează la „Neverificat" ce anume și de ce.
- **Nu delega.**
- **Limbă:** română.

### Interzis la citire

`.env`, `data/`, `assets/`, `public/sprites/`, `public/ui/`, orice din afara `D:/RPGfactory` (inclusiv `~/.claude`, `~/.pi`). Nu reproduce secrete sau conținut privat.

### Interzis în raport

- Nu declara vreun gate ca îndeplinit — sunt ale planner-ului și ale lui Lucian.
- Nu recomanda commit, push, instalări globale, migrări sau pornirea/oprirea vreunui serviciu.
