import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { projectPiMissionBoard } = require('../pi-mission-board.js');

const hex = (digit) => digit.repeat(64);

function node(id, changes = {}) {
  return {
    id, parentId: null, relation: 'coordinator', depth: 0, rank: 'coordinator', role: 'planner',
    lifecycle: 'running', attention: null, activity: 'coordinating', startedAt: 10,
    lastActivityAt: 20, active: true, ...changes,
  };
}

function kingdom(nodes = [node(hex('a'))], changes = {}) {
  return {
    schemaVersion: 1, source: 'pi-subagents', availability: 'ready', freshness: 'fresh',
    observedAt: 20, otherObservationCount: 0, truncated: false, warnings: [], nodes, ...changes,
  };
}

function run(id, changes = {}) {
  return { id, mode: 'workflow', status: 'completed', startedAt: 10, completedAt: 20, usageTokens: 3, ...changes };
}

function proof(ref, changes = {}) {
  return { ref, source: 'artifact', kind: 'patch', status: null, ...changes };
}

function projection(id, changes = {}) {
  return {
    schemaVersion: 1, source: 'pi-subagents-mission', id, status: 'active', createdAt: 1,
    updatedAt: 100, goalStatus: 'active', usageTokens: 7, openDecisionCount: 1,
    runs: [], proofs: [], ...changes,
  };
}

function scan(items, changes = {}) {
  return { ok: true, value: {
    schemaVersion: 1, source: 'pi-subagents-missions', observedAt: 999,
    missions: items, truncated: { missions: false, runs: false, proofs: false }, warnings: [], ...changes,
  } };
}

function item(value, proofTargets = []) { return { projection: value, proofTargets }; }

const exactBoardKeys = ['schemaVersion', 'source', 'observedAt', 'missionAvailability', 'truncated', 'warnings', 'kingdom', 'missions'].sort();
const exactMissionKeys = ['id', 'status', 'createdAt', 'updatedAt', 'goalStatus', 'usageTokens', 'openDecisionCount', 'runs', 'handoffs', 'proofs'].sort();
const exactRunKeys = ['id', 'mode', 'status', 'startedAt', 'completedAt', 'usageTokens', 'linked', 'role'].sort();

test('proiectează contractul exact, sortează updatedAt DESC/id ASC și derivă observedAt numai din misiuni', () => {
  const first = projection(hex('1'), { updatedAt: 300 });
  const tiedA = projection(hex('2'), { updatedAt: 200 });
  const tiedB = projection(hex('3'), { updatedAt: 200 });
  const value = projectPiMissionBoard(kingdom(), scan([item(tiedB), item(first), item(tiedA)], { observedAt: 987654 }), { configured: true });

  assert.deepEqual(Object.keys(value).sort(), exactBoardKeys);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.source, 'rpgfactory-pi-mission-board');
  assert.equal(value.missionAvailability, 'ready');
  assert.equal(value.observedAt, 300, 'request/scan time must not replace source mission updatedAt');
  assert.deepEqual(value.missions.map((mission) => mission.id), [first.id, tiedA.id, tiedB.id]);
  assert.ok(value.missions.every((mission) => assert.deepEqual(Object.keys(mission).sort(), exactMissionKeys) === undefined));
});

test('corelează run-ul numai prin ID opac comun și ia rolul exclusiv din kingdom node', () => {
  const linkedId = hex('a');
  const unlinkedId = hex('b');
  const sourceRun = run(linkedId);
  const value = projectPiMissionBoard(
    kingdom([node(linkedId, { role: 'reviewer' })]),
    scan([item(projection(hex('1'), { runs: [sourceRun, run(unlinkedId)] }))]),
    { configured: true },
  );

  assert.deepEqual(Object.keys(value.missions[0].runs[0]).sort(), exactRunKeys);
  assert.equal(value.missions[0].runs[0].linked, true);
  assert.equal(value.missions[0].runs[0].role, 'reviewer');
  assert.equal(value.missions[0].runs[1].linked, false);
  assert.equal(value.missions[0].runs[1].role, null);
  assert.equal(value.missions[0].runs[0].role, 'reviewer');
});

test('creează handoff numai pentru run-uri consecutive corelate și temporal neambigue', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map(hex);
  const nodes = ids.map((id, index) => node(id, index === 0 ? {} : { parentId: ids[0], relation: 'direct', rank: 'direct', depth: 1, role: `worker-${index}` }));
  const positive = projectPiMissionBoard(kingdom(nodes), scan([item(projection(hex('1'), { runs: [
    run(ids[0], { completedAt: 20 }), run(ids[1], { startedAt: 20, completedAt: 30 }),
  ] }))]), { configured: true });
  assert.deepEqual(positive.missions[0].handoffs, [{ fromRunId: ids[0], toRunId: ids[1], at: 20, basis: 'temporal_sequence' }]);

  const negativeRuns = [
    run(ids[0], { completedAt: null }), run(ids[1], { startedAt: 21, completedAt: 30 }),
    run(ids[2], { completedAt: 50 }), run(ids[3], { startedAt: 49, completedAt: 60 }),
    run(hex('9'), { completedAt: 70 }), run(ids[5], { startedAt: 71, completedAt: 80 }),
  ];
  const negative = projectPiMissionBoard(kingdom(nodes), scan([item(projection(hex('2'), { runs: negativeRuns }))]), { configured: true });
  assert.deepEqual(negative.missions[0].handoffs, [], 'missing timestamp, overlap and unlinked adjacency remain unconfirmed');
});

