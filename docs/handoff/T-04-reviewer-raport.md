# T-04 — Raport reviewer

# Verdict: ACCEPT

Am citit toate cele 6 fișiere (brief coder, `app.js`, raport coder, brief tester, `test/app.test.mjs`, raport tester) și confirm implementarea din T-04, atât cod cât și teste.

## Codul coder-ului (`D:\RPGfactory\public\app.js`)

- Respectă strict scopul brief-ului: doar `draw()`, click handler-ul (fără modificări logice) și adăugarea buclei de animație/încărcării imaginii au fost atinse. `hashToCellIndex`, `cellIndexToPosition`, `colorForStatus`, `tick`, `renderDetails`, `openAgentSession` — neatinse, confirmat prin citire directă.
- Nicio diferențiere de rang/model, nicio dependență nouă, niciun alt sprite/culoare de facțiune introdus — exact ce cerea brief-ul ("ignoră `rank`/`model` din acest task").
- Fișierele interzise (`server.js`, `rank.js`, `.env*`, `.gitignore`, `assets/`, `README.md`) — neatinse.
- Logica e corectă: `pawnImageLoaded` blochează doar `drawImage`, nu și indicatorul de status/numele (linia 75-81 vs 83-97), exact cum cerea punctul 4 din brief.
- **Decizia despre `CIRCLE_RADIUS`**: nu e o coincidență nedocumentată. Coder-ul a verificat explicit relația (`CIRCLE_RADIUS=28` = jumătate din `SPRITE_DEST_SIZE=56`) și a explicat matematic de ce hit-test-ul rămâne valid, plus a adăugat un comentariu în cod (linia 10 din `app.js`) și a documentat clar în raport. E o verificare reală, nu o presupunere — acceptabil.
- Offset-ul numelui (`SPRITE_DEST_SIZE/2 + 14` = `28+14=42`, identic cu vechiul `CIRCLE_RADIUS+14`) e documentat corect ca schimbare echivalentă numeric, deci fără regresie vizuală.

## Testele tester-ului (`D:\RPGfactory\test\app.test.mjs`, secțiunea 6)

Toate cele 6 teste noi verifică comportament real, nu trec necondiționat:

1. **`drawImage` blocat înainte de încărcare** — ar pica dacă `draw()` ar ignora `pawnImageLoaded`.
2. **`drawImage` cu cadrul 0 după `onload`** — verifică exact `sx=0,sy=0,sw=192,sh=192`, nu aproximativ.
3. **Avansare ciclică 0-7** — verifică secvența exactă `[1,2,...,7,0,1,2]`, ar pica la orice bug de `% 8` sau la orice confuzie între cele două `setInterval`.
4. **Indicator de status** — verifică `arc`+`fill` cu poziție calculată dinamic din `hashToCellIndex`/`cellIndexToPosition` (nu hardcodată) și culoare reală din `colorForStatus`.
5. **Agent mort → niciun `arc`/`drawImage`** — **nu e redundant**: e primul test din întreaga suită care confirmă filtrul `if (!agent.alive) continue` pentru randare (testele T-01/02/03 nu acopereau cazul `alive=false`). Testează un caz real de regresie posibilă introdusă chiar de refactorizarea T-04.
6. **`strokeRect` la selecție** — coordonate calculate din poziția reală, nu ghicite.

**Distincția între cele două `setInterval`** (`ms < 1000` pentru animație vs. poll la 3000ms) e robustă, nu fragilă — nu depinde de ordinea de înregistrare a callback-urilor, ci de o proprietate semantică (valoarea `ms`), care e stabilă chiar dacă liniile din `app.js` s-ar reordona.

Nu am găsit teste redundante, aserțiuni slabe (`toBeDefined`-echivalent) sau cazuri importante omise fără motivare. Testele vechi (hit/miss pe click) rămân neschimbate și confirmă indirect că hit-test-ul n-a fost stricat.

## Concluzie

Cod: fără cod inutil, fără depășire de scop, decizie despre hit-test documentată corect (nu ascunde lipsă de verificare). Teste: solide, testează comportament, nu implementare, acoperă cazurile cerute explicit de brief. **ACCEPT** pentru ambele livrări.

---

## Decizia planner-ului

Accept ambele livrări. Toate 35 de teste trec (`node --test` din `D:\RPGfactory`). Verificat manual, live: serverul servește `public/sprites/pawn-idle.png` cu `Content-Type: image/png`, 200; pagina completă răspunde 200; `/api/agents` include în continuare `rank`/`model` corect.

T-04 e închis. Sprite-ul de muncitor (idle, 8 cadre) e acum vizual pentru toți agenții, fără diferențiere de clasă/rang — exact scopul cerut.
