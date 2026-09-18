// RF-K01b3c: teste sintetice pentru reader-ul Pi Mission și store-ul privat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scanPiSubagentsMissions, createPiMissionsStore } = require('../pi-missions.js');
const { projectPiKingdom } = require('../pi-kingdom.js');
const { openDatabase, MIGRATIONS_DIR } = require('../db.js');

const temporaryDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01b3c-'));
const databasePath = (directory) => path.join(directory, 'missions.db');
const remove = (directory) => fs.rmSync(directory, { recursive: true, force: true });
const runHash = (nativeId) => crypto.createHash('sha256').update(`rpgfactory:pi-kingdom:v1\0${nativeId}`, 'utf8').digest('hex');
const storeFor = (directory, now = () => 1000) => createPiMissionsStore({ dbPath: databasePath(directory), migrationsDir: MIGRATIONS_DIR, now });

function mission(id = 'mission-one', changes = {}) {
  return {
    schemaVersion: 1, id, status: 'active', title: 'synthetic title', objective: 'synthetic objective',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    goal: { status: 'active' }, usage: { tokens: 7 },
    runs: [{ runId: 'native-run-one', mode: 'workflow', status: 'running', startedAt: '2026-01-01T00:00:00.000Z', usage: { tokens: 4 } }],
    decisions: [{ id: 'decision-one', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' }],
    artifacts: [{ kind: 'patch', path: path.resolve('synthetic-proof.patch') }],
    receipts: [{ kind: 'ci', status: 'succeeded', url: 'https://example.invalid/synthetic-receipt' }],
    ...changes
  };
}
function writeMission(root, value, name = `${value.id}.json`) {
  fs.writeFileSync(path.join(root, name), JSON.stringify(value));
}
function scan(root, extra = {}) {
  const result = scanPiSubagentsMissions({ root, ...extra });
  assert.equal(result.ok, true);
  return result.value;
}
function privateFree(value, markers) {
  const output = JSON.stringify(value);
  for (const marker of markers) assert.equal(output.includes(marker), false, `private marker leaked: ${marker}`);
}
function publicScan(value) {
  return { schemaVersion: value.schemaVersion, source: value.source, observedAt: value.observedAt, missions: value.missions, truncated: value.truncated, warnings: value.warnings };
}
function pawnProjection(nativeId) {
  return projectPiKingdom([{ storedAt: 100, snapshot: {
    schemaVersion: 1, source: 'pi-subagents', observedAt: 100,
    root: { nativeId, kind: 'root', lifecycle: 'running', agent: null, activity: null, startedAt: 1, lastActivityAt: 2 },
    children: [], truncated: { depth: false, count: false }, warnings: []
  } }], { now: 100 });
}

test('factory-ul respinge exact opțiunile invalide, iar store-ul rămâne lazy și se închide idempotent', () => {
  const directory = temporaryDirectory(); const db = databasePath(directory);
  try {
    for (const options of [null, 'bad', {}, { root: 'relative' }, { root: directory, unknown: true }, { root: directory, observedAt: -1 }, { root: directory, maxMissions: 0 }, { root: directory, maxMissions: 1001 }, { root: directory, maxRunsPerMission: 1.5 }, { root: directory, maxProofsPerMission: -1 }, { root: directory, maxMissionBytes: 4 * 1024 * 1024 + 1 }]) {
      assert.deepEqual(scanPiSubagentsMissions(options), { ok: false, error: { code: 'INVALID_OPTIONS' } });
    }
    const store = storeFor(directory);
    assert.equal(fs.existsSync(db), false);
    store.close(); store.close();
    assert.equal(fs.existsSync(db), false);
  } finally { remove(directory); }
});

test('scanul complet proiectează exact contractul allowlisted, sortat și corelat cu Pawn', () => {
  const directory = temporaryDirectory();
  try {
    writeMission(directory, mission('z-last'));
    writeMission(directory, mission('a-first', { runs: [{ runId: 'native-run-one', mode: 'workflow', status: 'unrecognised', startedAt: '2026-01-01T00:00:00.000Z' }] }));
    const value = scan(directory, { observedAt: 99 });
    assert.deepEqual(value.missions.map((item) => item.projection.id).length, 2);
    assert.equal(value.observedAt, 99);
    assert.deepEqual(Object.keys(value.missions[0].projection).sort(), ['createdAt', 'goalStatus', 'id', 'openDecisionCount', 'proofs', 'runs', 'schemaVersion', 'source', 'status', 'updatedAt', 'usageTokens']);
    const projected = value.missions.find((item) => item.projection.runs[0].status === null).projection;
    assert.equal(projected.runs[0].id, pawnProjection('native-run-one').nodes[0].id);
    assert.equal(projected.runs[0].id, runHash('native-run-one'));
    assert.equal(JSON.stringify(publicScan(value)).includes('native-run-one'), false);
  } finally { remove(directory); }
});

test('câmpurile ostile private și targeturile nu ies prin scan, warnings, rezultate sau listare', () => {
  const directory = temporaryDirectory(); const marker = 'SYNTHETIC_PRIVATE_MISSION_MARKER'; let store;
  try {
    const hostile = mission('private-mission', {
      title: marker, objective: marker, task: marker, prompt: marker, message: marker, summary: marker, output: marker,
      error: marker, description: marker, labels: [marker], acceptance: marker, cwd: marker, ownerSessionId: marker,
      asyncDir: marker, sessionPath: marker, artifactPaths: [marker], heartbeat: marker, unknown: marker,
      artifacts: [{ kind: 'patch', path: path.resolve(marker) }], receipts: [{ kind: 'ci', status: 'succeeded', url: `https://example.invalid/${marker}` }]
    });
    writeMission(directory, hostile);
    const value = scan(directory); const committed = value.missions[0];
    privateFree({
      schemaVersion: value.schemaVersion, source: value.source, observedAt: value.observedAt,
      missions: value.missions.map((item) => item.projection), truncated: value.truncated, warnings: value.warnings
    }, [marker, hostile.id]);
    assert.equal(JSON.stringify(committed.proofTargets).includes(marker), true);
    store = storeFor(directory); const result = store.commitScan(value);
    privateFree(result, [marker]); privateFree(store.listMissionProjections(), [marker]);
    const forged = structuredClone(value); forged.missions[0].projection.privateMarker = marker;
    assert.throws(() => store.commitScan(forged), (error) => error.code === 'VALIDATION' && !error.message.includes(marker));
    assert.deepEqual(Object.keys(store).sort(), ['close', 'commitScan', 'listMissionProjections']);
    const handle = openDatabase({ path: databasePath(directory), migrationsDir: MIGRATIONS_DIR });
    try {
      const target = handle.db.prepare('SELECT target_value FROM pi_mission_proof_targets').all().map((row) => row.target_value).join('|');
      assert.equal(target.includes(marker), true);
    } finally { handle.close(); }
    assert.equal(committed.proofTargets.length, 2);
  } finally { store?.close(); remove(directory); }
});

test('root/candidate invalid, symlink și filename mismatch sunt izolate fără path sau eroare brută', (t) => {
  const directory = temporaryDirectory();
  try {
    const missing = path.join(directory, 'missing-root');
    assert.deepEqual(scan(missing).warnings, ['ROOT_UNAVAILABLE']);
    const notDirectory = path.join(directory, 'file'); fs.writeFileSync(notDirectory, 'x');
    assert.deepEqual(scan(notDirectory).warnings, ['ROOT_REJECTED']);
    writeMission(directory, mission('wrong-name'), 'other.json'); fs.writeFileSync(path.join(directory, 'invalid.json'), '{');
    const link = path.join(directory, 'linked.json');
    try { fs.symlinkSync(path.join(directory, 'invalid.json'), link, 'file'); }
    catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        t.skip(`symlink creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    const value = scan(directory);
    assert.ok(value.warnings.includes('MISSION_NAME_MISMATCH'));
    assert.ok(value.warnings.includes('MISSION_JSON_INVALID'));
    privateFree(value, [directory, 'other.json', 'invalid.json']);
  } finally { remove(directory); }
});

test('bugetele consumă candidatul înainte de parsare, trunchează proofs înainte de validare și deduplică warnings', () => {
  const directory = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(directory, 'a-invalid.json'), '{');
    writeMission(directory, mission('b-valid'));
    const capped = scan(directory, { maxMissions: 1 });
    assert.equal(capped.missions.length, 0); assert.equal(capped.truncated.missions, true);
    const proofs = [{ kind: 'patch', path: path.resolve('one.patch') }, { kind: 'patch', path: path.resolve('two.patch') }, { kind: 'bad', path: 'bad\u0000after-limit' }];
    writeMission(directory, mission('proof-limit', { artifacts: proofs, receipts: [] }));
    const value = scan(directory, { maxProofsPerMission: 2 });
    const limited = value.missions.find((item) => item.projection.proofs.length === 2);
    assert.ok(limited); assert.equal(value.truncated.proofs, true); assert.equal(value.warnings.filter((code) => code === 'PROOF_INVALID').length, 0);
    for (let i = 0; i < 20; i += 1) writeMission(directory, mission(`invalid-${i}`, { runs: [{ runId: '', mode: 'bad' }], decisions: [], artifacts: [], receipts: [] }));
    const warned = scan(directory, { maxMissions: 100 });
    assert.equal(warned.warnings.filter((code) => code === 'RUN_INVALID').length, 1);
  } finally { remove(directory); }
});

test('bugetul proof consumă candidatul invalid înainte de validare, inclusiv între artifacts și receipts', () => {
  const directory = temporaryDirectory();
  try {
    writeMission(directory, mission('proof-candidate-budget', {
      artifacts: [
        { kind: 'invalid-kind', path: 'relative-invalid-first' },
        { kind: 'patch', path: path.resolve('valid-must-not-be-projected.patch') }
      ],
      receipts: [{ kind: 'ci', status: 'invalid-status', url: 'ftp://example.invalid/must-not-warn' }]
    }));
    const value = scan(directory, { maxProofsPerMission: 1 });
    assert.equal(value.missions.length, 1);
    assert.deepEqual(value.missions[0].projection.proofs, []);
    assert.equal(value.truncated.proofs, true);
    assert.equal(value.warnings.filter((code) => code === 'PROOF_INVALID').length, 1);
  } finally { remove(directory); }
});

test('validarea strictă clasifică surse invalide, păstrează duplicate proof o singură dată și nu inventează usage', () => {
  const directory = temporaryDirectory();
  try {
    const duplicate = { kind: 'patch', path: path.resolve('duplicate.patch') };
    writeMission(directory, mission('dedupe', { usage: undefined, artifacts: [duplicate, duplicate], receipts: [] }));
    writeMission(directory, mission('invalid-source', { status: 'invented', createdAt: 'bad', artifacts: [{ kind: 'patch', path: 'relative' }], receipts: [{ kind: 'ci', status: 'bad', url: 'ftp://example.invalid' }] }));
    const value = scan(directory);
    const valid = value.missions.find((item) => item.projection.proofs.length === 1).projection;
    assert.equal(valid.usageTokens, null); assert.equal(valid.proofs.length, 1);
    assert.ok(value.warnings.includes('MISSION_INVALID'));
  } finally { remove(directory); }
});

test('migrarea 006 este aditivă și CHECK-urile sunt testate cu FK valid', () => {
  const directory = temporaryDirectory(); let store;
  try {
    store = storeFor(directory); store.commitScan(scan(directory)); store.close();
    const handle = openDatabase({ path: databasePath(directory), migrationsDir: MIGRATIONS_DIR });
    try {
      const applied = handle.db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map((row) => row.name);
      assert.ok(applied.includes('001-profiluri.sql') && applied.includes('006-pi-missions.sql'));
      for (const table of ['pi_missions', 'pi_mission_proof_targets']) assert.ok(handle.db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.pk === 1));
      assert.ok(handle.db.prepare("PRAGMA foreign_key_list('pi_mission_proof_targets')").all().some((row) => row.table === 'pi_missions'));
      const id = 'a'.repeat(64); handle.db.prepare("INSERT INTO pi_missions VALUES (?, ?, '{}', 1, 1, 1, 1)").run(id, 'b'.repeat(64));
      assert.throws(() => handle.db.prepare("INSERT INTO pi_mission_proof_targets VALUES (?, ?, 'artifact', 'patch', NULL, 'other', 'x', 1, 1)").run('c'.repeat(64), id));
      assert.throws(() => handle.db.prepare("INSERT INTO pi_mission_proof_targets VALUES (?, ?, 'artifact', 'patch', NULL, 'path', '', 1, 1)").run('d'.repeat(64), id));
      assert.ok(handle.db.prepare("PRAGMA index_list('pi_missions')").all().some((row) => row.name === 'idx_pi_missions_updated_id'));
    } finally { handle.close(); }
  } finally { store?.close(); remove(directory); }
});

test('commit, replay, restart, listare deterministă și scan gol păstrează istoricul', () => {
  const directory = temporaryDirectory(); let store;
  try {
    writeMission(directory, mission('first', { updatedAt: '2026-01-03T00:00:00.000Z' })); writeMission(directory, mission('second'));
    store = storeFor(directory); const initial = scan(directory); const first = store.commitScan(initial);
    assert.deepEqual(first.missions, { inserted: 2, updated: 0, unchanged: 0 });
    assert.deepEqual(store.commitScan(initial).missions, { inserted: 0, updated: 0, unchanged: 2 });
    const listed = store.listMissionProjections(); assert.ok(listed[0].updatedAt >= listed[1].updatedAt);
    store.close(); store = storeFor(directory); assert.equal(store.listMissionProjections().length, 2);
    assert.deepEqual(store.commitScan({ ...initial, missions: [] }).missions, { inserted: 0, updated: 0, unchanged: 0 });
    assert.equal(store.listMissionProjections().length, 2);
  } finally { store?.close(); remove(directory); }
});

test('update-ul înlocuiește exact targeturile și păstrează created_at', () => {
  const directory = temporaryDirectory(); let store;
  try {
    writeMission(directory, mission('replace')); store = storeFor(directory, () => 1000); const initial = scan(directory); store.commitScan(initial);
    const id = initial.missions[0].projection.id;
    const raw = openDatabase({ path: databasePath(directory), migrationsDir: MIGRATIONS_DIR }); let inserted;
    try { inserted = raw.db.prepare('SELECT created_at, updated_at FROM pi_missions WHERE id = ?').get(id); } finally { raw.close(); }
    assert.equal(inserted.created_at, 1000);
    assert.equal(inserted.updated_at, 1000);
    writeMission(directory, mission('replace', { updatedAt: '2026-01-04T00:00:00.000Z', artifacts: [{ kind: 'review', path: path.resolve('new-proof') }], receipts: [] }));
    const changed = scan(directory); assert.deepEqual(store.commitScan(changed).missions, { inserted: 0, updated: 1, unchanged: 0 });
    const handle = openDatabase({ path: databasePath(directory), migrationsDir: MIGRATIONS_DIR });
    try {
      const updated = handle.db.prepare('SELECT created_at, updated_at FROM pi_missions WHERE id = ?').get(id);
      assert.equal(updated.created_at, 1000);
      assert.equal(updated.updated_at, 1001);
      assert.equal(handle.db.prepare('SELECT count(*) AS count FROM pi_mission_proof_targets WHERE mission_id = ?').get(id).count, 1);
    } finally { handle.close(); }
  } finally { store?.close(); remove(directory); }
});

test('rollback-ul SQLite și scan falsificat nu mută starea și nu expun erori private', () => {
  const directory = temporaryDirectory(); let store;
  try {
    writeMission(directory, mission('atomic')); store = storeFor(directory); const initial = scan(directory); store.commitScan(initial);
    const raw = openDatabase({ path: databasePath(directory), migrationsDir: MIGRATIONS_DIR });
    try { raw.db.exec("CREATE TRIGGER reject_mission BEFORE UPDATE ON pi_missions BEGIN SELECT RAISE(ABORT, 'synthetic-private-trigger'); END;"); } finally { raw.close(); }
    writeMission(directory, mission('atomic', { updatedAt: '2026-01-04T00:00:00.000Z' }));
    assert.throws(() => store.commitScan(scan(directory)), (error) => error.code === 'PERSISTENCE' && !error.message.includes('synthetic-private-trigger'));
    assert.equal(store.listMissionProjections()[0].updatedAt, initial.missions[0].projection.updatedAt);
    const forged = structuredClone(initial); forged.missions[0].projection.unknown = 'private';
    assert.throws(() => store.commitScan(forged), (error) => error.code === 'VALIDATION' && !error.message.includes('private'));
  } finally { store?.close(); remove(directory); }
});

test('store-ul respinge exactness ostilă: chei necunoscute, refs invalide și colecții peste hard limit', () => {
  const directory = temporaryDirectory(); let store;
  try {
    writeMission(directory, mission('strict')); const value = scan(directory); store = storeFor(directory);
    const cases = [];
    const unknown = structuredClone(value); unknown.unknown = true; cases.push(unknown);
    const mismatch = structuredClone(value); mismatch.missions[0].proofTargets[0].ref = '0'.repeat(64); cases.push(mismatch);
    const incompatibleTarget = structuredClone(value); incompatibleTarget.missions[0].proofTargets[0].targetType = 'url'; cases.push(incompatibleTarget);
    const duplicate = structuredClone(value); duplicate.missions[0].projection.proofs.push(structuredClone(duplicate.missions[0].projection.proofs[0])); duplicate.missions[0].proofTargets.push(structuredClone(duplicate.missions[0].proofTargets[0])); cases.push(duplicate);
    const duplicateWarnings = structuredClone(value); duplicateWarnings.warnings = ['MISSION_INVALID', 'MISSION_INVALID']; cases.push(duplicateWarnings);
    const large = structuredClone(value); large.missions = Array.from({ length: 1001 }, () => structuredClone(value.missions[0])); cases.push(large);
    for (const forged of cases) assert.throws(() => store.commitScan(forged), (error) => error.code === 'VALIDATION');
    let warningGetterAccessed = false;
    const oversizedWarnings = new Array(12);
    Object.defineProperty(oversizedWarnings, 0, { get() { warningGetterAccessed = true; throw new Error('hostile warning getter'); } });
    const oversizedWarningsValue = { ...value, warnings: oversizedWarnings };
    assert.throws(() => store.commitScan(oversizedWarningsValue), (error) => error.code === 'VALIDATION');
    assert.equal(warningGetterAccessed, false);
    assert.deepEqual(store.listMissionProjections(), []);
  } finally { store?.close(); remove(directory); }
});
