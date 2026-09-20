import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startServer } = require('../server.js');
const { MIGRATIONS_DIR } = require('../db.js');

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01d-server-')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); }
function writeStatus(root, nativeId = 'run-root', changes = {}) {
  writeJson(path.join(root, 'status-run', 'status.json'), {
    runId: nativeId, state: 'running', startedAt: 100, lastActivityAt: 200,
    agent: 'planner', currentTool: 'coordinating', steps: [], ...changes,
  });
}
function mission(id = 'mission-one', changes = {}) {
  return {
    schemaVersion: 1, id, status: 'active', title: 'PRIVATE_TITLE', objective: 'PRIVATE_OBJECTIVE',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    goal: { status: 'active' }, usage: { tokens: 9 },
    runs: [{ runId: 'run-root', mode: 'workflow', status: 'completed', startedAt: '2026-01-01T01:00:00.000Z', completedAt: '2026-01-01T02:00:00.000Z', usage: { tokens: 4 } }],
    decisions: [{ id: 'decision-one', status: 'open', createdAt: '2026-01-01T01:00:00.000Z' }],
    artifacts: [{ kind: 'patch', path: path.resolve('PRIVATE_PATH_MARKER.patch') }],
    receipts: [{ kind: 'ci', status: 'succeeded', url: 'https://example.invalid/PRIVATE_URL_MARKER' }],
    ...changes,
  };
}
function writeMission(root, value) { writeJson(path.join(root, `${value.id}.json`), value); }

