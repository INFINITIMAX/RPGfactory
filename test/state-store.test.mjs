// Teste directe pe modulul state.js (fără HTTP) — capcanele §3.1 și §3.2
// din brief-ul de tester, găsite de planner la inspecția codului, pe care
// coder-ul nu le-a semnalat.
//
// Nu pornim niciun server aici: `createStateStore` e apelabil izolat, cu un
// `dataDir` temporar propriu — nu atinge niciodată `data/state.json` real.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createStateStore } = require('../state.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-state-store-'));
}

// =============================================================================
// §3.1 — writeState(patch) e acum ASINCRON (întoarce o promisiune), nu mai
// întoarce sincron obiectul de stare cum făcea vechiul `writeState(archived,
// archivedAt, plots)`.
// =============================================================================

test('writeState(patch) întoarce o Promise, nu obiectul de stare direct', () => {
  const store = createStateStore({ dataDir: tmpDir(), now: () => 1700000000000 });
  const result = store.writeState({ archived: ['x'], archivedAt: {}, plots: {} });
  assert.ok(result instanceof Promise, 'writeState ar trebui să întoarcă o Promise (contract nou, D5/D7)');
  // un assert slab aici (`assert.ok(result)`) ar fi trecut și dacă writeState
  // ar fi întors sincron obiectul de stare direct (tot un obiect adevărat) —
  // de asta verificăm explicit `instanceof Promise`.
  assert.equal(typeof result.archived, 'undefined', 'un obiect Promise nu are direct un câmp .archived pe el');
  return result.then((state) => {
    assert.deepEqual(state.archived, ['x'], 'starea reală e disponibilă abia după ce se așteaptă promisiunea');
  });
});

test('writeState: două apeluri consecutive produc revizii strict crescătoare (D7), chiar cu ceas înghețat', async () => {
  const store = createStateStore({ dataDir: tmpDir(), now: () => 1700000000000 });
  const s1 = await store.writeState({ archived: ['a'], archivedAt: {}, plots: {} });
  const s2 = await store.writeState({ archived: ['a', 'b'], archivedAt: {}, plots: {} });
  assert.ok(s2.updatedAt > s1.updatedAt, `revizia a doua (${s2.updatedAt}) ar trebui să fie strict mai mare decât prima (${s1.updatedAt})`);
});

// =============================================================================
// §3.2 — istoricul acestui bloc de teste (citește asta înainte să te miri de
// ce contractul pare "inversat" față de un test tipic de regresie):
//
// ÎNAINTE (RF-01/RF-01b, cât timp bugul era încă în producție): handlePutState
// apela serialise(() => {...}) și ignora promisiunea întoarsă. Dacă
// res.writeHead arunca din alt motiv decât eșecul din persist() (ex. "headers
// already sent"), excepția scăpa din funcția serializată, writeQueue devenea
// o promisiune respinsă pe care nimeni n-o prindea -> unhandledRejection care
// putea opri procesul. Testul de atunci DOVEDEA prezența bugului: declanșa
// exact acest scenariu și pica (assert.fail) dacă NU apărea un
// unhandledRejection. Și-a făcut treaba — a prins un bug real și a forțat
// reparația (vezi `docs/handoff/RF-01-tester-raport.md`).
//
// ACUM (RF-01c): coder-ul a extras un helper `respond(res, status, body)` cu
// try/catch în jurul lui writeHead/end, aplicat pe toate cele trei ieșiri din
// interiorul lui serialise() în handlePutState — 409 (conflict CAS), 500
// (eroare de disc) și 200 (succes, unde era gaura originală). Testele de mai
// jos pinuiesc PROPRIETATEA INVERSĂ față de înainte, pe toate cele trei căi:
//   1. niciun unhandledRejection, chiar dacă res.writeHead aruncă;
//   2. writeQueue rămâne sănătoasă după — o scriere validă ulterioară tot
//      reușește și primește revizia corectă (proba care contează cu adevărat:
//      reparația nu trebuie doar să înghită eroarea, ci să lase coada
//      utilizabilă pentru cererile următoare).
// Dacă vreunul din aceste teste pică din nou cu "a apărut un
// unhandledRejection", NU e un fals-pozitiv de reparat orbește — e semnalul
// că protecția din `respond` a fost scoasă sau ocolită pe o cale nouă.
// =============================================================================

