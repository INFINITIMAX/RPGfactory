# RF-K01b2b — raport Tester r2 după review/r5 respins

## Fișiere scrise

- `test/adapters/pi-subagents-events-file.test.mjs`
- `docs/handoff/RF-K01b2b-tester-raport.md`

## Corecții cerute de review/r5

Review-ul a respins forma anterioară a testelor deoarece skip-ul pentru crearea unui events-file link putea ascunde verificările root-link și run-link, iar limitele și CR-ul de la EOF nu acopereau toate frontierele cerute.

- Testul combinat pentru link-uri a fost împărțit în teste independente pentru root-link, run-link și events-file-link. Fiecare are propriul `try/catch` și sare numai la `EPERM` sau `EACCES` pentru propriul link.
- Opțiunile verifică explicit că `maxReadBytes === maxEventBytes` și `maxEventBytes + 1` sunt respinse, iar `maxEventBytes + 2` este acceptat.
- Un eveniment JSON valid cu exact `maxEventBytes`, urmat de CR fără LF, rămâne incomplet fără warning sau avans de cursor; după append LF este emis o singură dată și nu se repetă.
- O linie clar oversized terminată în CR la EOF verifică `EVENT_LINE_TOO_LARGE`, cursorul avansat la EOF cu `discardingOversizedLine:true` și păstrarea acelui offset la read-ul următor.
- Un payload exact la limită urmat de CR și un byte non-LF verifică faptul că CR nu este un delimitator confirmat și că linia intră în discard oversized bounded.

Matricea existentă rămâne pentru opțiuni/cursor invalid, lipsă/director, JSONL LF/CRLF/append, linii incomplete, ferestre de bytes, bugete, normalizare fără date private, limite oversized, rotație/truncare, TOCTOU, snapshot și non-mutație. Testele folosesc numai directoare temporare sintetice și restaurează monkeypatch-urile în `finally`.

## Validare

Nu am rulat comenzi sau teste, conform rolului Tester și brief-ului. Nu afirm că testele trec. Planner-ul trebuie să ruleze testul țintit, suita completă și verificările de diff/staging în mediul controlat.

## Riscuri rămase

- Rezultatul de execuție după aceste corecții este necunoscut până la rularea planner-ului.
- Testele de link pot fi sărite numai pentru link-ul respectiv când platforma refuză crearea lui cu `EPERM` sau `EACCES`.
- Review-ul read-only rămâne obligatoriu înaintea acceptării lotului.
