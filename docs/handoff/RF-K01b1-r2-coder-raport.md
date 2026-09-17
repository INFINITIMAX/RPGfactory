# RF-K01b1 r2 — raport Coder

## Fișiere schimbate

- `adapters/pi-subagents-files.js`
- `docs/handoff/RF-K01b1-r2-coder-raport.md`

## Corecția citirii `status.json`

`readStatus()` păstrează verificările inițiale de tip, link, dimensiune și containment canonical. După acestea, deschide calea o singură dată și păstrează descriptorul pentru verificare și citire.

Flags-ul pornește de la `fs.constants.O_RDONLY`; adaugă bitul `fs.constants.O_NOFOLLOW` numai când constanta există numeric. Un refuz `ELOOP` la open este proiectat ca `STATUS_LINK_REJECTED`; celelalte erori de open sunt `STATUS_READ_FAILED` fără mesaje brute.

Imediat după open, `fs.fstatSync(descriptor)` verifică fișierul deschis. Acesta trebuie să fie regulat, iar `dev` și `ino` trebuie să coincidă cu `lstat`-ul inițial. O identitate diferită este `STATUS_LINK_REJECTED`, astfel încât un swap de cale între verificare și open nu devine o citire a unei ținte noi. Dimensiunea descriptorului este verificată înainte de citire.

Citirea nu mai folosește `readFileSync` sau o a doua operație path-based. Este alocat exact un buffer de `maxStatusBytes + 1`, iar `fs.readSync` citește din descriptor în buclă până la EOF sau până la plafon. Dacă este ocupat byte-ul suplimentar, rezultatul este `STATUS_TOO_LARGE`; payload-ul complet nu este citit și nu se poate aloca peste plafonul contractului. Numai octeții efectiv citiți sunt decodați UTF-8 și parsați, apoi sunt trimiși neschimbat la normalizatorul RF-K01a.

Descriptorul este închis în `finally` pentru toate ramurile după open. O eroare de close este suprimată, pentru a nu suprascrie rezultatul sau warning-ul deja clasificat.

## Riscuri reziduale

Citirea sincronă oferă consistență pentru descriptorul deschis, nu un snapshot atomic al conținutului dacă alt proces modifică aceleași blocuri ale fișierului în timp ce este citit. Limita de bytes, identitatea descriptorului și proiecția RF-K01a rămân aplicate. Pe platforme fără `O_NOFOLLOW`, comparația `lstat`/`fstat` este protecția pentru swap-ul dintre verificare și open.

## Comenzi și teste

Nu am rulat comenzi sau teste și nu am accesat artefacte Pi reale.