test('handlePutState (200): dacă res.writeHead aruncă DUPĂ o scriere reușită, NU apare unhandledRejection și coada rămâne utilizabilă', async () => {
  const store = createStateStore({ dataDir: tmpDir(), now: () => 1 });

  let unhandled = null;
  const onUnhandledRejection = (err) => {
    unhandled = err;
  };
  // Înregistrăm listener-ul ÎNAINTE de a declanșa scenariul, ca înainte —
  // nu pentru că mai am nevoie să suprim un crash (respond() îl prinde acum
  // singur), ci ca să pot detecta explicit dacă totuși mai scapă ceva.
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const fakeReq = new EventEmitter();
    fakeReq.headers = {}; // readJsonBody citește req.headers['content-length']

    let writeHeadCalls = 0;
    const fakeRes = {
      writeHead: () => {
        writeHeadCalls++;
        if (writeHeadCalls === 1) {
          // simulează "headers already sent" / socket închis exact în
          // punctul unde persist() a reușit deja și handlePutState trimite 200.
          throw new Error('simulat: headers already sent (200)');
        }
      },
      end: () => {},
    };

    store.handlePutState(fakeReq, fakeRes);
    fakeReq.emit('data', Buffer.from(JSON.stringify({ baseUpdatedAt: 0, archived: [], archivedAt: {}, plots: {} })));
    fakeReq.emit('end');

    // lăsăm microtask-urile/promisiunile să se rezolve; unhandledRejection
    // se emite de obicei la finalul tick-ului curent al loop-ului.
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }

  assert.equal(
    unhandled,
    null,
    `nu ar trebui să apară unhandledRejection (RF-01c) — a apărut: ${unhandled && unhandled.message}`
  );

  // Proba care contează: persist() a reușit (writeHead a aruncat DUPĂ, la
  // trimiterea răspunsului), deci starea de pe disc chiar a avansat la rev 1
  // — și coada tot poate primi o scriere validă ulterioară, care ajunge la rev 2.
  const next = await store.writeState({ archived: ['dupa-200'], archivedAt: {}, plots: {} });
  assert.equal(next.updatedAt, 2, 'coada rămâne utilizabilă după eșecul pe writeHead(200) — scrierea următoare primește rev 2');
  assert.deepEqual(next.archived, ['dupa-200']);
});

test('handlePutState (409): dacă res.writeHead aruncă la un conflict CAS, NU apare unhandledRejection și coada rămâne utilizabilă', async () => {
  const store = createStateStore({ dataDir: tmpDir(), now: () => 1 });

  // pre-populăm o revizie reală, ca să putem forța un conflict CAS autentic
  // (baseUpdatedAt greșit) la pasul următor, nu doar unul simulat.
  const first = await store.writeState({ archived: ['a'], archivedAt: {}, plots: {} });
  assert.equal(first.updatedAt, 1);

  let unhandled = null;
  const onUnhandledRejection = (err) => {
    unhandled = err;
  };
  process.on('unhandledRejection', onUnhandledRejection);

  try {
    const fakeReq = new EventEmitter();
    fakeReq.headers = {};

    let writeHeadCalls = 0;
    const fakeRes = {
      writeHead: () => {
        writeHeadCalls++;
        if (writeHeadCalls === 1) {
          throw new Error('simulat: headers already sent (409)');
        }
      },
      end: () => {},
    };

    // baseUpdatedAt=0, dar starea curentă e deja la rev 1 -> conflict CAS -> 409.
    store.handlePutState(fakeReq, fakeRes);
    fakeReq.emit('data', Buffer.from(JSON.stringify({ baseUpdatedAt: 0, archived: ['ignorat-din-cauza-409'], archivedAt: {}, plots: {} })));
    fakeReq.emit('end');

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(
      unhandled,
      null,
      `nu ar trebui să apară unhandledRejection pe calea 409 — a apărut: ${unhandled && unhandled.message}`
    );
    assert.equal(writeHeadCalls, 1, 'respond trebuia să apeleze writeHead exact o dată pentru această cerere (409, care a aruncat)');
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }

  const next = await store.writeState({ archived: ['dupa-409'], archivedAt: {}, plots: {} });
  assert.equal(next.updatedAt, 2, 'coada tot funcționează după conflictul CAS care a aruncat la writeHead — scrierea următoare primește rev 2');
});

