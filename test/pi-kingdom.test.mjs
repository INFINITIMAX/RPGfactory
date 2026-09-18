import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { projectPiKingdom } = require('../pi-kingdom.js');

function node(nativeId, parentNativeId, kind = 'step', extra = {}) {
  return { nativeId, parentNativeId, kind, lifecycle: 'running', attention: null, agent: 'coder', activity: 'coding', startedAt: 1, lastActivityAt: 2, ...extra };
}
function observation(rootId = 'native-root', children = [], extra = {}) {
  return { snapshot: { schemaVersion: 1, source: 'pi-subagents', observedAt: 100, root: node(rootId, null, 'root', { agent: 'planner' }), children, ...extra }, storedAt: 90 };
}

test('proiecția goală sau invalidă rămâne unavailable fără noduri inventate', () => {
  for (const input of [undefined, [], [null], [{ snapshot: { private: 'secret' } }]]) {
    const value = projectPiKingdom(input, { now: 100 });
    assert.equal(value.availability, 'unavailable');
    assert.deepEqual(value.nodes, []);
  }
});

test('alege determinist observația cea mai recentă, cu fallback storedAt și numără restul', () => {
  const older = observation('older', [], { observedAt: 20 });
  const fallback = observation('fallback', [], { observedAt: undefined }); fallback.storedAt = 30;
  const tieA = observation('tie-a', [], { observedAt: 40 });
  const tieB = observation('tie-b', [], { observedAt: 40 });
  const once = projectPiKingdom([older, fallback, tieA, tieB], { now: 40 });
  const twice = projectPiKingdom([tieB, fallback, older, tieA], { now: 40 });
  assert.equal(once.observedAt, 40);
  assert.equal(once.otherObservationCount, 3);
  assert.deepEqual(once.nodes.map((entry) => entry.id), twice.nodes.map((entry) => entry.id));
});

test('outputul este allowlisted și identificatorii publici nu divulgă native sau câmpuri ostile', () => {
  const secret = 'PRIVATE-native-path-prompt-output';
  const value = projectPiKingdom([observation(secret, [node('child-' + secret, secret, 'step', { label: secret, phase: secret, model: secret, usage: { input: 3 }, private: secret })])], { now: 100 });
  assert.deepEqual(Object.keys(value).sort(), ['availability', 'freshness', 'nodes', 'observedAt', 'otherObservationCount', 'schemaVersion', 'source', 'truncated', 'warnings']);
  assert.deepEqual(Object.keys(value.nodes[0]).sort(), ['active', 'activity', 'attention', 'depth', 'id', 'lastActivityAt', 'lifecycle', 'parentId', 'rank', 'relation', 'role', 'startedAt']);
  assert.equal(JSON.stringify(value).includes(secret), false);
  assert.equal(value.nodes.some((entry) => entry.id.includes(secret) || (entry.parentId || '').includes(secret)), false);
});

test('ierarhia dovedită, orfanii și ciclurile păstrează relații oneste', () => {
  const value = projectPiKingdom([observation('root', [node('direct', 'root'), node('deep', 'direct', 'nested'), node('orphan', 'missing'), node('cycle-a', 'cycle-b'), node('cycle-b', 'cycle-a')])], { now: 100 });
  const byRole = Object.fromEntries(value.nodes.map((entry) => [entry.role === 'planner' ? 'root' : entry.id, entry]));
  const direct = value.nodes.find((entry) => entry.relation === 'direct');
  const deep = value.nodes.find((entry) => entry.relation === 'descendant');
  const unknown = value.nodes.filter((entry) => entry.relation === 'unknown');
  assert.equal(byRole.root.rank, 'coordinator');
  assert.equal(direct.depth, 1);
  assert.equal(deep.depth, 2);
  assert.equal(unknown.length, 3);
  assert.ok(unknown.every((entry) => entry.rank === 'unknown' && entry.depth === null));
});

