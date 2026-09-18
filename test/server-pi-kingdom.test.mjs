import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer, startServer } = require('../server.js');
const { createPiIngestionStore } = require('../pi-ingestion.js');
const { MIGRATIONS_DIR } = require('../db.js');

function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01c-server-')); }
function snapshot(nativeId = 'pi-native-root') {
  const root = { nativeId, parentNativeId: null, kind: 'root', sourceState: 'running', lifecycle: 'running', agent: 'planner', phase: null, label: null, mode: 'single', attention: null, activity: 'coordinating', startedAt: 1, endedAt: null, lastActivityAt: 2, model: null, usage: { input: 1, output: 1 } };
  return { schemaVersion: 1, source: 'pi-subagents', observedAt: 100, root, children: [], truncated: { depth: false, count: false }, warnings: [] };
}
function cursor() { return { version: 1, fileKey: 'a'.repeat(64), offset: 0 }; }

async function request(server, method, route) {
  const url = `http://127.0.0.1:${server.port}${route}`;
  const response = await fetch(url, { method, headers: { Origin: `http://127.0.0.1:${server.port}` } });
  return { response, text: await response.text() };
}

test('endpoint Pi este lazy, unavailable fără ledger și respectă GET/HEAD/405', async () => {
  const dir = temp(); const dbPath = path.join(dir, 'kingdom.db');
  let created;
  try {
    created = createServer({ dbPath, migrationsDir: MIGRATIONS_DIR, dataDir: path.join(dir, 'data'), sessionsDir: path.join(dir, 'sessions'), opener: () => {} });
    assert.equal(fs.existsSync(dbPath), false, 'importul și construcția nu deschid ledger-ul');
    const server = await startServer({ port: 0, host: '127.0.0.1', dbPath, migrationsDir: MIGRATIONS_DIR, dataDir: path.join(dir, 'data'), sessionsDir: path.join(dir, 'sessions'), opener: () => {} });
    try {
      const get = await request(server, 'GET', '/api/pi/kingdom');
      assert.equal(get.response.status, 200);
      assert.deepEqual(JSON.parse(get.text).nodes, []);
      assert.equal(JSON.parse(get.text).availability, 'unavailable');
      const head = await request(server, 'HEAD', '/api/pi/kingdom');
      assert.equal(head.response.status, 200); assert.equal(head.text, '');
      const post = await request(server, 'POST', '/api/pi/kingdom');
      assert.equal(post.response.status, 405); assert.equal(post.response.headers.get('allow'), 'GET, HEAD');
    } finally { await server.close(); }
  } finally { if (created) await new Promise((resolve) => created.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('endpoint proiectează numai snapshotul Pi persistat și close eliberează handle-ul', async () => {
  const dir = temp(); const dbPath = path.join(dir, 'kingdom.db');
  const store = createPiIngestionStore({ dbPath, migrationsDir: MIGRATIONS_DIR, now: () => 200 });
  try {
    store.commitObservation({ snapshot: snapshot(), events: [], cursor: cursor() });
    store.close();
    const server = await startServer({ port: 0, host: '127.0.0.1', dbPath, migrationsDir: MIGRATIONS_DIR, dataDir: path.join(dir, 'data'), sessionsDir: path.join(dir, 'sessions'), opener: () => {} });
    try {
      const get = await request(server, 'GET', '/api/pi/kingdom');
      assert.equal(get.response.status, 200);
      const body = JSON.parse(get.text);
      assert.equal(body.availability, 'ready');
      assert.equal(body.nodes.length, 1);
      assert.equal(JSON.stringify(body).includes('pi-native-root'), false);
      assert.equal(JSON.stringify(body).includes('kingdom.db'), false);
    } finally { await server.close(); }
    fs.unlinkSync(dbPath);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