async function listen(t, directory, options = {}) {
  const server = await startServer({
    dataDir: path.join(directory, 'data'), sessionsDir: path.join(directory, 'sessions'),
    dbPath: path.join(directory, 'ledger.db'), migrationsDir: MIGRATIONS_DIR,
    opener: () => { throw new Error('opener must not run'); }, now: () => 300,
    port: 0, host: '127.0.0.1',
    ...options,
  });
  t.after(async () => {
    await server.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return server;
}

async function request(server, method, route = '/api/pi/mission-board') {
  const origin = `http://127.0.0.1:${server.port}`;
  const response = await fetch(`${origin}${route}`, { method, headers: { Origin: origin } });
  return { response, text: await response.text() };
}

function assertPrivateFree(text) {
  for (const marker of ['PRIVATE_TITLE', 'PRIVATE_OBJECTIVE', 'PRIVATE_PATH_MARKER', 'PRIVATE_URL_MARKER', 'run-root', 'mission-one']) {
    assert.equal(text.includes(marker), false, `private/native marker leaked: ${marker}`);
  }
  for (const key of ['proofTargets', 'path', 'url', 'nativeId', 'title', 'objective', 'prompt', 'output', 'error']) {
    assert.equal(text.includes(`"${key}"`), false, `private key leaked: ${key}`);
  }
}

test('construcția este lazy, iar root mission lipsă/relativ nu face discovery și nu citește markerul privat', async (t) => {
  const directory = temporaryDirectory();
  const undiscovered = path.join(directory, 'must-not-discover');
  fs.mkdirSync(undiscovered);
  writeMission(undiscovered, mission('hidden-mission', { title: 'PRIVATE_UNDISCOVERED_MARKER' }));
  const dbPath = path.join(directory, 'ledger.db');
  const server = await listen(t, directory, { piMissionRoot: 'relative/root', dbPath });

  assert.equal(fs.existsSync(dbPath), false, 'startServer must not create SQLite');
  const result = await request(server, 'GET');
  assert.equal(result.response.status, 200);
  const body = JSON.parse(result.text);
  assert.equal(body.missionAvailability, 'unavailable');
  assert.deepEqual(body.missions, []);
  assert.equal(result.text.includes('PRIVATE_UNDISCOVERED_MARKER'), false);
  assert.equal(result.text.includes(undiscovered), false);
  assert.equal(fs.existsSync(dbPath), false, 'mission-board GET without piRoots must not create/read the ledger');
});

test('root mission absolut explicit este scanat request-time și corelat cu kingdom live fără persistență', async (t) => {
  const directory = temporaryDirectory();
  const piRoot = path.join(directory, 'pi-root');
  const missionRoot = path.join(directory, 'mission-root');
  fs.mkdirSync(piRoot); fs.mkdirSync(missionRoot);
  writeStatus(piRoot);
  writeMission(missionRoot, mission());
  const dbPath = path.join(directory, 'ledger.db');
  const server = await listen(t, directory, { piRoots: [piRoot], piMissionRoot: missionRoot, dbPath });

  const first = await request(server, 'GET');
  assert.equal(first.response.status, 200);
  const body = JSON.parse(first.text);
  assert.equal(body.missionAvailability, 'ready');
  assert.equal(body.kingdom.availability, 'ready');
  assert.equal(body.missions.length, 1);
  assert.equal(body.missions[0].runs.length, 1);
  assert.equal(body.missions[0].runs[0].linked, true);
  assert.equal(body.missions[0].runs[0].role, 'planner');
  assert.equal(body.missions[0].proofs.length, 2);
  assert.equal(body.observedAt, Date.parse('2026-01-02T00:00:00.000Z'), 'source updatedAt, not request now');
  assertPrivateFree(first.text);
  assert.equal(first.text.includes(piRoot), false);
  assert.equal(first.text.includes(missionRoot), false);
  assert.equal(fs.existsSync(dbPath), false, 'live request does not create/write SQLite');

  writeMission(missionRoot, mission('mission-two', { updatedAt: '2026-01-03T00:00:00.000Z', artifacts: [], receipts: [] }));
  const second = JSON.parse((await request(server, 'GET')).text);
  assert.equal(second.missions.length, 2, 'scan is performed at request time, not cached');
  assert.equal(second.observedAt, Date.parse('2026-01-03T00:00:00.000Z'));
  assert.equal(fs.existsSync(dbPath), false, 'second scan also remains read-only');
});

test('root absolut lipsă sau invalid rămâne unavailable și răspunsul nu divulgă root/error', async (t) => {
  const directory = temporaryDirectory();
  const piRoot = path.join(directory, 'pi-root');
  fs.mkdirSync(piRoot); writeStatus(piRoot);
  const privateMissingRoot = path.join(directory, 'PRIVATE_MISSING_ROOT');
  const server = await listen(t, directory, { piRoots: [piRoot], piMissionRoot: privateMissingRoot });

  const result = await request(server, 'GET');
  const body = JSON.parse(result.text);
  assert.equal(body.missionAvailability, 'unavailable');
  assert.deepEqual(body.missions, []);
  assert.deepEqual(body.warnings, ['ROOT_UNAVAILABLE']);
  assert.equal(result.text.includes('PRIVATE_MISSING_ROOT'), false);
  assert.equal(result.text.includes(privateMissingRoot), false);
});

test('endpointul respectă GET/HEAD/405 și păstrează /api/pi/kingdom compatibil', async (t) => {
  const directory = temporaryDirectory();
  const piRoot = path.join(directory, 'pi-root');
  const missionRoot = path.join(directory, 'mission-root');
  fs.mkdirSync(piRoot); fs.mkdirSync(missionRoot); writeStatus(piRoot); writeMission(missionRoot, mission());
  const server = await listen(t, directory, { piRoots: [piRoot], piMissionRoot: missionRoot });

  const get = await request(server, 'GET');
  assert.equal(get.response.status, 200);
  assert.equal(get.response.headers.get('content-type'), 'application/json');
  const head = await request(server, 'HEAD');
  assert.equal(head.response.status, 200);
  assert.equal(head.text, '');
  const post = await request(server, 'POST');
  assert.equal(post.response.status, 405);
  assert.equal(post.response.headers.get('allow'), 'GET, HEAD');

  const legacy = await request(server, 'GET', '/api/pi/kingdom');
  assert.equal(legacy.response.status, 200);
  assert.deepEqual(JSON.parse(legacy.text), JSON.parse(get.text).kingdom);
});

test('mission-board fără piRoots nu creează și nu scrie ledger/store', async (t) => {
  const directory = temporaryDirectory();
  const missionRoot = path.join(directory, 'mission-root');
  fs.mkdirSync(missionRoot); writeMission(missionRoot, mission());
  const dbPath = path.join(directory, 'must-not-exist.db');
  const server = await listen(t, directory, { piMissionRoot: missionRoot, dbPath });

  assert.equal(fs.existsSync(dbPath), false);
  const result = await request(server, 'GET');
  assert.equal(result.response.status, 200);
  assert.equal(JSON.parse(result.text).missions.length, 1);
  assert.equal(fs.existsSync(dbPath), false, 'read-only mission endpoint cannot use ledger fallback as a side effect');
  assert.deepEqual(fs.readdirSync(directory).filter((name) => /mission.*\.(db|sqlite)|ledger/i.test(name)), [], 'no mission persistence file is created');
});
