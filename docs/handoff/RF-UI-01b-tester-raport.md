# RF-UI-01b — raport tester

Data: 16-09-2026, EET

## Acoperire adăugată

### `test/hud.test.mjs`

- run asociat selectat după profil emite către hartă exact `profile_id` al run-ului;
- run neasociat emite explicit `profileId: null` și elimină focusul pawn-ului anterior;
- acțiune de aprobare cu fetch amânat: control disabled, inspector `aria-busy`, fără PATCH duplicat, deblocare la succes și la eroare;
- formular de creare cu fetch amânat: submit disabled, formular `aria-busy`, fără POST duplicat și deblocare la răspuns de eroare;
- `setConnectionState` păstrează același nod `.connection-dot` și actualizează numai `#connection-label`;
- fake DOM-ul a fost completat strict cu `removeAttribute`, disabled și semantica reală a `textContent`, necesare acestor regresii.

### `test/ui-contract.test.mjs`

- pointerdown + pointerup pe centrul pawn-ului emite exact selecția așteptată;
- click în afara targetului nu emite selecție;
- drag/pan pornit peste pawn nu produce selecție accidentală;
- contractul alternativei Canvas cere mecanismul `:focus-within` care elimină clipping-ul, oferă zonă vizibilă/scrollabilă și păstrează outline vizibil pe butonul focalizat.

## Defect găsit prin inspecție și codificat ca regresie

În handlerul formularului, `createProfileErrorEl.textContent = ''` rulează înainte de verificarea lock-ului din `beginAction`. O a doua trimitere a formularului în timp ce prima cerere este pending nu dublează POST-ul, dar șterge mesajul vizibil „Se creează profilul…”, deși formularul rămâne `aria-busy`. Testul pending cere ca activarea duplicată să nu șteargă starea textuală de progres. Producția nu a fost modificată.

## Confirmare

Nu am rulat comenzi și nu am rulat testele. Planner-ul trebuie să execute mai întâi testele țintite, apoi suita completă. Verificarea focusului și a pointerului în browser real rămâne obligatorie.
