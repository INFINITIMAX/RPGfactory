import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startServer } = require('../server.js');
const { createPiIngestionStore } = require('../pi-ingestion.js');
const { MIGRATIONS_DIR } = require('../db.js');

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01c-live-'));
}

function writeStatus(root, directoryName, value) {
  const directory = path.join(root, directoryName);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'status.json'), JSON.stringify(value));
}

function status(runId, overrides = {}) {
  return {
    runId,
    state: 'running',
    startedAt: 100,
    lastActivityAt: 200,
    agent: 'worker',
    currentTool: 'coding',
    steps: [],
    ...overrides,
  };
}

async function start(t, options) {
  const server = await startServer({
    port: 0,
    host: '127.0.0.1',
    dataDir: path.join(options.directory, 'data'),
    sessionsDir: path.join(options.directory, 'sessions'),
    dbPath: path.join(options.directory, 'ledger.db'),
    migrationsDir: MIGRATIONS_DIR,
    opener: () => {},
    ...options,
  });
  t.after(async () => {
    await server.close();
    fs.rmSync(options.directory, { recursive: true, force: true });
  });
  return server;
}

async function request(server, method) {
  const response = await fetch(`http://127.0.0.1:${server.port}/api/pi/kingdom`, {
    method,
    headers: { Origin: `http://127.0.0.1:${server.port}` },
  });
  return { response, text: await response.text() };
}

test('live Pi root projects opaque ready nodes and chooses activity-recency over directory order or request time', async (t) => {
  const directory = temporaryDirectory();
  const piRoot = path.join(directory, 'synthetic-pi-root');
  fs.mkdirSync(piRoot);
  const oldNativeId = 'PRIVATE_OLD_NATIVE_ID';
  const newNativeId = 'PRIVATE_NEW_NATIVE_ID';
  writeStatus(piRoot, 'a-lexically-first', status(oldNativeId, { lastActivityAt: 100, agent: 'old-worker' }));
  writeStatus(piRoot, 'z-lexically-last', status(newNativeId, { startedAt: 800, lastActivityAt: 900, agent: 'new-worker' }));
  const server = await start(t, { directory, piRoots: [piRoot], now: () => 1000000 });

  const get = await request(server, 'GET');
  assert.equal(get.response.status, 200);
  assert.equal(fs.existsSync(path.join(directory, 'ledger.db')), false, 'configured live GET does not create or mutate the SQLite ledger');
  const body = JSON.parse(get.text);
  assert.equal(body.availability, 'ready');
  assert.equal(body.observedAt, 900, 'latest source activity, not request time, chooses the focal run');
  assert.equal(body.nodes.length, 1);
  assert.equal(body.nodes[0].role, 'new-worker', 'the newer z run wins despite lexicographic order');
  assert.equal(body.nodes[0].lastActivityAt, 900);
  assert.equal(body.nodes[0].startedAt, 800);
  assert.equal(JSON.stringify(body).includes(oldNativeId), false);
  assert.equal(JSON.stringify(body).includes(newNativeId), false);
  assert.equal(JSON.stringify(body).includes(piRoot), false);
});

test('explicit unavailable root is public-bounded and HEAD/405 retain the kingdom contract', async (t) => {
  const directory = temporaryDirectory();
  const privateRoot = path.join(directory, 'PRIVATE_ROOT_PATH_MARKER');
  const server = await start(t, { directory, piRoots: [privateRoot], now: () => 1000 });

  const get = await request(server, 'GET');
  assert.equal(get.response.status, 200);
  assert.deepEqual(JSON.parse(get.text), {
    schemaVersion: 1,
    source: 'pi-subagents',
    availability: 'unavailable',
    freshness: 'unknown',
    observedAt: null,
    otherObservationCount: 0,
    truncated: false,
    warnings: [],
    nodes: [],
  });
  assert.equal(get.text.includes(privateRoot), false);
  assert.equal(get.text.includes('PRIVATE_ROOT_PATH_MARKER'), false);

  const head = await request(server, 'HEAD');
  assert.equal(head.response.status, 200);
  assert.equal(head.text, '');
  const post = await request(server, 'POST');
  assert.equal(post.response.status, 405);
  assert.equal(post.response.headers.get('allow'), 'GET, HEAD');
});

test('without explicit Pi roots the existing ledger fallback is used and live GET does not create ledger state', async (t) => {
  const directory = temporaryDirectory();
  const dbPath = path.join(directory, 'ledger.db');
  const unconfiguredRoot = path.join(directory, 'root-that-must-not-be-discovered');
  fs.mkdirSync(unconfiguredRoot);
  writeStatus(unconfiguredRoot, 'run', status('PRIVATE_UNCONFIGURED_NATIVE_ID', { lastActivityAt: 999 }));

  const emptyServer = await start(t, { directory, dbPath, now: () => 1000 });
  assert.equal(fs.existsSync(dbPath), false, 'server construction does not open the ledger');
  const empty = await request(emptyServer, 'GET');
  assert.equal(empty.response.status, 200);
  assert.equal(JSON.parse(empty.text).availability, 'unavailable');
  assert.equal(empty.text.includes('PRIVATE_UNCONFIGURED_NATIVE_ID'), false, 'no implicit root is scanned');

  const store = createPiIngestionStore({ dbPath, migrationsDir: MIGRATIONS_DIR, now: () => 1000 });
  try {
    assert.equal(store.getSnapshot('PRIVATE_UNCONFIGURED_NATIVE_ID'), null, 'GET does not persist a live snapshot');
    assert.equal(store.getCursor('PRIVATE_UNCONFIGURED_NATIVE_ID'), null, 'GET does not persist a live cursor');
    assert.deepEqual(store.listEvents('PRIVATE_UNCONFIGURED_NATIVE_ID'), [], 'GET does not persist live events');
    store.commitObservation({
      snapshot: {
        schemaVersion: 1,
        source: 'pi-subagents',
        observedAt: 50,
        root: {
          nativeId: 'ledger-only-native-id', parentNativeId: null, kind: 'root', sourceState: 'running',
          lifecycle: 'running', agent: 'ledger-worker', phase: null, label: null, mode: null,
          attention: null, activity: 'coding', startedAt: 40, endedAt: null, lastActivityAt: 50,
          model: null, usage: null,
        },
        children: [], truncated: { depth: false, count: false }, warnings: [],
      },
      events: [],
      cursor: { version: 1, fileKey: 'b'.repeat(64), offset: 0 },
    });
  } finally {
    store.close();
  }

  const fallback = await request(emptyServer, 'GET');
  assert.equal(fallback.response.status, 200);
  const body = JSON.parse(fallback.text);
  assert.equal(body.availability, 'ready');
  assert.equal(body.nodes[0].role, 'ledger-worker');
});
