# RF-01 — oracol negativ pe baseline (dovadă înainte de fix)

**Data rulării:** 14-09-2026, EET.
**Rulat de:** planner (singurul rol care execută comenzi).
**Baseline:** HEAD `6fecdad`, neschimbat.
**Rezultat:** **10 din 10 defecte vizate reproduse și confirmate.**

Acest document este dovada negativă cerută de `AGENTS.md` („pentru bug: dovadă negativă înainte de fix”). Demonstrează că defectele pe care RF-01 urmează să le repare **există efectiv** în cod, înainte ca cineva să scrie o linie de fix. Fără el, un test verde după fix nu ar dovedi nimic — nu am ști dacă a reparat ceva sau dacă a testat ceva ce funcționa deja.

## Cum a fost rulat, în siguranță

Suita existentă **nu** a fost rulată în checkout-ul activ. `AGENTS.md` și `instructiuni.md` §5 interzic asta explicit: `test/state.test.mjs` șterge și restaurează `data/state.json` real, iar testele API pot lansa Explorer sau Claude.

În schimb:

- Copie izolată a checkout-ului într-un director temporar de sesiune (`scratchpad/rf01-baseline`), 140 de fișiere.
- Excluse din copie: `.env`, `data/`, `assets/`, `public/sprites/`, `public/ui/`, `.git`, `node_modules`, `server.log`.
- Starea de test a fost creată de la zero în copie, cu date sintetice. `D:/RPGfactory/data/state.json` real nu a fost citit, scris sau șters.
- Port de probă efemer (5399), eliberat la final. Verificat.
- **Serverul utilizatorului de pe 5311 (PID 54236) nu a fost atins, oprit sau restartat.** Verificat înainte și după.
- Opener-ul OS nu a fost lansat: niciuna dintre probe nu atinge `/api/open`, `/api/reveal` sau `/api/new-session`.

Script: `scratchpad/rf01-oracle.mjs` (temporar, al sesiunii). Rezultat brut: `scratchpad/rf01-oracle-rezultat.json`.

## Defectele confirmate

| ID | Defect | Locație | Ce s-a observat efectiv |
|---|---|---|---|
| D1 | Import cu efecte secundare | `server.js:245` | `require("./server.js")` a apelat singur `listen(5398)` și a citit `~/.claude/sessions`, fără ca nimeni să ceară pornirea. Orice test care doar importă modulul deschide o priză de rețea și atinge home-ul real. |
| D2 | Bind pe toate interfețele | `server.js:245` | `server.listen(PORT)` ascultă pe `::`, deci accesibil din LAN — deși mesajul din consolă spune „http://localhost:”. Aplicația pretinde local-only fără să fie. |
| D3 | Origine validată doar pe hostname | `server.js:24-40` | `PUT /api/state` cu `Origin: http://localhost:9999` a răspuns **200** și a scris starea. `hostnameOf()` aruncă portul, deci orice pagină de pe alt port local poate muta starea. CSRF local. |
| D4 | Containment static prin `startsWith` | `server.js:225` | `GET /../public-secret/scurgere.txt` a returnat **200 cu conținutul fișierului**. `path.join` rezolvă în afara `public/`, iar `startsWith(publicRoot)` lasă să treacă pentru că prefixul „public” se potrivește literal. Orice director frate `public-*` e servit. |
| D5 | `baseUpdatedAt=0` ocolește CAS | `state.js:83` | Stare existentă `["stare-importanta"]` (rev. 1789418393628). Un `PUT` cu `baseUpdatedAt: 0` a răspuns **200**, fără 409, și a înlocuit-o cu `["am-sters-tot"]`. Condiția `if (base && ...)` tratează `0` ca fals și sare peste verificare. |
| D6 | Schemă nevalidată | `state.js:89` | `PUT` cu `archived` ca **obiect** și `archivedAt` ca **string** a răspuns 200 și a persistat tipurile greșite pe disc. Starea devine coruptă structural; orice cititor care presupune un array se rupe. |
| D7 | Revizie din `Date.now()` | `state.js:48` | Cu ceasul înghețat, `writeState` a returnat **aceeași** revizie `1700000000000` pentru două scrieri diferite — CAS nu le mai poate distinge, deci a doua calcă peste prima fără 409. În rulare naturală pe acest disc reviziile au diferit (…680 vs …684): **defectul e latent, nu absent** — depinde de viteza discului, nu de corectitudinea codului. Un timestamp de perete poate și să dea înapoi la sincronizare NTP. |
| D8 | Body fără limită | `server.js:124`, `state.js:63` | Body de **8 MB** acumulat în memorie și scris pe disc în 99 ms, fără niciun plafon. `body += chunk` nu are limită de dimensiune. |
| D9 | Query string în numele fișierului | `server.js:220` | `GET /app.js` → 200, dar `GET /app.js?v=1` → **404**. `req.url` nu e parsat; `?v=1` ajunge în `path.join`. Orice cache-busting normal rupe pagina. |
| D10 | Metoda HTTP ignorată la rutare | `server.js:116` | `DELETE /api/agents` a răspuns **200 cu lista de agenți**. Ruta se potrivește doar pe URL. |

## Notă onestă despre D7

Prima versiune a sondei nu a reprodus D7: scrierea sincronă pe disc durează ~4 ms pe această mașină, deci două apeluri consecutive cad natural în milisecunde diferite. Asta **nu** dovedește că schema e sigură — dovedește doar că defectul e latent pe acest hardware.

Proba a fost refăcută înghețând ceasul, adică exact cazul numit în audit („două scrieri în același milisecund”). Un disc mai rapid, un tmpfs sau o mașină mai puternică produc același efect fără niciun truc.

Consemnez explicit că această coliziune a fost **demonstrată cu ceas înghețat, nu observată spontan**, ca să nu apară ulterior ca dovadă mai tare decât este.

## Ce NU acoperă acest oracol

- Defectele UI din audit: XSS prin `innerHTML`, jitter/rază de selecție, `allocateCells` care pierde layout-ul, contorul de cadre 6 vs 8, scale=0 înainte de destinație. Sunt ale loturilor RF-04/RF-05, nu ale RF-01.
- `readAgents` / `status.js` / `rank.js` — proiecția activității (defectul F01 din audit). Aparțin RF-03. Reviewer-ul RF-00-R a cerut explicit ca acest lucru să fie spus în brief-ul coder-ului, ca să nu extindă lotul.
- Politica symlink/junction pe containment-ul static: **nu a fost testată**, se stabilește explicit în brief.
- Comportamentul la erori de disc (ENOSPC, permisiuni) care lasă request-uri suspendate: **netestat încă**, dar identificat în cod — `writeState` aruncă sincron în `serialise()`, iar răspunsul HTTP nu mai e trimis niciodată.

## Ce urmează

Aceste 10 probe devin baza regresiilor din RF-01. După fix, fiecare trebuie să se inverseze — și suita completă, adaptată, trebuie să treacă. Numărul istoric „205 teste” **nu** se copiază ca rezultat nou; se raportează numărul și exit code-ul rulării reale.
