# HANDOFF — RPGfactory

Document de continuitate pentru proiect. Scris ca orice sesiune nouă (om sau agent) să poată prelua lucrul fără să reparcurgă toată conversația care a dus aici. Actualizează-l la finalul fiecărei sesiuni de lucru semnificative — nu doar la închiderea unui task.

## 1. Ce este proiectul

Un vizualizator local, 2D, pentru agenții reali de coding ai lui Lucian (Claude Code, ulterior alte harness-uri — deocamdată exclus explicit). Rulează la `http://localhost:5311`, citește sesiunile live din `~/.claude/sessions/*.json` și `~/.claude/projects/.../*.jsonl`, și le desenează ca muncitori pe o hartă medievală (Tiny Swords), fiecare proiect cu zona lui.

**Scop declarat**: „mă laud cu el" — produs terminat, arătos, de arătat public (LinkedIn etc.), nu experiment intern.

**A ÎNLOCUIT complet fabricaAI** (vechiul joc de birou, șters definitiv de Lucian) — dacă se mai lucrează vreodată la fabricaAI, se pornește tot de aici, nu separat.

## 2. Ce avem acum (stare verificată, nu presupusă)

Rulează `node --test` din `D:\RPGfactory` înainte de a crede orice — la ultima verificare (T-19): **205 teste, 0 eșecuri**.

### Funcțional (bifat în `intent.md`)
- Citire sesiuni Claude Code live (poziție, status, pid) — T-01
- Rang din model (Fleet Admiral/Captain/Cadet) — T-02
- Click pe agent → deschide sesiunea în Claude Code (`claude://resume?session=...`) — T-03
- Sprite real, animație idle — T-04 (Pawn, Tiny Swords, varianta Blue)
- Stare reală working/waiting/sleeping (algoritm `awaitingReply` portat exact din bot-crossing) — T-05
- Arhivare/ascundere agent, persistată local, merge pe 3 căi la conflict — T-06 + T-07
- Layout de zone per proiect, stabil la scară (alocare pe grilă pătrată, portată din hexagoanele bot-crossing) — T-08 + T-09 + T-10
- Mișcare reală: spawn → merge spre zonă → stă → pleacă (mașină de stare, sprite de alergare) — T-11
- Cameră: zoom (implicit 2x) + pan, spawn point în centrul hărții — T-12 + T-15
- Fundal: doar iarbă peste tot (fără apă/cer/nori — eliminate la T-15), independent de zone/agenți
- Turn (Tiny Swords) în centrul hărții, la spawn point — T-15
- Decorații de zonă: tufe animate, stânci statice — T-14 + T-14b
- Zone tematice: pădure (jos-dreapta, tăiat lemne) + aur (sus-dreapta, minat) — legate de cadranul geografic al celulei unui proiect, nu de proiect specific — T-17 + T-17b
- Celula `(0,0)` (turn/spawn) rezervată, exclusă din alocarea de zone — portat din `SHIP_CELL` (bot-crossing) — T-16 + T-16b
- Meniu de acțiuni per agent: Open, **New session**, **Reveal in folder**, Hide — panou stilizat cu assets Tiny Swords (hârtie + butoane) — T-18
- **Validare Host/Origin pe server** (anti-DNS-rebinding + CSRF) — portat din `isLocalRequest` (bot-crossing) — T-19

### Structura tehnică
- `server.js` — Node HTTP nativ, fără framework. Rute: `/api/agents`, `/api/open`, `/api/reveal`, `/api/new-session`, `/api/state` (GET/PUT), plus servire statică din `public/`.
- `rank.js`, `status.js`, `state.js` — module server, fiecare cu propriile teste.
- `public/zones.js`, `public/merge-state.js` — scripturi clasice (fără module ES), încărcate și în browser și în teste (via `node:vm`).
- `public/app.js` — frontend-ul, un singur fișier mare, canvas 2D, fără framework.
- `test/*.test.mjs` — 8 fișiere, 205 teste. `app.test.mjs` e cel mai mare (folosește `node:vm` pentru a încărca `app.js`/`zones.js`/`merge-state.js` într-un sandbox — vezi comentariul din capul fișierului pentru capcanele cunoscute: `let`/`const` la nivel de script NU devin proprietăți ale sandbox-ului, doar `function`; obiecte din realm-ul `vm` pot pica la `assert.deepEqual` cross-realm — comparați `.x`/`.y` individual).
- `docs/handoff/` — 103+ fișiere, brief + raport pentru fiecare task (T-01...T-19, plus follow-up-uri Xb pentru ripple-uri descoperite după livrare).
- `assets/` — sursele brute Tiny Swords, sub licență cu restricție de redistribuire, **nu intră în git**. `public/sprites/` și `public/ui/` (exporturile folosite efectiv de aplicație) sunt și ele excluse din git (vezi `.gitignore`) — trebuie recreate manual dintr-o clonă nouă (vezi secțiunea 5).

