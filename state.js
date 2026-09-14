// state.js — persistență pentru arhivarea agenților (T-06), reproducând
// exact mecanica de scriere sigură din bot-crossing (server/api.mjs):
// scriere atomică (tmp + rename), coadă de scriere serializată, concurență
// optimistă pe `updatedAt`. Schema e simplificată la ce ne trebuie efectiv:
// `archived` + `archivedAt` + `plots` (fără `seen`/`hiddenProjects`/etc.,
// care nu există la noi). `plots` e layout-ul de zone calculat de
// public/zones.js (T-08), salvat ca să nu se recalculeze de la zero la
// fiecare pornire de server/reîncărcare de pagină (wiring-ul vine la T-10).
//
// RF-01: nicio cale de fișier nu mai e constantă de modul — `dataDir` (și
// fișierul de stare derivat din el) se calculează per store, injectat prin
// `createStateStore(options)`. Asta permite testelor să folosească directoare
// temporare, în loc să atingă `data/state.json` real.

const fs = require('fs');
const path = require('path');
const { readJsonBody } = require('./body');

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_KEYS = new Set(['archived', 'archivedAt', 'plots', 'version', 'baseUpdatedAt']);
const MAX_ARCHIVED_ITEMS = 10000;
const MAX_ARCHIVED_ITEM_LEN = 512;
const MAX_ARCHIVED_AT_KEYS = 10000;
const MAX_PLOTS_BYTES = 512 * 1024;
const MAX_PLOTS_DEPTH = 8;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Caută `__proto__`/`constructor`/`prototype` ca nume de chei la orice
// adâncime din `plots` — un obiect imbricat arbitrar poate ascunde o
// poluare de prototip la fel de bine ca unul de nivel 1.
function hasReservedKey(value) {
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (RESERVED_KEYS.has(key)) return true;
    if (hasReservedKey(value[key])) return true;
  }
  return false;
}

// Adâncimea unui obiect simplu: un obiect fără chei are adâncime 1; fiecare
// nivel de imbricare mai adaugă unul.
function objectDepth(value) {
  if (!isPlainObject(value)) return 0;
  const keys = Object.keys(value);
  if (keys.length === 0) return 1;
  let max = 0;
  for (const key of keys) {
    const d = objectDepth(value[key]);
    if (d > max) max = d;
  }
  return max + 1;
}

// Validează patch-ul primit la PUT (D6). Verifică TOT înainte de a atinge
// discul — la orice eșec, starea de pe disc rămâne neatinsă. Câmpurile
// necunoscute sunt respinse explicit, nu ignorate silențios.
function validateStatePatch(data) {
  if (!isPlainObject(data)) return { ok: false, message: 'body must be a JSON object' };

  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, message: 'unknown field: ' + key };
  }

  const baseUpdatedAt = data.baseUpdatedAt;
  if (typeof baseUpdatedAt !== 'number' || !Number.isFinite(baseUpdatedAt)) {
    return { ok: false, message: 'baseUpdatedAt must be a finite number' };
  }

  if ('version' in data && data.version !== 1) {
    return { ok: false, message: 'version must be exactly 1' };
  }

  let archived;
  if ('archived' in data) {
    if (!Array.isArray(data.archived)) return { ok: false, message: 'archived must be an array' };
    if (data.archived.length > MAX_ARCHIVED_ITEMS) {
      return { ok: false, message: 'archived exceeds ' + MAX_ARCHIVED_ITEMS + ' items' };
    }
    for (const item of data.archived) {
      if (typeof item !== 'string' || item.length > MAX_ARCHIVED_ITEM_LEN) {
        return { ok: false, message: 'archived items must be strings up to ' + MAX_ARCHIVED_ITEM_LEN + ' chars' };
      }
    }
    archived = data.archived;
  }

  let archivedAt;
  if ('archivedAt' in data) {
    if (!isPlainObject(data.archivedAt)) return { ok: false, message: 'archivedAt must be an object' };
    const keys = Object.keys(data.archivedAt);
    if (keys.length > MAX_ARCHIVED_AT_KEYS) {
      return { ok: false, message: 'archivedAt exceeds ' + MAX_ARCHIVED_AT_KEYS + ' keys' };
    }
    for (const key of keys) {
      if (RESERVED_KEYS.has(key)) return { ok: false, message: 'archivedAt has reserved key: ' + key };
      const value = data.archivedAt[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, message: 'archivedAt values must be finite numbers' };
      }
    }
    archivedAt = data.archivedAt;
  }

  let plots;
  if ('plots' in data) {
    if (!isPlainObject(data.plots)) return { ok: false, message: 'plots must be an object' };
    if (hasReservedKey(data.plots)) return { ok: false, message: 'plots has a reserved key' };
    if (objectDepth(data.plots) > MAX_PLOTS_DEPTH) {
      return { ok: false, message: 'plots exceeds max depth of ' + MAX_PLOTS_DEPTH };
    }
    if (Buffer.byteLength(JSON.stringify(data.plots), 'utf8') > MAX_PLOTS_BYTES) {
      return { ok: false, message: 'plots exceeds ' + MAX_PLOTS_BYTES + ' bytes' };
    }
    plots = data.plots;
  }

  return { ok: true, baseUpdatedAt, archived, archivedAt, plots };
}

