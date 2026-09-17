# RF-K01b2b — brief Tester

Data: 16-09-2026

## Rol

Scrie teste independente pentru Coder. Nu modifica implementarea și nu rula comenzi/teste. Planner-ul rulează tot.

## Fișiere permise

- creează `test/adapters/pi-subagents-events-file.test.mjs`;
- creează `docs/handoff/RF-K01b2b-tester-raport.md`.

Folosește numai directoare temporare sintetice create de test și curățate prin `t.after`. Nu citi artefacte Pi reale, home/config, DB, rețea, server sau procese copil.

## Contract de testat

Citește:

- `spec.md`, secțiunea RF-K01b2b;
- `GATES.md`, K01B2B-1…8;
- `docs/handoff/RF-K01b2b-coder.md`, r2 și r3;
- `adapters/pi-subagents-events-file.js`;
- `adapters/pi-subagents-events-contract.js` doar pentru shape-ul proiecțiilor.

## Matrice minimă obligatorie

1. Opțiuni invalide fără throw: non-plain, paths relative/goale, run în afara root lexical, expectedRunId invalid; limits 0/fractional/peste hard și `maxReadBytes <= maxEventBytes`.
2. Cursor invalid: versiune, fileKey format/case/lungime, offset negativ/fractional/unsafe, `discardingOversizedLine:false`, cheie necunoscută; cursor valid exact la offset 0.
3. Envelope exact pentru `events.jsonl` lipsă; warning `EVENTS_MISSING`, cursor null sau cursorul primit păstrat, fără paths/private values.
4. Root unavailable/non-directory/link și run unavailable/non-directory/link/outside canonical: warning stabil și path-free. Link-urile pot avea skip explicit numai pentru `EPERM`/`EACCES` Windows.
5. `events.jsonl` director produce `EVENTS_NOT_FILE` portabil.
6. Fișier valid cu mai multe evenimente allowlisted, LF + CRLF + linie goală: proiecții exacte în ordine, cursor v1 path-free la byte offset corect, al doilea read nu repetă nimic; append ulterior produce numai evenimentul nou.
7. Linie finală incompletă sub limită: nu este parsată, cursorul rămâne la începutul ei, `incompleteLine:true`, `hasMore:false`; după append până la LF este emisă o singură dată.
8. Fereastră `maxReadBytes`: se oprește bounded, `limits.bytes/hasMore`; reluarea din cursor nu pierde/nu dublează. Include fereastră care se termină în mijlocul unei linii valide.
9. `maxLines`: fiecare linie completă consumă buget înainte de parse, inclusiv goală, JSON invalid și unsupported; `limits.lines/hasMore`; reluarea pornește la linia următoare. Verifică și cazul exact fără date rămase, unde limita nu este raportată fals.
10. Warning mapping și unicitate: UTF-8 fatal invalid, JSON invalid repetat, unsupported repetat, known invalid și run mismatch; warning-urile apar o singură dată în prima ordine și niciun marker privat/raw/path nu apare în output.
11. Frontieră `maxEventBytes`: payload exact la limită acceptat, +1 cu LF respins și consumat cu `EVENT_LINE_TOO_LARGE`.
12. Oversized fără LF la EOF: intră în `discardingOversizedLine:true`, avansează bounded, warning, dar `hasMore:false` și `limits.bytes:false` când a ajuns la snapshot EOF.
13. Oversized peste mai multe ferestre: cursorul avansează incremental fără payload; când apare LF, iese din discard și procesează corect evenimentul valid imediat următor, fără offset dublat/salt.
14. Rotație: înlocuiește fișierul între apeluri; `fileKey` diferit, `reset:'rotated'`, warning și citire de la zero din noul fișier.
15. Truncare aceeași identitate: după cursor avansat, micșorează același fișier sub offset; `reset:'truncated'`, warning și citire de la zero.
16. Creștere după `fstat`: monkeypatch bounded pentru a adăuga o linie după snapshot; primul apel nu o citește, următorul o citește.
17. Swap între `lstat` și `open`: monkeypatch punctual; identity mismatch produce `EVENTS_LINK_REJECTED`, zero evenimente, fără date din fișierul substituit.
18. Eroare `readSync` după un cursor valid: `EVENTS_READ_FAILED`, cursorul sigur și reset-ul deja stabilit se păstrează; descriptorul este închis în `finally`.
19. Read prematur față de snapshot: zero evenimente din citirea instabilă, `EVENTS_READ_FAILED` + `EVENTS_TRUNCATED`, cursor offset 0 și reset `truncated`.
20. Inputul/outputul nu păstrează referințe brute și modulul nu scrie/șterge/redenumește sursa; conținutul fișierului rămâne byte-identic după citiri normale.

## Calitatea testelor

- Testează comportamentul public, nu copia implementarea.
- Pentru monkeypatch pe `fs`, restaurează întotdeauna funcțiile în `finally`; testele trebuie să rămână seriale și să nu afecteze restul suitei.
- Nu slăbi aserțiuni și nu accepta alternativ warnings care ar masca defecte.
- Orice skip trebuie limitat și motivat de permisiunea platformei, nu de eșec funcțional.
- Raportul enumeră matricea și spune explicit că nu ai rulat validarea.