test('zero proof rămâne zero, iar N proofs păstrează exact metadata allowlisted', () => {
  const empty = projectPiMissionBoard(kingdom(), scan([item(projection(hex('1')))]), { configured: true });
  assert.deepEqual(empty.missions[0].proofs, []);

  const proofs = [proof(hex('4')), proof(hex('5'), { source: 'receipt', kind: 'ci', status: 'succeeded' })];
  const value = projectPiMissionBoard(kingdom(), scan([item(projection(hex('2'), { proofs }), [
    { ref: hex('4'), targetType: 'path', target: 'PRIVATE_PATH' },
    { ref: hex('5'), targetType: 'url', target: 'https://PRIVATE_URL.invalid' },
  ])]), { configured: true });
  assert.equal(value.missions[0].proofs.length, 2);
  assert.deepEqual(value.missions[0].proofs, proofs);
  assert.deepEqual(Object.keys(value.missions[0].proofs[0]).sort(), ['kind', 'ref', 'source', 'status']);
});

test('nu expune targeturi, path/URL, markeri nativi, texte private sau chei suplimentare nicăieri', () => {
  const markers = ['PRIVATE_PATH', 'PRIVATE_URL', 'PRIVATE_NATIVE', 'PRIVATE_TITLE', 'PRIVATE_TASK', 'PRIVATE_PROMPT', 'PRIVATE_OUTPUT', 'PRIVATE_ERROR', 'PRIVATE_EXTRA'];
  const source = projection(hex('1'), {
    title: 'PRIVATE_TITLE', task: 'PRIVATE_TASK', prompt: 'PRIVATE_PROMPT', output: 'PRIVATE_OUTPUT', error: 'PRIVATE_ERROR', extra: 'PRIVATE_EXTRA',
    runs: [run(hex('a'), { nativeId: 'PRIVATE_NATIVE' })], proofs: [proof(hex('4'), { path: 'PRIVATE_PATH', url: 'PRIVATE_URL', extra: 'PRIVATE_EXTRA' })],
  });
  const value = projectPiMissionBoard(kingdom(), scan([item(source, [{ ref: hex('4'), targetType: 'path', target: 'PRIVATE_PATH' }])]), { configured: true });
  const json = JSON.stringify(value);
  for (const marker of markers) assert.equal(json.includes(marker), false, `leaked ${marker}`);
  for (const forbiddenKey of ['proofTargets', 'path', 'url', 'nativeId', 'title', 'task', 'prompt', 'output', 'error', 'extra']) assert.equal(json.includes(`"${forbiddenKey}"`), false);
});

test('configured false, scan eșuat, ROOT și input invalid/oversized devin unavailable bounded', () => {
  const validKingdom = kingdom();
  const cases = [
    projectPiMissionBoard(validKingdom, scan([]), { configured: false }),
    projectPiMissionBoard(validKingdom, { ok: false, error: { code: 'PRIVATE_ERROR' } }, { configured: true }),
    projectPiMissionBoard(validKingdom, scan([], { warnings: ['ROOT_UNAVAILABLE'] }), { configured: true }),
    projectPiMissionBoard(validKingdom, scan([], { warnings: ['ROOT_REJECTED'] }), { configured: true }),
    projectPiMissionBoard(validKingdom, scan([item(projection('not-hex'))]), { configured: true }),
    projectPiMissionBoard(validKingdom, scan([], { missions: new Array(201).fill(item(projection(hex('1')))) }), { configured: true }),
  ];
  for (const value of cases) {
    assert.equal(value.missionAvailability, 'unavailable');
    assert.deepEqual(value.missions, []);
    assert.equal(value.observedAt, null);
    assert.deepEqual(Object.keys(value).sort(), exactBoardKeys);
    assert.ok(value.warnings.length <= 11);
    assert.equal(JSON.stringify(value).includes('PRIVATE_ERROR'), false);
  }
});

test('input ostil rezonabil nu aruncă, nu citește targeturi și nu ecouă secrete', () => {
  let targetRead = false;
  const targets = [];
  Object.defineProperty(targets, 0, { enumerable: true, get() { targetRead = true; throw new Error('PRIVATE_GETTER_SECRET'); } });
  targets.length = 1;
  const hostile = item(projection(hex('1'), { proofs: [proof(hex('4'))] }), targets);
  let value;
  assert.doesNotThrow(() => { value = projectPiMissionBoard(kingdom(), scan([hostile]), { configured: true }); });
  assert.equal(targetRead, false, 'private proof target entries must never be read');
  assert.equal(value.missions.length, 1);
  assert.equal(JSON.stringify(value).includes('PRIVATE_GETTER_SECRET'), false);

  const oversizedWarnings = new Array(12);
  Object.defineProperty(oversizedWarnings, 0, { get() { throw new Error('PRIVATE_WARNING_GETTER'); } });
  assert.doesNotThrow(() => { value = projectPiMissionBoard(kingdom(), scan([], { warnings: oversizedWarnings }), { configured: true }); });
  assert.equal(value.missionAvailability, 'unavailable');
});

test('warnings publice sunt allowlisted, bounded și deduplicate', () => {
  const warnings = ['MISSION_INVALID', 'MISSION_INVALID', 'RUN_INVALID', 'PROOF_INVALID'];
  const value = projectPiMissionBoard(kingdom(), scan([], { warnings }), { configured: true });
  assert.deepEqual(value.warnings, ['MISSION_INVALID', 'RUN_INVALID', 'PROOF_INVALID']);
  assert.equal(new Set(value.warnings).size, value.warnings.length);

  const privateWarning = projectPiMissionBoard(kingdom(), scan([], { warnings: ['PRIVATE_WARNING'] }), { configured: true });
  assert.equal(privateWarning.missionAvailability, 'unavailable');
  assert.deepEqual(privateWarning.warnings, []);
  assert.equal(JSON.stringify(privateWarning).includes('PRIVATE_WARNING'), false);
});