function createStateStore(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const now = options.now || (() => Date.now());
  const stateFile = path.join(dataDir, 'state.json');

  function emptyState() {
    return { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
  }

  function readState() {
    try {
      const raw = fs.readFileSync(stateFile, 'utf8');
      const parsed = JSON.parse(raw);
      return Object.assign(emptyState(), parsed);
    } catch (e) {
      return emptyState();
    }
  }

  // coadă de scriere serializată, per store (nu mai e globală — asta ar fi
  // amestecat scrierile a două store-uri distincte, ex. teste în paralel):
  // două PUT-uri care ajung aproape simultan nu trebuie să calce unul peste
  // celălalt între citirea stării curente și scrierea ei.
  let writeQueue = Promise.resolve();
  let tmpSeq = 0;
  function serialise(fn) {
    writeQueue = writeQueue.then(fn, fn);
    return writeQueue;
  }

  // Scrie efectiv `patch`-ul pe disc, calculând o revizie nouă monotonă
  // (D7 — un contor, nu `Date.now()`, ca două scrieri în aceeași milisecundă
  // să rămână distinctibile). Presupune că e apelată dintr-o secțiune deja
  // serializată (fie prin `writeState`, fie din `handlePutState`).
  function persist(patch) {
    const current = readState();
    const nextRev = Math.max(Number(current.updatedAt) || 0, 0) + 1;
    const state = {
      version: 1,
      archived: (patch && patch.archived) || [],
      archivedAt: (patch && patch.archivedAt) || {},
      plots: (patch && patch.plots) || {},
      updatedAt: nextRev,
      savedAt: new Date(now()).toISOString(), // doar pentru afișare umană — nu se folosește la CAS
    };

    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = stateFile + '.' + process.pid + '.' + (++tmpSeq) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    try {
      fs.renameSync(tmp, stateFile);
    } catch (e) {
      // rename eșuat (disc plin, permisiuni) — încercăm să curățăm tmp-ul,
      // dar nu lăsăm o eroare de curățenie să mascheze eroarea originală.
      try {
        fs.unlinkSync(tmp);
      } catch (cleanupErr) {
        // ignorăm — eroarea de I/O originală e cea care contează (D11)
      }
      throw e;
    }
    return state;
  }

  function writeState(patch) {
    return serialise(() => persist(patch));
  }

  // `res.writeHead`/`res.end` pot arunca (headere deja trimise, socket
  // închis de client între timp) — și asta se poate întâmpla din interiorul
  // funcției serializate în `writeQueue`. Fără protecție, excepția iese din
  // funcție, `writeQueue` devine o promisiune respinsă, iar `handlePutState`
  // nu prinde valoarea întoarsă de `serialise` -> unhandledRejection care
  // poate opri procesul (RF-01b). Prindem aici, logăm (nu înghițim în
  // tăcere), și lăsăm coada utilizabilă pentru scrierile următoare.
  function respond(res, status, body) {
    try {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    } catch (e) {
      console.error('state.js: răspunsul ' + status + ' nu a putut fi trimis (client deconectat?):', e);
    }
  }

  function handleGetState(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readState()));
  }

  function handlePutState(req, res) {
    readJsonBody(req, res, (data) => {
      const validation = validateStatePatch(data);
      if (!validation.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: validation.message }));
        return;
      }

      // citirea stării curente (pentru CAS) și scrierea rămân în aceeași
      // secțiune serializată — altfel altă cerere s-ar putea strecura între ele.
      serialise(() => {
        const current = readState();
        if (validation.baseUpdatedAt !== current.updatedAt) {
          respond(res, 409, current);
          return;
        }

        let next;
        try {
          next = persist({
            archived: validation.archived,
            archivedAt: validation.archivedAt,
            plots: validation.plots,
          });
        } catch (e) {
          // D11: o eroare de disc trebuie să producă un răspuns, nu un
          // request abandonat. Prindem excepția aici (nu lăsăm promisiunea
          // cozii să se rupă) ca scrierile următoare să rămână posibile.
          respond(res, 500, { ok: false, error: 'eroare de scriere pe disc' });
          return;
        }

        respond(res, 200, next);
      });
    });
  }

  return { readState, writeState, handleGetState, handlePutState };
}

module.exports = { createStateStore };