test('freshness, lifecycle și attention rămân axe separate și numai fresh running este activ', () => {
  const children = [node('queued', 'root', 'step', { lifecycle: 'queued' }), node('paused', 'root', 'step', { lifecycle: 'paused' }), node('attention', 'root', 'step', { attention: 'needs_attention' })];
  const fresh = projectPiKingdom([observation('root', children)], { now: 100 });
  assert.equal(fresh.nodes.filter((entry) => entry.lifecycle === 'running').every((entry) => entry.active), true);
  assert.equal(fresh.nodes.filter((entry) => entry.lifecycle !== 'running').every((entry) => !entry.active), true);
  assert.equal(fresh.nodes.find((entry) => entry.attention).attention, 'needs_attention');
  const stale = projectPiKingdom([observation('root', children)], { now: 161, staleAfterMs: 60 });
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.nodes.some((entry) => entry.active), false);
  assert.equal(stale.nodes.find((entry) => entry.attention).attention, 'needs_attention');
  assert.equal(stale.nodes.find((entry) => entry.lifecycle === 'running').lifecycle, 'running');
});

test('opțiunile invalide au răspuns bounded și stabil', () => {
  for (const options of [{ now: NaN }, { now: -1 }, { staleAfterMs: Infinity }, { staleAfterMs: -1 }]) {
    const value = projectPiKingdom([], options);
    assert.deepEqual(value.warnings, ['INVALID_OPTIONS']);
    assert.equal(value.availability, 'unavailable');
  }
});

test('rolurile și activitățile sigure reale se păstrează, iar valorile ostile devin null', () => {
  const safe = projectPiKingdom([observation('root', [
    node('worker', 'root', 'step', { agent: 'worker', activity: 'read' }),
    node('delegate', 'root', 'step', { agent: 'delegate', activity: 'web_search' }),
    node('unsafe', 'root', 'step', { agent: 'x\u0000y', activity: 'edit/path' }),
  ])], { now: 100 });
  assert.deepEqual(safe.nodes.slice(1).map((entry) => [entry.role, entry.activity]).sort(), [
    ['delegate', 'web_search'], ['worker', 'read'], [null, null],
  ].sort());
  const oversized = projectPiKingdom([observation('root', [node('long', 'root', 'step', { agent: 'a'.repeat(81), activity: 'b'.repeat(81) })])], { now: 100 });
  assert.equal(oversized.nodes.find((entry) => entry.role === null).activity, null);
});

test('truncarea declarată propagă numai coduri publice allowlisted fără payload privat', () => {
  const secret = 'PRIVATE-warning-payload';
  const value = projectPiKingdom([observation('root', [], { truncated: { depth: true, count: false }, warnings: ['INVALID_USAGE', secret, { secret }] })], { now: 100 });
  assert.equal(value.truncated, true);
  assert.deepEqual(value.warnings, ['INVALID_USAGE', 'SOURCE_TRUNCATED']);
  assert.equal(JSON.stringify(value).includes(secret), false);
});

test('limita de 200 păstrează root-ul, strămoșii incluși și ordinea deterministă', () => {
  const children = Array.from({ length: 250 }, (_, index) => node(`child-${index}`, 'root'));
  const first = projectPiKingdom([observation('root', children)], { now: 100 });
  const second = projectPiKingdom([observation('root', children.slice().reverse())], { now: 100 });
  assert.equal(first.nodes.length, 200);
  assert.equal(first.nodes[0].rank, 'coordinator');
  assert.equal(first.truncated, true);
  assert.ok(first.warnings.includes('NODES_TRUNCATED'));
  assert.deepEqual(first.nodes.map((entry) => entry.id), second.nodes.map((entry) => entry.id));
  const ids = new Set(first.nodes.map((entry) => entry.id));
  assert.ok(first.nodes.every((entry) => entry.parentId === null || ids.has(entry.parentId)));
});
