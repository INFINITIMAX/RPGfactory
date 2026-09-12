# T-04 — Teste pentru sprite-ul animat de muncitor

## Sarcină

Extinde `test/app.test.mjs` (nu un fișier nou — mock-ul de `document`/`fetch`/`Image` de acolo trebuie oricum să reflecte codul curent din `app.js`) cu teste pentru comportamentul nou introdus la T-04. Vezi `docs/handoff/T-04-coder.md` și `docs/handoff/T-04-coder-raport.md` pentru context.

**Notă despre istoric**: planner a găsit și reparat deja două mici regresii ale mock-ului de test cauzate de T-04 (lipsea `Image` din sandbox, lipseau `strokeRect`/`drawImage` din `fakeCtx`) — toate 29 de teste existente trec acum. Extinde mock-ul existent (deja actualizat), nu-l duplica.

## Ce trebuie testat cu adevărat

1. **Randare condiționată pe încărcarea imaginii**: dacă `pawnImageLoaded` e `false` (imaginea nu s-a "încărcat" încă în test — mock-ul de `Image` nu declanșează `onload` automat), `draw()` NU trebuie să arunce și nu trebuie să apeleze `drawImage`. Verifică asta explicit (spy pe `fakeCtx.drawImage`, verifică `callCount === 0` înainte de "încărcare").
2. **Randare după "încărcare"**: apelează manual `onload`-ul capturat de mock (la fel cum ai capturat `clickHandler` la T-01) ca să simulezi imaginea încărcată, apoi verifică că `drawImage` e chemat cu argumentele corecte pentru decuparea cadrului curent — parametrii de sursă (`sx, sy, sw, sh`) trebuie să corespundă cadrului 0 inițial: `sx=0, sy=0, sw=192, sh=192` (verifică exact, nu aproximativ).
3. **Avansarea cadrelor**: mock-ul de `setInterval` din T-01 era `() => 0` (nu apela niciodată callback-ul). Pentru acest task, capturează callback-ul buclei de animație (similar cu `clickHandler`) și apelează-l manual de mai multe ori — verifică că `frameIndex`-ul folosit în `drawImage` avansează corect și **se întoarce la 0 după cadrul 7** (ciclic, 8 cadre). Dacă `app.js` are două `setInterval`-uri diferite (poll + animație), mock-ul trebuie să le distingă (ex. după interval sau ordinea apelurilor) — verifică codul real ca să știi cum să le separi, nu presupune.
4. **Indicatorul de status** (cerc mic pe sprite): verifică prin spy pe `arc`/`fill` că se desenează un cerc suplimentar față de sprite, cu culoarea corectă din `colorForStatus` — nu retesta `colorForStatus` însuși (deja acoperit la T-01), doar că `draw()` chiar îl folosește pentru indicator.
5. **Selecția** (`strokeRect` în loc de conturul vechi): verifică prin spy că, la agent selectat, `strokeRect` e chemat cu o zonă care corespunde poziției agentului (nu doar că "a fost chemat", ci cu coordonate plauzibile).
6. **Hit-test neschimbat**: testele vechi de click (hit/miss) trebuie să rămână valide — dacă brief-ul coder-ului spune că raza de hit-test n-a fost schimbată, confirmă asta indirect (testele T-01 de click încă trec, ceea ce ai verificat deja rulând suita).

## Ce NU e un test valid

- Nu testa aspectul vizual pixel-cu-pixel (nu avem randare reală de canvas în acest mediu).
- Nu presupune valorile exacte de poziție fără să le calculezi din `hashToCellIndex`/`cellIndexToPosition` (deja exportate/accesibile în sandbox) — un test cu poziții hardcodate "ghicite" e fragil.

## Constrângeri dure

- Nu modifica `public/app.js`.
- Nu rula comenzi.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` (extindere, nu fișier nou) + `docs/handoff/T-04-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare.
