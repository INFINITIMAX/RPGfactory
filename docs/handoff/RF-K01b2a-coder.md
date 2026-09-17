# RF-K01b2a — brief Coder

Data: 16-09-2026

## Context

RF-K01b1 este închis. `events.jsonl` conține atât lifecycle sigur, cât și child Pi events/payload-uri potențial private. Înainte de reader/cursor, construim un contract pur, strict allowlisted. Snapshot-ul `status.json` rămâne autoritatea pentru starea curentă; acest modul proiectează numai istoric/hints.

Citește `spec.md` RF-K01b2a și gates K01B2A-1…8. Sursele verificate sunt `pi-subagents@0.60.0` observability și emitter-ele din `subagent-runner.ts`.

## Fișiere permise

- creează `adapters/pi-subagents-events-contract.js`;
- scrie `docs/handoff/RF-K01b2a-coder-raport.md`.

Nu modifica nimic altceva.

## API obligatoriu

CommonJS:

```js
const { normalizePiSubagentsEvent } = require('./adapters/pi-subagents-events-contract');
const result = normalizePiSubagentsEvent(raw, { expectedRunId });
```

Fără I/O, JSON.parse, hash, cursor sau side effects.

### Erori discriminate

- input/options/câmp cunoscut malformat: `{ok:false,error:{code:'INVALID_EVENT'}}`;
- `type` string necunoscut: `{ok:false,error:{code:'UNSUPPORTED_EVENT'}}`;
- orice runId direct/nested valid dar diferit de `expectedRunId`: `{ok:false,error:{code:'RUN_ID_MISMATCH'}}`.

Nicio eroare nu include valori brute.

`expectedRunId` este obligatoriu: string 1…256, fără whitespace exterior și fără control chars. Aceleași reguli pentru run IDs proiectate.

## Envelope succes

```js
{
  ok: true,
  value: {
    schemaVersion: 1,
    source: 'pi-subagents-events',
    kind: '...',
    ts: 123,
    runId: expectedRunId,
    // numai câmpurile allowlisted de mai jos
  }
}
```

`ts`: număr finit, întreg, nenegativ, safe integer.

## Tipuri suportate și proiecție

1. `subagent.run.started` → `kind:'run_started'`; cere `runId`, `ts`, `mode` din `single|parallel|chain|workflow`; opțional `lifecycleArtifactVersion` întreg 1…1000.
2. `subagent.run.completed` → `kind:'run_completed'`; cere `runId`, `ts`, `status`; normalizează `complete` la `completed`, acceptă numai `completed|failed|partial|paused|stopped`; opțional `durationMs` și artifact version.
3. `subagent.run.paused` → `kind:'run_paused'`, `state:'paused'`.
4. `subagent.run.stopped` → `kind:'run_stopped'`, `state:'stopped'`; ignoră `message`.
5. `subagent.run.timed_out` → `kind:'run_timed_out'`; nu inventa state/progress; ignoră message/timeout/deadline.
6. `subagent.run.process_terminal` → `kind:'run_process_terminal'`; cere `processTerminal` obiect cu `state:'observed'|'unknown'` și runId nested egal cu expected; proiectează numai `processState`; opțional artifact version.
7. `subagent.run.repaired_stale` → `kind:'run_repaired_stale'`; ignoră pid/resultPath/message.
8. `subagent.step.started|completed|failed|paused|stopped` → kinds snake_case echivalente; cere `runId`, `ts`, `stepIndex` întreg 0…1_000_000 și `agent` string 1…128 fără control chars/whitespace exterior. Pentru terminale proiectează opțional `exitCode` (null înseamnă indisponibil și se omite; altfel întreg signed 32-bit) și `durationMs` safe integer nenegativ. Nu proiecta tokens sau payload-uri.
9. `subagent.child-status` → `kind:'child_status'`; cere `version:1`, runId/ts, `childId` valid 1…256 și `status:'stopping'|'stopped'`; proiectează `childStatus`; opțional stepIndex, agent, childRunId (ID valid) și workflowKey 1…128. Omite reason/phase/label/source/asyncDir.
10. `subagent.control` → `kind:'control_attention'`; cere `event` plain object cu `runId`, `ts`, `agent`, `to` și `type` în `active_long_running|needs_attention`; proiectează `attention:event.to`; opțional `index` ca `stepIndex` și reason numai din enum-ul actual din `ControlEvent`. Omite complet message, taskPreview, recentFailureSummary, currentPath/tool, token/tool/turn counters, workflow labels și wrapper notice/channels/targets.
11. `subagent.events.truncated` → `kind:'source_truncated'`; cere `ts`; nu cere runId și folosește exclusiv `expectedRunId`. Dacă are totuși runId valid diferit, mismatch. Omite maxBytes/droppedEventType.

## Validare și privacy

- `raw` și obiectele nested trebuie să fie plain objects.
- String-urile proiectate nu conțin C0/C1 control chars, sunt trim() identice și respectă limitele.
- Numericile proiectate sunt finite/safe și în intervalele de mai sus.
- Orice câmp opțional allowlisted prezent dar invalid face evenimentul `INVALID_EVENT`; `exitCode:null` este excepția documentată și se omite.
- Cheile necunoscute se ignoră, nu se copiază/spread-uiesc.
- Nu proiecta: task, prompt, description, message/notice, output/error, cwd, path/session/artifact, args/tool payload, totalTokens/cost/usageBudget, diagnostic/reason din process proof, taskPreview/recentFailure sau obiecte brute.

## Constrângeri dure

- Numai JavaScript CommonJS; fără dependențe noi.
- Fără filesystem, crypto, JSONL, DB, server/API/UI, missions sau reporter.
- Nu citi artefacte Pi reale.
- Nu rula comenzi/teste; planner-ul le rulează.

## Raport

În `docs/handoff/RF-K01b2a-coder-raport.md` descrie API-ul, tipurile, validarea, mismatch handling, câmpurile excluse, lipsa I/O și riscurile reziduale. Confirmă că nu ai rulat nimic.
