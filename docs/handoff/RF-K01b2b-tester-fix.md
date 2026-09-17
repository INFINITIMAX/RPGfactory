# RF-K01b2b — corecție Tester

Data: 16-09-2026

## Context

Planner-ul a rulat țintit: 15 total, 13 pass, 2 fail, 0 skip; server PID 40652 înainte/după. Eșecurile sunt fixture-uri Tester, nu defecte demonstrate în implementare:

- testul root unavailable/non-directory furnizează un `runDirectory` care nu este lexical sub acel root, deci API-ul întoarce corect `INVALID_OPTIONS` înainte de filesystem;
- testul root symlink furnizează tot un runDirectory care nu este lexical sub root-link, cu același rezultat corect.

## Sarcină

Modifică exclusiv:

- `test/adapters/pi-subagents-events-file.test.mjs`;
- `docs/handoff/RF-K01b2b-tester-raport.md`.

Nu modifica implementarea și nu rula comenzi/teste.

## Corecții obligatorii

1. Pentru root unavailable, folosește un `runDirectory` absolut lexical sub root-ul inexistent. Pentru root non-directory, folosește un `runDirectory` lexical sub acel root-file. Așteaptă warning-urile filesystem din contract.
2. Pentru root symlink/junction, folosește un `runDirectory` lexical sub calea link-ului, astfel încât validarea opțiunilor să treacă și root-ul să fie respins ca link. Fiecare creare ulterioară de link (run și events) trebuie să aibă propriul skip limitat la `EPERM`/`EACCES`, nu doar prima.
3. Adaugă cazul exact lipsă: o linie oversized fără LF, citită într-o singură fereastră care ajunge la EOF direct din modul normal. Verifică warning, cursor avansat la EOF cu `discardingOversizedLine:true`, `hasMore:false`, `limits.bytes:false`.
4. Adaugă read failure după un cursor valid nonzero: după append, patch `readSync` să arunce; verifică `EVENTS_READ_FAILED`, cursorul identic/păstrat (fără revenire la zero), reset null și `closeSync` apelat în `finally`.
5. Adaugă read failure după rotație deja detectată: cursor vechi + fișier nou + `readSync` care aruncă trebuie să păstreze `reset:'rotated'`, warning-urile în ordine și cursorul nou la offset 0.
6. Fă înlocuirile de fișier portabile pe Windows: nu te baza pe `renameSync(source, existingDestination)`; mută/șterge controlat vechiul fișier în fixture înainte de rename, fără a slăbi aserțiunea de rotație/swap.

## Raport

Actualizează raportul cu prima rulare și corecțiile. Spune explicit că nu ai rulat validarea după editare.
