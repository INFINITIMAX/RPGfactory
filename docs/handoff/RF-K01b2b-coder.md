# RF-K01b2b — brief Coder

Data: 16-09-2026

## Sarcină

Creează `adapters/pi-subagents-events-file.js` cu API CommonJS:

```js
readPiSubagentsEvents(options)
```

și scrie raportul în `docs/handoff/RF-K01b2b-coder-raport.md`.

Nu modifica alte fișiere. Nu rula comenzi sau teste.

## Intrare

`options` este obiect plain și cere:

- `root`: cale absolută injectată explicit către rădăcina de încredere;
- `runDirectory`: cale absolută egală cu/sub `root`;
- `expectedRunId`: ID valid conform contractului b2a;
- `cursor` opțional: `null`/absent sau obiect plain exact cu `version: 1`, `fileKey` lowercase hex SHA-256 (64 chars), `offset` safe integer >= 0 și opțional `discardingOversizedLine: true`;
- `maxReadBytes` implicit 256 KiB, hard maximum 4 MiB;
- `maxEventBytes` implicit 64 KiB, hard maximum 1 MiB;
- `maxLines` implicit 200, hard maximum 1000.

`maxReadBytes` trebuie să fie strict mai mare decât `maxEventBytes`. Opțiunile/cursorul invalide întorc exact `{ ok:false, error:{ code:'INVALID_OPTIONS' } }`, fără throw.

## Output succes

```js
{
  ok: true,
  value: {
    schemaVersion: 1,
    source: 'pi-subagents-events-file',
    runId: expectedRunId,
    events: [],
    cursor: null | { version:1, fileKey, offset, ...(discardingOversizedLine ? { discardingOversizedLine:true } : {}) },
    hasMore: false,
    incompleteLine: false,
    reset: null | 'rotated' | 'truncated',
    limits: { bytes:false, lines:false },
    warnings: []
  }
}
```

La root/run/file unavailable sau nesigur, rezultatul rămâne `ok:true`, fără evenimente și cu warning stabil, path-free. Cursorul primit se păstrează dacă fișierul nu a putut fi deschis/verificat; un cursor nou apare numai după deschiderea sigură a unui fișier.

## Siguranță filesystem

- Fără home/temp/config implicit și fără scanare; citește numai `<runDirectory>/events.jsonl`.
- Verifică root-ul ca în RF-K01b1: `lstat` inițial, fără symlink, director, `realpath`, apoi identitate inițial/current/canonical (`dev`/`ino`).
- Verifică `runDirectory` absolut, canonical contained în root, fără symlink/junction, director și cu identitate stabilă inițial/current/canonical.
- Pentru `events.jsonl`: `lstat`, fără symlink, `realpath` contained, open `O_RDONLY|O_NOFOLLOW` unde există, apoi `fstat`; identity mismatch se clasifică înainte de tip. Citește exclusiv din descriptor și îl închide în `finally`.
- `fileKey` = SHA-256 lowercase hex al identității stabile (`dev`, `ino`, `birthtimeMs`), fără cale.
- Citește numai până la dimensiunea snapshot dată de `fstat` la deschidere; nu urmări append-uri apărute în timpul citirii. Nu aloca peste `maxReadBytes`.
- Dacă un read se termină prematur față de snapshot (truncare concurentă), nu emite proiecțiile din citirea instabilă; întoarce warning/reset sigur și cursor offset 0 pentru identitatea curentă.

## Cursor, rotație și truncare

- Fără cursor: începe la offset 0.
- Același `fileKey` și `size >= offset`: continuă de la offset.
- Alt `fileKey`: reset offset 0, `reset:'rotated'`, warning unic `EVENTS_ROTATED`.
- Același `fileKey`, dar `size < offset`: reset offset 0, `reset:'truncated'`, warning unic `EVENTS_TRUNCATED`.
- Cursorul avansează numai peste linii complete consumate, cu excepția modului explicit `discardingOversizedLine`, unde poate avansa bounded până găsește LF.
- O linie finală incompletă la EOF nu se parsează, nu avansează cursorul, setează `incompleteLine:true` și `hasMore:false` până când sursa crește.
- Dacă bufferul se termină înainte de snapshot, setează `limits.bytes:true`; `hasMore:true` când există progres posibil.

## Linii

- Delimitator LF; elimină un CR final pentru CRLF.
- Fiecare linie completă întâlnită, inclusiv goală/invalidă/unsupported, consumă `maxLines` înainte de parse.
- La atingerea bugetului cu date rămase: `limits.lines:true`, cursor la următoarea linie, `hasMore:true`.
- Linie goală: consumată fără warning.
- Decodează UTF-8 strict/fatal. UTF-8 invalid: consumat, `EVENT_ENCODING_INVALID`.
- JSON invalid: consumat, `EVENT_JSON_INVALID`.
- Normalizează fiecare obiect prin `normalizePiSubagentsEvent(raw, { expectedRunId })`.
- Mapping warnings: `UNSUPPORTED_EVENT`→`EVENT_UNSUPPORTED`; `INVALID_EVENT`→`EVENT_INVALID`; `RUN_ID_MISMATCH`→`EVENT_RUN_ID_MISMATCH`. Evenimentul nu intră în output.
- Warning-urile sunt coduri unice, în prima ordine de apariție, fără căi, valori sau erori brute.

## Linie supradimensionată

- `maxEventBytes` măsoară bytes payload fără LF și fără CR final.
- Dacă LF este în buffer și linia depășește limita: consumă până după LF, warning `EVENT_LINE_TOO_LARGE`, fără parse.
- Dacă LF nu este încă în buffer și segmentul curent depășește limita: avansează bounded până la capătul segmentului citit și întoarce cursor cu `discardingOversizedLine:true`.
- La citirea următoare în acest mod, aruncă bytes până la primul LF, apoi elimină flagul și poate procesa restul. Nu păstra payload parțial în cursor/output și nu concatena nebounded.

## Warning-uri filesystem permise

`ROOT_UNAVAILABLE`, `ROOT_LINK_REJECTED`, `ROOT_NOT_DIRECTORY`, `RUN_DIRECTORY_REJECTED`, `EVENTS_MISSING`, `EVENTS_LINK_REJECTED`, `EVENTS_NOT_FILE`, `EVENTS_READ_FAILED`, plus codurile de reset/linie de mai sus. Nicio cale sau eroare brută.

## Scope interzis

- Nu modifica b2a/b1.
- Fără SQLite/deduplicare semantică/misiuni/server/API/UI/reporter.
- Fără citirea artefactelor Pi reale.
- Fără write/delete/rename pe sursă.
- Snapshot-ul rămâne autoritar; reader-ul nu calculează lifecycle curent.

## Raport

Enumeră fișierele modificate, API-ul, limitele și orice risc rămas. Spune explicit că nu ai rulat validarea.
