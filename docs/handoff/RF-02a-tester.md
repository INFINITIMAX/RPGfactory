# RF-02a — brief tester: fundația de stocare

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu modifici codul de producție.**

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. `plan.md` este înlocuit — nu îl cita.

---

## 1. Sarcina

Coder-ul a livrat `db.js` (deschidere + migrații) și `migrations/001-profiluri.sql` (trei tabele). Scrii testele.

Un fișier nou: `test/db.test.mjs`. Nu atinge niciun test existent — RF-02a nu modifică nimic din ce exista.

### Ce s-a verificat deja, ca să nu duplici inutil

Planner-ul a rulat un oracol independent, scris împotriva contractului din brief-ul coder-ului. **7 din 7 sonde trec.** Rezultate măsurate, pe care le poți lua ca date, nu ca presupuneri:

- `require('./db.js')` nu creează nicio bază de date
- prima deschidere aplică `001-profiluri.sql`; a doua nu mai aplică nimic
- o migrație aplicată și apoi editată **oprește pornirea**, cu eroare explicită
- o migrație care eșuează la mijloc face rollback — tabelul parțial nu rămâne
- pe fișier: `journal_mode=wal`, `foreign_keys=1`, `busy_timeout=5000`
- `:memory:` se deschide și se interoghează
- inserarea unei configurații către un profil inexistent e respinsă de cheia străină

Testele tale trebuie să acopere aceleași lucruri **în mod repetabil, ca parte din suită** — oracolul e o probă unică a planner-ului, nu o plasă permanentă. Dar nu trebuie să redescoperi dacă funcționează: știi că da. Concentrează-te pe a le fixa durabil și pe ce oracolul **nu** a acoperit.

---

## 2. Ce trebuie acoperit

### 2.1 Contractul `openDatabase`

- toate opțiunile injectabile funcționează: `path`, `migrationsDir`, `now`
- implicitele sunt cele din contract
- `appliedMigrations()` întoarce numele în ordine crescătoare
- `close()` chiar închide — o interogare după `close()` trebuie să eșueze
- handle-ul `db` expus e utilizabil pentru interogări

### 2.2 Mecanica migrațiilor

Construiește-ți propriile directoare de migrații temporare, cu fișiere sintetice. Nu te baza doar pe `001-profiluri.sql` real — ai nevoie de control asupra conținutului.

| Caz | Ce trebuie dovedit |
|---|---|
| Ordine | `003` se aplică după `001`, indiferent de ordinea din director |
| O singură dată | a doua deschidere nu reaplică nimic; `schema_migrations` are exact un rând per migrație |
| Digest schimbat | editarea unei migrații **aplicate** aruncă, cu mesaj care numește fișierul |
| Digest neschimbat | o migrație aplicată, necitită greșit, nu produce fals pozitiv la redeschidere |
| Eșec la mijloc | rollback complet; nici tabelele create înainte de instrucțiunea care crapă nu rămân |
| Eșec parțial + reluare | după ce repari migrația stricată, redeschiderea o aplică corect |
| Numere lipsă | `001` și `003` fără `002` — se aplică ambele, fără eroare (decizie deliberată a coder-ului) |
| Director inexistent | `migrationsDir` care nu există → zero migrații, fără excepție |
| Director gol | zero migrații, fără excepție |

### 2.3 Două capcane pe care planner-ul le-a găsit în cod

Nu sunt bug-uri confirmate. Sunt comportamente pe care trebuie să le **fixezi prin test**, ca să fie decizii explicite, nu accidente.

**Prima — fișiere ignorate tăcut.** `MIGRATION_NAME_RE = /^\d{3}-.+\.sql$/`. Un fișier numit `1-profiluri.sql`, `001_profiluri.sql` sau `001-profiluri.SQL` **nu se potrivește** și e sărit fără niciun semnal. Cineva adaugă o migrație, aplicația pornește normal, iar migrația nu rulează niciodată.

Scrie teste care pinuiesc exact ce se ignoră. Dacă ți se pare că ar trebui să facă zgomot în loc să tacă, **spune în raport** — nu schimba codul.

**A doua — tranzacții imbricate.** `applyMigrations` face `db.exec('BEGIN')` și apoi `db.exec(content)`. Dacă o migrație conține ea însăși `BEGIN` sau `COMMIT`, ce se întâmplă? Testează. Rezultatul e o constrângere reală pentru toate migrațiile viitoare: fie „migrațiile nu au voie să conțină instrucțiuni de tranzacție", fie altceva. Fixează-l prin test și consemnează în raport.

### 2.4 Schema — constrângerile chiar sunt impuse?

Nu presupune că o constrângere scrisă în SQL e și activă. Verifică fiecare:

- `approval_state` acceptă doar `proposed` și `approved`; orice altceva → eroare
- `assignable` acceptă doar `0` și `1`
- `NOT NULL` pe `id`, `name`, `created_at`, `updated_at`, `revision`
- cheia străină `configuration_versions.profile_id` → `agent_profiles(id)`: insert cu profil inexistent eșuează
- la fel pentru `profile_history.profile_id`
- `id` duplicat pe `agent_profiles` → eșuează (cheie primară)

### 2.5 Contracte de pinuit (decizii, nu bug-uri)

Coder-ul a luat aceste decizii singur. Fixează-le prin test, ca o schimbare viitoare accidentală să fie prinsă:

- **`assignable` implicit `0`** — un profil nou **nu** poate primi taskuri până nu e făcut explicit eligibil. Coerent cu `approval_state` implicit `proposed`.
- **`approval_state` implicit `proposed`** — I26: planner-ul propune, Lucian aprobă.
- **Ștergerea e restricționată.** Cheile străine nu au `ON DELETE`, deci implicit e `NO ACTION`. Un profil care are configurații sau istoric **nu poate fi șters**. Verifică asta explicit — e coerent cu `AGENTS.md` („dovezile vechi nu se rescriu"), dar trebuie să fie o alegere vizibilă.
- **`profile_history` e append-only prin folosire, nu prin constrângere.** Nimic din schemă nu împiedică un `UPDATE` sau `DELETE`. Pinuiește starea actuală și notează în raport dacă crezi că ar trebui impusă.
- **`configuration_versions` nu are `revision`** — e imutabilă prin intenție (I39). Dar nimic nu împiedică un `UPDATE`. Aceeași observație.

### 2.6 Persistență și concurență

- Scrie un profil, închide baza, redeschide-o: profilul e acolo, cu toate câmpurile intacte. (Oracolul planner-ului **nu** a putut acoperi asta — sonda nu cunoștea coloanele obligatorii. E golul cel mai important de umplut.)
- `revision` ca verificare optimistă: `UPDATE ... SET revision = revision + 1 WHERE id = ? AND revision = ?` — dovedește că un al doilea scriitor care deține revizia veche **nu** reușește actualizarea. E același contract ca la D5/D7 din RF-01, acum la nivel de bază de date.
- Două handle-uri deschise simultan pe același fișier: o scriere din primul e vizibilă din al doilea după commit.

### 2.7 `:memory:`

- funcționează pentru tot ce e mai sus, cu excepția WAL
- pe `:memory:`, `journal_mode` **nu** e `wal` — pinuiește ce este efectiv
- două baze `:memory:` distincte nu împart date

---

## 3. Fișiere

**Poți crea:** `test/db.test.mjs`, fixtures sub `test/fixtures/` dacă ai nevoie.

**NU atinge:** `db.js`, `migrations/**` — dacă găsești un bug, **îl raportezi, nu îl repari**. Nici `server.js`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare. Nu atinge niciun test existent.

---

## 4. Reguli de calitate

Aceleași ca la RF-01, plus una nouă specifică bazelor de date:

- **Fiecare test își face propria bază**, într-un director temporar sau `:memory:`. Zero stare împărtășită între teste.
- **Curăță după tine** — directoarele temporare se șterg în `after`. Atenție: WAL lasă și `.db-wal` și `.db-shm` lângă fișier.
- **Fără aserțiuni tautologice.** Verifică datele, nu că o funcție a fost apelată.
- **Fără dependență de ordinea testelor.** Reviewer-ul RF-01 a semnalat exact asta ca risc în `test/state.test.mjs` (constatarea C2) — nu repeta greșeala într-un fișier nou.
- Teste negative **și** pozitive: că lucrul greșit e respins, dar și că lucrul corect merge.

---

## 5. Raportul

`docs/handoff/RF-02a-tester-raport.md`:

```
## Ce am acoperit
Pe secțiune (2.1–2.7): ce test, ce dovedește.

## Cele două capcane din §2.3
Ce am descoperit efectiv despre fișierele ignorate tăcut și despre
tranzacțiile imbricate. Ce am pinuit.

## Contractele pinuite din §2.5

## Ce am găsit și nu am putut repara
Bug-uri în db.js sau în migrație. NU le repari. Le descrii.

## Ce nu am putut testa

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

---

## 6. Constrângeri

- **Nu rulezi comenzi.** Planner-ul rulează suita.
- **Nu poți afirma că testele trec.** Scrie „am scris un test care verifică X", niciodată „X trece".
- **Nu modifici codul de producție.**
- **Nu delega.**
- **Limbă:** română.

### Citește înainte

1. `db.js` și `migrations/001-profiluri.sql` — integral
2. `docs/handoff/RF-02a-coder.md` — contractele cerute
3. `docs/handoff/RF-02a-coder-raport.md` — deciziile coder-ului și riscurile pe care le semnalează el
4. `test/state-store.test.mjs` — ca model de stil pentru teste pe stratul de stocare
