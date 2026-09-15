# RF-02a — brief coder: fundația de stocare

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-02a — modul de bază de date, migrații versionate, prima schemă.
**Autorizat:** gate G4b, aprobat de Lucian 15-09-2026.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. `plan.md` este înlocuit — nu îl cita.

---

## 1. Sarcina

Construiești stratul de stocare pe care se vor așeza toate loturile următoare. Nimic din el nu se conectează încă la server — RF-02a livrează fundația și testele ei, atât.

Trei livrabile:

1. **`db.js`** — deschide baza de date, aplică migrațiile în ordine, întoarce un handle. Complet injectabil.
2. **Mecanismul de migrații** — fișiere numerotate, aplicate o singură dată, urmărite într-un tabel propriu.
3. **Prima migrație** — tabelele pentru profiluri de agenți și configurațiile lor versionate.

### Ce s-a verificat deja pe mașina utilizatorului

Nu presupune, sunt măsurate de planner pe Node v24.19.0:

- `node:sqlite` se importă **fără flag** și **fără avertisment experimental**
- exportă `DatabaseSync`, `StatementSync`, `Session`, `backup`, `constants`
- `BEGIN`/`ROLLBACK` funcționează
- `PRAGMA foreign_keys` e **deja `1`** implicit — dar setează-l explicit oricum, ca să nu depindem de un implicit care se poate schimba

**Nu adăuga nicio dependență npm.** `node:sqlite` e în Node.

---

## 2. Contractele

Decizii de planner. Nu le schimba — tester-ul scrie pe baza lor. Dacă vreuna ți se pare greșită, implementeaz-o și spune în raport.

### 2.1 `db.js` — API-ul modulului

```js
function openDatabase(options = {}) -> {
  db,                    // handle-ul DatabaseSync brut, pentru interogări
  close(),               // închide curat
  appliedMigrations(),   // -> string[], numele migrațiilor aplicate, în ordine
}

module.exports = { openDatabase, MIGRATIONS_DIR };
```

`options`:

| Opțiune | Implicit | Rol |
|---|---|---|
| `path` | `path.join(__dirname, 'data', 'rpgfactory.db')` | Fișierul bazei. `':memory:'` e valid — testele îl folosesc. |
| `migrationsDir` | `path.join(__dirname, 'migrations')` | De unde se citesc migrațiile. |
| `now` | `() => Date.now()` | Ceas injectabil. |

`openDatabase` trebuie să:

1. creeze directorul părinte al fișierului dacă lipsește (nu și pentru `:memory:`);
2. deschidă baza;
3. seteze pragmele (mai jos);
4. aplice migrațiile neaplicate, în ordine, **fiecare într-o tranzacție**;
5. întoarcă handle-ul.

**Importul modulului nu deschide nimic.** Aceeași regulă ca la RF-01: fără efecte secundare la `require`.

### 2.2 Pragme

- `foreign_keys = ON` — explicit, chiar dacă e deja implicit.
- `journal_mode = WAL` — **numai pentru bazele pe fișier.** Pe `:memory:` nu are sens; nu încerca și nu trata eșecul ca eroare.
- `busy_timeout = 5000` — două procese care scriu simultan așteaptă, nu eșuează imediat.
- `synchronous = NORMAL` — potrivit cu WAL pentru o aplicație locală.

Citește înapoi `journal_mode` după ce l-ai setat și consemnează valoarea reală în raport. SQLite poate refuza tăcut WAL în anumite situații.

### 2.3 Migrațiile

Fișiere în `migrations/`, numite `NNN-descriere.sql`, cu `NNN` trei cifre: `001-profiluri.sql`.

Reguli:

- se aplică în ordinea numerică a numelui, crescător;
- fiecare, o singură dată, vreodată;
- fiecare, într-o tranzacție proprie — dacă eșuează la mijloc, nu lasă baza pe jumătate migrată;
- evidența în tabelul `schema_migrations`: numele fișierului, când s-a aplicat, și un digest al conținutului.

**Digestul contează.** Dacă o migrație deja aplicată are acum alt conținut decât când s-a aplicat, `openDatabase` trebuie să **eșueze cu o eroare explicită**, nu să continue tăcut. Cineva a editat o migrație aplicată, iar baza nu mai corespunde cu fișierele. E o eroare de dezvoltare care trebuie să facă zgomot.

Migrațiile lipsă din mijloc (001 și 003 există, 002 nu) — decide cum tratezi și justifică în raport.

### 2.4 Prima migrație — `001-profiluri.sql`

Acoperă doar profilurile și configurațiile. Restul entităților din `spec.md` §3 vin în loturile lor, prin migrații ulterioare. **Nu le crea acum** — mecanismul de migrații există tocmai ca schema să crească.

Cerințele vin din deciziile de interviu; le enumăr ca să nu le deduci greșit.

**`agent_profiles`**