### Repo
Public, `https://github.com/INFINITIMAX/RPGfactory` (cont `INFINITIMAX`). Commit + push **după fiecare task închis**, nu doar la final de sesiune — regulă permanentă, confirmată de Lucian.

## 3. Ce vrem să avem (viziunea completă)

**Paritate REALĂ cu bot-crossing** — nu doar aceleași date, ci aceeași funcționalitate, aceeași interpretare vizuală, agenți care se mișcă similar cu originalul, doar în **2D** (nu 3D, pentru claritate — bot-crossing e 3D/hex, noi suntem 2D/pătrat).

**După** ce paritatea e completă (nu în paralel, nu înainte — decizie explicită a lui Lucian): un **strat suplimentar, al nostru**, care nu există în bot-crossing — hiperspecializare pe agent: specializare (ce fel de task face), nivel care crește din knowledge persistent încărcat agentului. Rangul (Fleet Admiral/Captain/Cadet, din model) e deja făcut (T-02) ca parte timpurie a acestui strat, restul așteaptă.

## 4. Ce vrem să facem (lista rămasă, din `intent.md`)

Necompletate, în ordinea probabilă de atac (nu obligatorie — discută cu Lucian ordinea, cum s-a făcut la fiecare rundă anterioară A→B→C):

1. **Indicator „?" dedicat** pentru „are nevoie de tine" (separat de punctul de culoare de status) + **`viewedAt`** (marchezi ca „văzut", stinge indicatorul) — pereche mică, coerentă.
2. **`hiddenProjects`** — ascunde tot proiectul dintr-o dată, nu doar agenți individuali (extinde Hide-ul existent de la T-07).
3. **Dezambiguizare proiecte** cu nume de folder identic (`disambiguateProjects`).
4. **`sărbătorește`** (PR merged) — cel mai mare rămas, necesită integrare git/GitHub reală (verifică întâi cum face bot-crossing, la fel ca la toate task-urile de până acum — cod-ul lor probabil detectează merge-ul unui PR prin polling la API-ul GitHub sau printr-un hook local; nu presupune, citește).

**Explicit excluse/amânate, nu goluri de rezolvat**:
- `blocat` — nici bot-crossing nu-l rezolvă pentru CLI (doar pentru desktop app, la care n-avem acces). Ar necesita heuristic propriu, amânat explicit de Lucian.
- Alte harness-uri (Codex, Cursor...) — exclus explicit.

**După tot ce e deasupra**: stratul de hiperspecializare (secțiunea 3).

## 5. Cum continuăm de aici — disciplina de lucru (NU se schimbă fără acordul lui Lucian)

### 5.1 Referință activă la bot-crossing, înainte de orice brief
Bot-crossing e clonat local la `/tmp/claude/bot-crossing-trial` (WSL/git-bash path — accesibil din Bash, NU din Read/Windows paths). **Înainte de a scrie orice brief pentru ceva ce bot-crossing rezolvă deja** (parsare, cache, mecanism de securitate, deep link, orice), citește codul lor relevant efectiv — nu ghici structura, nu reconstitui din memorie ce ai citit acum două sesiuni. Fișierele relevante găsite până acum:
- `server/api.mjs` — endpoint-uri, `isLocalRequest` (Host/Origin), `resolveFolder`, `launch`/`present` (opener OS).
- `server/harnesses/claude-code.mjs` — `openThread`/`newSession`, deep link-uri `claude://...`.
- `src/world/plots.js` — alocarea de zone hexagonale, `SHIP_CELL` (celulă rezervată).

Dacă un task nou atinge o zonă din bot-crossing nemenționată aici, caut-o din nou cu `grep -rn` în `/tmp/claude/bot-crossing-trial/server` și `/src`, nu presupune că nu există.

### 5.2 Fluxul de 4 agenți — pentru orice task cornerstone
Planner scrie brief pe disc (`docs/handoff/T-XX-coder.md`), lansează coder (Agent tool, `subagent_type: "coder"`), verifică raportul + codul propriu-zis (nu doar raportul — citește fișierul modificat), scrie brief tester (`docs/handoff/T-XX-tester.md`), lansează tester, **rulează efectiv suita de teste** (`node --test` din `D:\RPGfactory`, planner e singurul care rulează comenzi), lansează reviewer cu context complet (ce s-a verificat deja, ce să verifice specific), transcrie verdictul VERBATIM în `docs/handoff/T-XX-reviewer-raport.md` + decizia planner-ului la final, actualizează `intent.md`, **commit + push**.

### 5.3 Ripple-uri — un tipar recurent de reținut
Aproape fiecare task de fundație (T-12, T-14b, T-15, T-16, T-17) a produs efecte secundare neprevăzute în teste PREEXISTENTE, scrise pentru un comportament anterior. Tiparul de rezolvare, deja rodat:
1. Planner rulează suita completă DUPĂ ce tester-ul predă — nu presupune că "testele noi trec" înseamnă "suita întreagă trece".
2. Dacă apar eșecuri în teste vechi: diagnostichează cauza EXACT (de obicei cu un `node -e` + `vm` de reproducere, sau citind codul direct) înainte de a decide cine repară.
3. **Regulă de proces** (rafinată de-a lungul T-07→T-16): o reparație mecanică, fără nicio decizie de design/interpretare (index greșit, obiect cross-realm la `assert`, buclă care nu golește un array, header lipsă adăugat uniform) → planner repară direct. O reparație care cere raționament nou (calcul de timing/geometrie, alegere între comportamente plauzibile, redesign de scenariu de test) → task separat, gen `T-XXb`, la tester sau coder, chiar dacă diagnosticul complet a fost deja făcut de planner.
4. Reviewer verifică ÎNTOTDEAUNA și reparațiile directe ale planner-ului, nu doar livrarea coder/tester.

### 5.4 Asset-uri Tiny Swords
Sursă: `assets/raw/Tiny Swords (Free Pack)/...` (licență custom, gratuit, uz comercial ok, **fără redistribuire** — nu intră în git nici brut, nici exportat). Când ai nevoie de un asset nou: caută-l în `assets/raw` (structură pe categorii: `Units/<Culoare> Units/Pawn/`, `Terrain/Resources/<Wood|Gold|Meat>/`, `Buildings/<Culoare> Buildings/`, `UI Elements/UI Elements/<Papers|Buttons|...>`), copiază-l în `public/sprites/` (joc) sau `public/ui/` (interfață) cu un nume descriptiv, verifică vizual cu Read tool înainte de a-l folosi (dimensiuni, e sprite sheet sau imagine unică). Culoarea activă e **Blue** (pawn, turn) — păstrează consistența dacă adaugi alte unități/clădiri, doar dacă Lucian nu cere altă culoare explicit.

**Important**: `public/sprites/` și `public/ui/` sunt în `.gitignore` — dacă cineva clonează repo-ul de pe GitHub, aceste foldere lipsesc și aplicația nu are sprite-uri. Nu există încă un script de export automat — fiecare asset a fost copiat manual (`cp`) de planner, pe măsură ce a fost nevoie. Dacă se reia proiectul de la o clonă nouă, trebuie refăcută manual copierea (vezi rapoartele T-04/T-13/T-14/T-15/T-17/T-18 pentru lista exactă de fișiere sursă → destinație).

### 5.5 Implicarea lui Lucian
Lucian vrea să fie implicat în toate deciziile de arhitectură, cu explicații, nu doar rezultate — nu se decide tacit. Când apare o ambiguitate reală de design (nu doar o alegere mecanică), întreabă înainte de a scrie brief-ul, cum s-a făcut la ordinea A→B→C sau la alegerea culorii pachetului Tiny Swords.

## 6. Cum pornești serverul local

```
cd D:\RPGfactory
node --env-file=.env server.js
```
Ascultă pe portul din `.env`/`PORT` (implicit 5311). Dacă un server vechi rulează deja cu cod stale (schimbări în `server.js` nu se aplică fără restart), găsește-l cu `Get-CimInstance Win32_Process -Filter "name='node.exe'"` și oprește-l înainte de restart.

## 7. Fișiere-cheie de citit, în ordine, la începutul unei sesiuni noi

1. Acest fișier (`HANDOFF.md`).
2. `intent.md` — checklist-ul viu, sursa de adevăr pentru ce e bifat.
3. Ultimele 2-3 `docs/handoff/T-XX-reviewer-raport.md` (cele mai recente task-uri) — ca să știi exact ce s-a decis ultima dată și de ce.
4. `git log --oneline` — confirmă ce a ajuns efectiv pe GitHub (uneori diferă de ce crezi că s-a închis, dacă o sesiune s-a întrerupt înainte de push).
