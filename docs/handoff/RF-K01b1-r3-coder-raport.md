# RF-K01b1 r3 — raport Coder

## Fișiere schimbate

- `adapters/pi-subagents-files.js`
- `docs/handoff/RF-K01b1-r3-coder-raport.md`

## Corecția root anchor

Am introdus helper-ul intern `sameIdentity(first, second)`, care compară `dev` și `ino`.

`canonicalDirectory()` păstrează `lstat`-ul inițial al root-ului, validat deja ca director normal non-link. După `realpathSync(root)`, face două reverificări separate: `lstat` pe calea root furnizată și `lstat` pe calea canonical memorată. Ambele trebuie să existe, să fie directoare normale non-link și să aibă aceeași identitate cu root-ul inițial.

Astfel, un swap către junction înainte de `realpathSync` este respins deoarece root-ul curent devine link ori are identitate diferită. Varianta swap → `realpath` extern → restore înaintea reverificării este de asemenea respinsă: calea canonical memorată rămâne obiectul extern și nu are identitatea root-ului inițial. Link-urile, directoarele schimbate și orice identity mismatch după canonicalizare sunt proiectate numai ca `ROOT_LINK_REJECTED`; root indisponibil rămâne `ROOT_UNAVAILABLE`.

## Ordinea identității statusului

După `fstatSync(descriptor)`, `readStatus()` compară acum mai întâi identitatea descriptorului cu `lstat`-ul inițial. Orice mismatch produce `STATUS_LINK_REJECTED`. Numai după această comparație verifică `opened.isFile()` și poate produce `STATUS_NOT_FILE`. Citirea prin FD stabil, `O_NOFOLLOW` unde este disponibil, buffer-ul bounded și `finally` pentru close rămân neschimbate.

## Riscuri reziduale

Verificările de identitate reduc cursele de schimbare de cale la punctele de ancorare/canonicalizare și de open. Un proces extern poate încă modifica conținutul aceluiași inode în timpul citirii; reader-ul nu pretinde snapshot atomic, iar plafonul de bytes și normalizarea RF-K01a rămân aplicate.

## Comenzi și teste

Nu am rulat comenzi sau teste și nu am accesat artefacte Pi reale.