test('handlePutState (500): dacă persist() aruncă (eroare de disc) ȘI res.writeHead aruncă la rândul lui, NU apare unhandledRejection și coada rămâne utilizabilă', async () => {
  const store = createStateStore({ dataDir: tmpDir(), now: () => 1 });

  let unhandled = null;
  const onUnhandledRejection = (err) => {
    unhandled = err;
  };
  process.on('unhandledRejection', onUnhandledRejection);

  // Aceeași tehnică ca D11 din test/state.test.mjs: monkey-patch TEMPORAR pe
  // `fs.writeFileSync` (aceeași instanță de modul folosită de state.js),
  // eșuează o singură dată, restaurat necondiționat în `finally`.
  const realWriteFileSync = fs.writeFileSync;
  let patched = true;
  fs.writeFileSync = (...args) => {
    if (patched) {
      patched = false;
      throw Object.assign(new Error('ENOSPC simulat'), { code: 'ENOSPC' });
    }
    return realWriteFileSync(...args);
  };

  try {
    const fakeReq = new EventEmitter();
    fakeReq.headers = {};

    let writeHeadCalls = 0;
    const fakeRes = {
      writeHead: () => {
        writeHeadCalls++;
        if (writeHeadCalls === 1) {
          throw new Error('simulat: headers already sent (500)');
        }
      },
      end: () => {},
    };

    // baseUpdatedAt=0 se potrivește cu starea inițială (store nou, updatedAt=0)
    // -> trece de verificarea CAS -> intră în persist(), care aruncă din
    // cauza fs.writeFileSync patch-uit -> handlePutState prinde local, cheamă
    // respond(res, 500, ...), unde writeHead aruncă la rândul lui.
    store.handlePutState(fakeReq, fakeRes);
    fakeReq.emit('data', Buffer.from(JSON.stringify({ baseUpdatedAt: 0, archived: [], archivedAt: {}, plots: {} })));
    fakeReq.emit('end');

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(
      unhandled,
      null,
      `nu ar trebui să apară unhandledRejection pe calea 500 — a apărut: ${unhandled && unhandled.message}`
    );
    assert.equal(writeHeadCalls, 1, 'respond trebuia să apeleze writeHead exact o dată (500, care a aruncat)');
  } finally {
    fs.writeFileSync = realWriteFileSync;
    process.off('unhandledRejection', onUnhandledRejection);
  }

  // Proba care contează, DUPĂ ce fs.writeFileSync a fost restaurat: coada
  // rămâne utilizabilă și după o eroare de disc care a scăpat prin persist().
  // Scrierea eșuată nu a atins discul (throw înainte de rename), deci prima
  // scriere reușită de-abia acum primește rev 1, nu 2.
  const next = await store.writeState({ archived: ['dupa-500'], archivedAt: {}, plots: {} });
  assert.equal(next.updatedAt, 1, 'scrierea eșuată (500) nu a incrementat nimic pe disc');
  assert.deepEqual(next.archived, ['dupa-500']);
});
