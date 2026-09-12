# T-11 — Teste pentru mișcarea agenților

## Sarcină

Scrie teste pentru mecanismul nou de mișcare din `public/app.js` (vezi `docs/handoff/T-11-coder.md` și `docs/handoff/T-11-coder-raport.md`).

**Reparare necesară întâi**: harness-ul de test nu avansează automat `setInterval`-urile. `draw()` citește acum din `agentMovement`, populat doar de `updateAgentMovement()` — după `setAgents([...])`, `agentMovement` e gol până apelezi manual `app.sandbox.updateAgentMovement()`. Adaugă un helper `advanceMovementTick()` în `loadApp()` (analog cu `advanceAnimationFrame()` de la T-04), care apelează `sandbox.updateAgentMovement()` o dată (simulează un pas de 50ms).

Verifică și dacă restul suitei (teste vechi, în special cele care verifică `draw()`/click imediat după `setAgents()`) mai are nevoie de un apel la `advanceMovementTick()` ca să populeze `agentMovement` înainte de a verifica desenul — probabil da, pentru orice test care se aștepta ca un agent nou să fie deja "pe hartă" imediat.

## Cazuri de acoperit

1. **Apariție**: agent nou → intrare în `agentMovement` la exact `SPAWN_POINT`, `state:'spawning'`, `scale:0`.
2. **Tranziția spawning→walking**: după suficiente pași (`stateAge` trece pragul, sau `scale` ajunge la 1 — verifică exact CE condiție declanșează tranziția în codul real, nu presupune), starea devine `walking`.
3. **Mișcare spre țintă**: în `walking`, poziția se apropie de ținta calculată de `computeAgentPositions` cu fiecare pas (`stepAgentTowards`) — verifică că distanța scade monoton, nu doar că se schimbă.
4. **Sosire**: când distanța < `ARRIVE_RADIUS`, `state` devine `at-site`, poziția se fixează EXACT pe țintă (nu doar "aproape").
5. **Recalculare țintă în `at-site`**: dacă ținta se schimbă (simulează adăugarea unui al doilea agent care schimbă layout-ul de zonă) cât timp un agent e `at-site`, acesta revine în `walking`.
6. **Plecare — cazul critic din brief**: un agent arhivat/mort IMEDIAT după apariție (încă `spawning`, `scale` mic) trece direct în `leaving` din starea curentă, nu se teleportează/dispare brusc — verifică că păstrează poziția/scale-ul avut în momentul arhivării ca punct de plecare.
7. **Plecare — dispariție completă**: în `leaving`, `scale` scade și poziția se apropie de `SPAWN_POINT`; când ambele praguri sunt atinse, intrarea dispare din `agentMovement` (verifică `agentMovement.has(id) === false` sau echivalent accesibil din sandbox).
8. **Agent în `leaving` tot desenat**: chiar dacă nu mai apare în `/api/agents` (mort/arhivat), `draw()` tot produce `drawImage` pentru el cât timp e în `agentMovement` — verifică cu spy-urile existente (`drawImageCalls`).
9. **Alegerea sprite-ului**: `walking`/`leaving` → `pawn-run.png` (verifică sursa/imaginea folosită în `drawImage`, dacă e distinsă în mock); `spawning`/`at-site` → `pawn-idle.png`.
10. **Hit-test pe poziția curentă, nu pe țintă**: click pe poziția AFIȘATĂ (nu pe ținta finală) a unui agent aflat în mijlocul mișcării trebuie să-l selecteze.

## Ce NU e un test valid

- Nu testa valori exacte de poziție pe termen lung fără să calculezi din constantele reale (`WALK_SPEED`, `MOVEMENT_DT`) — calculează așteptarea din formula reală, nu ghici un număr.
- Nu presupune un număr fix de pași până la sosire — calculează din distanța inițială și `WALK_SPEED*MOVEMENT_DT` per pas, sau rulează suficiente iterații și verifică STAREA finală, nu un număr exact de tick-uri.

## Constrângeri dure

- Nu modifica `public/app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` (helper nou + teste noi, plus orice reparare a testelor vechi afectate) + `docs/handoff/T-11-tester-raport.md`: ce ai reparat, ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