| Aspect | Cerință | De ce |
|---|---|---|
| Identitate | ID stabil, generat de aplicație, nu de utilizator | I38: profil ≠ sesiune ≠ proces. Un PID sau un nume nu e identitate. |
| Nume | Etichetă editabilă, **nu** cheie de identitate | I27: se poate redenumi fără să-și piardă istoricul |
| Specializare principală | Text, editabil | I10, I27 |
| Stare de aprobare | `proposed` sau `approved` | I26: planner-ul propune, Lucian aprobă |
| Eligibilitate | Poate primi taskuri noi: da/nu | I27: retragerea din repartizări viitoare e distinctă de oprirea muncii curente |
| Ultim proiect / ultim post | Opțional | I25, I35 |
| Timestamps | Creat, actualizat | |
| Revizie | Contor monoton pentru scrieri concurente | Aceeași lecție ca D7 din RF-01 — nu folosi ceasul |

**`configuration_versions`**

| Aspect | Cerință | De ce |
|---|---|---|
| ID versiune | Imutabil | I39: schimbarea modelului păstrează identitatea, dar versionează configurația |
| Profil | Cheie străină către `agent_profiles` | |
| Harness, provider, model | Text | |
| Referințe/digesturi | Pentru instrucțiuni, skill-uri, memorie | |
| Creat la | Timestamp | |

**Interdicție absolută, scrie-o ca și comentariu în migrație:** aici **nu** se stochează secrete, conținut de `.env`, tokenuri de autentificare, configurații globale integrale sau prompturi brute. Numai referințe și digesturi.

**`profile_history`**

Istoric al modificărilor de profil: ce s-a schimbat, când, de la ce la ce. I27 și I35 cer să se vadă evoluția, iar `AGENTS.md` cere ca dovezile vechi să nu fie rescrise.

**Competențe și niveluri:** nu crea tabel acum. Evaluarea e RF-LATER (I16, I28). Dar nu proiecta nimic care să facă adăugarea lor ulterioară dureroasă.

### 2.5 Reviziile și scrierile concurente

Aceeași lecție ca la RF-01: revizia e **contor monoton**, niciodată `Date.now()`.

Într-o bază SQLite ai un avantaj — poți incrementa în aceeași instrucțiune cu actualizarea, sub tranzacție. Folosește-l. Nu reimplementa coada de scriere din `state.js`; baza de date face treaba asta mai bine decât un lanț de promisiuni.

---

## 3. Ce NU face acest lot

Enumerate explicit, ca să nu extinzi lotul:

- **Nu conecta nimic la `server.js`.** Fără rute noi, fără API. RF-02b face asta.
- **Nu atinge `state.js` și nu migra `data/state.json`.** Migrarea datelor reale e gate separat, neacordat. Stocarea nouă se construiește **alături** de cea veche; ambele coexistă până când o migrare explicit aprobată le unește.
- **Nu crea tabele pentru** sesiuni, taskuri, evenimente, consum, alerte sau layout. Vin în loturile lor.
- **Nu scrie cod de citire din Pi sau Claude.** Ăla e RF-03.

---

## 4. Fișiere

**Poți crea:** `db.js`, `migrations/001-profiluri.sql`, și module mici auxiliare doar dacă simplifică vizibil.

**Poți modifica:** `package.json` — **da, de data asta.** Adaugă scriptul de test sigur. Comanda verificată de planner e `node --test` din rădăcină. Atenție: `node --test test/` **eșuează** pe Node 24, încearcă să încarce directorul ca modul. Adaugă și `"engines": { "node": ">=24.0.0" }`, fiindcă `node:sqlite` fără flag cere asta.

**Poți modifica:** `.gitignore` — adaugă `*.db`, `*.db-wal`, `*.db-shm` dacă nu sunt deja acoperite de `data/`.

**NU atinge:** `server.js`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `test/**`, `data/`, `.env`, `assets/`, documentele de coordonare.

---

## 5. Raportul

`docs/handoff/RF-02a-coder-raport.md`:

```
## Ce am implementat
Modulul db, mecanismul de migrații, prima schemă.

## Schema, explicată
Pentru fiecare tabel: ce coloane, ce tipuri, ce constrângeri, și de ce.
Unde ai făcut o alegere care nu era dictată de brief, spune-o.

## journal_mode citit înapoi
Valoarea reală după setare, pe fișier.

## Decizii pe care le-am luat singur
Inclusiv: ce faci cu migrațiile lipsă din mijloc.

## Ce nu am făcut și de ce

## Riscuri pentru tester
Unde bănuiești că implementarea e cea mai fragilă.

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

---

## 6. Constrângeri

- **Nu rulezi comenzi.** Nici `node`, nici `npm`, nici `sqlite3`.
- **Nu scrii teste.**
- **Nu afirma că ceva „funcționează".** Poți spune „am implementat X astfel încât să satisfacă Y".
- **Nu delega.**
- Nu citi și nu reproduce `.env`, secrete sau conținut din `data/`.
- **Limbă:** română, în cod, în comentariile SQL și în raport.

### Citește înainte

1. `spec.md` §3 — modelul de date propus, ca să înțelegi unde se încadrează ce construiești
2. `state.js` — cum arată stratul de stocare actual, pe care **nu** îl înlocuiești încă
3. `docs/DECISIONS.md` — deciziile I23, I26, I27, I35, I38, I39, care dictează schema
4. `AGENTS.md` §„Siguranță și verificare" și §„Invariante de produs"
