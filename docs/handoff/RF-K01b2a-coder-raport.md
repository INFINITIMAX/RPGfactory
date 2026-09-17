# RF-K01b2a — raport Coder

## Fișiere schimbate

- `adapters/pi-subagents-events-contract.js`
- `docs/handoff/RF-K01b2a-coder-raport.md`

## API și validare

Modulul CommonJS exportă `normalizePiSubagentsEvent(raw, { expectedRunId })`. Este pur: primește numai un obiect deja parsat și nu face I/O, parsing JSON, hash, cursor sau efecte la import.

`expectedRunId` este obligatoriu și este verificat ca ID limitat, non-empty, fără whitespace exterior sau control characters. Evenimentele cunoscute invalide și opțiunile invalide returnează `INVALID_EVENT`; tipurile string necunoscute returnează `UNSUPPORTED_EVENT`; un `runId` de sursă valid diferit de ancora așteptată returnează `RUN_ID_MISMATCH`. Niciuna dintre erori nu reflectă date brute.

Toate timestamp-urile, indecșii, duratele, codurile de ieșire și versiunile artifact sunt validate ca numere safe în intervalele contractului. String-urile proiectate au limite și refuză control characters. Câmpurile opționale allowlisted, dacă sunt prezente, trebuie să fie valide; `exitCode: null` este omis intenționat.

## Evenimente allowlisted

Sunt acceptate exclusiv run start/completed/paused/stopped/timed_out/process_terminal/repaired_stale, cele cinci tranziții step, `subagent.child-status`, `subagent.control` și `subagent.events.truncated`. Fiecare produce envelope-ul versionat `pi-subagents-events` cu un `kind` snake_case și numai metadate lifecycle validate.

`complete` este normalizat la `completed`. Truncation marker-ul este ancorat exclusiv prin `expectedRunId`; dacă include un `runId`, acesta trebuie să coincidă. Pentru process-terminal se verifică separat `processTerminal.runId`; pentru control se verifică `event.runId`.

## Privacy și autoritate

Modulul nu copiază sau extinde obiecte brute. Exclude task/prompt/description, message/notice, output/error, cwd, paths/session/artifact, args/tool payload, tokens/cost/usage, diagnostics, task preview/recent failures și toate cheile necunoscute. `status.json` rămâne autoritatea pentru starea curentă; proiecția de eveniment este numai lifecycle history/hint.

## Riscuri reziduale

Acest sub-lot nu citește `events.jsonl`, nu tratează linii parțiale/rotație/cursor/deduplicare și nu persistă nimic; acestea apar în RF-K01b2b/b3. Contractul acceptă numai evenimentele lifecycle verificate pentru versiunea Pi inspectată, astfel încât tipurile viitoare rămân explicit neacceptate până la review.

## Comenzi și teste

Nu am rulat comenzi sau teste și nu am accesat artefacte Pi reale.
