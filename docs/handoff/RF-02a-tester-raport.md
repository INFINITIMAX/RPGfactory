# RF-02a — raport tester

Fișier nou: `test/db.test.mjs`. Nu am atins niciun test existent, nici `db.js`, nici `migrations/**`.

## Ce am acoperit

**2.1 Contractul `openDatabase`**
- `MIGRATIONS_DIR` exportat e o cale absolută care se termină în `migrations` — pin al implicitului, fără să deschid nicio bază.
- `now` implicit produce un `applied_at` plauzibil (între `Date.now()` înainte și după apel); `now` injectat e folosit exact (`424242`), nu ignorat.
- `appliedMigrations()` în ordine crescătoare, cu fișiere create pe disc în altă ordine.
- `close()` chiar închide — o interogare ulterioară pe `db` aruncă.
- handle-ul `db` e utilizabil direct (`SELECT 1`).

Nu am testat implicitul pentru `path` (`data/rpgfactory.db`) — l-aș fi putut invoca doar deschizând efectiv acel fișier real, ceea ce intră în conflict cu interdicția explicită de a atinge `data/` din brief. Vezi „Ce nu am putut testa”.

**2.2 Mecanica migrațiilor** — toate cele nouă cazuri din tabelul brief-ului, fiecare cu directorul lui de migrații sintetic, temporar:
ordine, o singură dată (număr de rânduri în `schema_migrations`), digest schimbat (eroare care numește fișierul), digest neschimbat (fără fals pozitiv), eșec la mijloc (rollback complet, verificat cu o conexiune brută independentă pe același fișier, fiindcă `openDatabase` aruncă înainte să întoarcă handle-ul), eșec parțial + reluare după reparare, numere lipsă (001/003 fără 002), `migrationsDir` inexistent, director gol.

**2.3 Cele două capcane** — detaliate mai jos.

**2.4 Constrângerile schemei** — folosind migrația reală `001-profiluri.sql` (doar citită, migrationsDir implicit) pe bază `:memory:`: `approval_state` (CHECK), `assignable` (CHECK), `NOT NULL` pe `id`/`name`/`created_at`/`updated_at` (omiterea coloanei), `NOT NULL` pe `revision` (are `DEFAULT`, deci am testat separat: omiterea coloanei e validă, dar `NULL` explicit e respins), FK `configuration_versions.profile_id`, FK `profile_history.profile_id`, PK duplicat pe `agent_profiles.id`.

**2.5 Contractele pinuite** — detaliate mai jos.

**2.6 Persistență și concurență**
- Scriere completă (toate coloanele, inclusiv `last_project`/`last_post` opționale), `close()`, redeschidere pe același fișier: rândul e acolo, câmp cu câmp.
- Verificare optimistă pe `revision`: primul `UPDATE ... WHERE id=? AND revision=?` cu revizia corectă reușește (`changes===1`, revizia avansează la 2); al doilea, cu revizia veche (1), nu modifică nimic (`changes===0`), iar starea rămasă e cea din prima scriere, nu un amestec.
- Două handle-uri deschise simultan pe același fișier: o scriere simplă (autocommit) din primul e vizibilă din al doilea.

**2.7 `:memory:`**
- `journal_mode` pe `:memory:` e efectiv `memory`, nu `wal` — pinuit explicit, nu doar „diferit de wal”.
- Două baze `:memory:` distincte nu împart date.
- Migrații + interogări funcționează identic ca pe fișier.

## Cele două capcane din §2.3

**Fișiere ignorate tăcut.** Am confirmat prin test: `1-profiluri.sql`, `001_profiluri.sql`, `001-profiluri.SQL`, puse într-un director de migrații alături de conținut SQL valid și distinct fiecare, sunt sărite complet — `appliedMigrations()` întoarce listă goală și niciunul din tabelele lor nu apare pe disc. Nu apare nicio eroare, niciun avertisment. Am pinuit exact acest comportament, nu l-am modificat.

Părerea mea: ar trebui să facă zgomot, nu să tacă. E ușor ca cineva să adauge `002-ceva.sql` cu o greșeală de convenție de nume (ex. uită liniuța, sau pune extensia cu majusculă pe Windows unde nu contează la copiere) și aplicația pornește curat, fără nicio migrație lipsă vizibilă — bug-ul apare mult mai târziu, ca „coloană lipsă”, departe de cauză. Nu am schimbat codul; las decizia planner-ului.

**Tranzacții imbricate.** Am testat două variante de conținut de migrație care își fac singure `BEGIN`/`COMMIT`, peste `BEGIN`/`COMMIT` pus deja de `applyMigrations`:

1. Conținut cu `BEGIN` propriu, fără `COMMIT` propriu: SQLite refuză imediat tranzacția imbricată, execuția se oprește înainte de orice `CREATE TABLE`, `catch()` face `ROLLBACK` cu succes (tranzacția exterioară era încă activă) și `openDatabase` aruncă. Rezultat: comportament „sigur”, echivalent cu un eșec normal la mijloc — nimic nu persistă. Am pinuit asta.

2. Conținut cu `COMMIT` propriu (fără `BEGIN` propriu, deci încheie tranzacția exterioară): `CREATE TABLE` din conținut rulează și e commis de `COMMIT`-ul din fișier. Apoi `recordApplied.run(...)` din `applyMigrations` se execută în regim autocommit (nicio tranzacție activă) și reușește, deci și rândul din `schema_migrations` e commis. Abia după aceea `db.exec('COMMIT')` din `applyMigrations` eșuează, fiindcă nu mai există nicio tranzacție de închis — **aceasta** e excepția care iese din `openDatabase` și oprește pornirea aplicației.

   Am testat și pinuit exact acest rezultat cu o conexiune brută, independentă, deschisă direct pe fișierul de bază după ce `openDatabase` a aruncat: **tabelul creat de migrație și rândul din `schema_migrations` sunt amândouă pe disc**, deși apelantul a primit o excepție care semnalează eșec. Asta e o **inconsistență reală**, nu doar un „e o alegere”: aplicația crede că migrația a eșuat (pornirea se oprește), dar de fapt a fost aplicată integral și marcată ca atare. La o repornire ulterioară, `applyMigrations` va vedea fișierul deja în `schema_migrations` cu digestul corect și îl va sări tăcut — deci nu se re-corupe nimic la reluare, dar prima rulare a mințit despre ce s-a întâmplat.

   Nu am reparat — am scris testul care demonstrează exact acest comportament, cu comentarii care explică mecanismul. Recomand planner-ului să decidă explicit constrângerea pentru viitor: „migrațiile nu au voie să conțină `BEGIN`/`COMMIT`/`ROLLBACK`” — și, ideal, o validare la citirea fișierului care respinge conținut cu aceste cuvinte cheie înainte de a-l executa, ca eroarea să apară înainte de orice scriere, nu după.

## Contractele pinuite din §2.5

- `assignable` implicit `0`, `approval_state` implicit `'proposed'`, `revision` implicit `1` — un `INSERT` care nu specifică deloc aceste coloane produce exact aceste valori.
- Ștergerea unui `agent_profiles` cu `configuration_versions` legate e respinsă de FK (fără `ON DELETE`, deci `RESTRICT` implicit) — testat, iar profilul rămâne pe loc după eșecul ștergerii.
- Aceeași restricție pentru `profile_history` legat.
- `profile_history`: am pinuit că **nu e** protejat nici de `UPDATE`, nici de `DELETE` la nivel de schemă — e append-only doar prin convenție de utilizare, nu prin constrângere SQL. Dacă viitor se adaugă un trigger care blochează asta, testul ăsta trebuie schimbat deliberat (nu accidental).
- `configuration_versions`: la fel, `UPDATE` pe un rând existent reușește fără eroare, deși intenția (I39) e imutabilitate.

Observația mea pe ultimele două: dacă imutabilitatea/append-only chiar contează pentru integritatea produsului (nu doar „nimeni n-o să scrie cod care face asta”), merită un `TRIGGER ... BEFORE UPDATE/DELETE ... RAISE(ABORT, ...)` explicit într-o migrație viitoare, nu doar disciplină de cod la nivelul aplicației. Nu e treaba testerului să decidă asta — doar semnalez, cum cere brief-ul.

## Ce am găsit și nu am putut repara

Inconsistența de la capcana „tranzacții imbricate cu COMMIT propriu” descrisă mai sus, în `migrations` (posibil vulnerabilă la orice migrație viitoare scrisă neatent) și în `applyMigrations` din `db.js` (nicio validare a conținutului înainte de execuție). Nu am modificat nici migrația, nici `db.js` — doar testul care demonstrează comportamentul.

## Ce nu am putut testat

- Implicitul pentru `options.path` (`path.join(__dirname, 'data', 'rpgfactory.db')`) — singurul mod de a-l invoca real e să chem `openDatabase()` fără `path`, ceea ce ar crea/modifica fișiere sub `data/` real al proiectului, explicit interzis în brief (§3: „NU atinge... `data/`”). Recomand planner-ului, dacă vrea acoperire aici, un test separat rulat izolat (ex. cu `cwd` mutat sau modulul încărcat dintr-o copie a proiectului într-un director temporar), nu în `test/db.test.mjs`.
- Comportamentul WAL real pe disc din punct de vedere al fișierelor `.db-wal`/`.db-shm` (că apar/dispar exact cum e documentat) — am verificat doar `journal_mode` citit înapoi prin `PRAGMA`, nu am inspectat prezența fizică a fișierelor auxiliare, fiindcă timpul lor de viață (checkpoint automat) nu e determinist din exteriorul SQLite fără control mai fin.
- Comportamentul la editarea unei migrații **neaplicate încă** (fișier modificat înainte de prima rulare) — nu e relevant pentru digest (nu există încă rând în `schema_migrations`), și brief-ul nu îl cere explicit; l-am omis ca fiind deja acoperit implicit de testele de „aplicare normală”.
- Nu am testat interacțiunea dintre eroarea de digest schimbat și o migrație ulterioară nealterată din același director (ex. 001 editat, 002 nou și valid) — brief-ul nu o cere explicit, dar dacă interesează planner-ul, comportamentul actual din cod e că verificarea de digest se face per-fișier în bucla `for`, deci 001 ar arunca înainte ca 002 să fie atins deloc.

## Contradicții găsite în brief

Niciuna.

## Comanda pentru planner

```
node --test
```
(din rădăcina `D:\RPGfactory`, conform `package.json`; testul nou e descoperit automat ca `test/db.test.mjs`.)
