// RF-K01a: contract pur pentru proiecția allowlisted a statusurilor Pi.
// Fixture-urile sunt JSON sintetic din repo; testul nu deschide sesiuni Pi,
// SQLite, rețea, server sau UI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizePiSubagentsStatus } = require('../../adapters/pi-subagents-contract.js');
const single = require('../fixtures/pi-subagents/single.json');
const workflow = require('../fixtures/pi-subagents/workflow-nested.json');
const terminal = require('../fixtures/pi-subagents/terminal.json');
const hostile = require('../fixtures/pi-subagents/hostile.json');
const limits = require('../fixtures/pi-subagents/limits.json');

function normalized(raw, options) {
  const result = normalizePiSubagentsStatus(raw, options);
  assert.equal(result.ok, true);
  return result.value;
}

function warning(value, code) {
  assert.ok(value.warnings.includes(code), `warning lipsă: ${code}`);
}

test('single synthetic: proiectează forma versionată, root separat și numai câmpurile allowlisted', () => {
  const value = normalized(single, { observedAt: 9000 });

  assert.equal(value.schemaVersion, 1);
  assert.equal(value.source, 'pi-subagents');
  assert.equal(value.observedAt, 9000);
  assert.deepEqual(value.children, []);
  assert.deepEqual(value.truncated, { depth: false, count: false });
  assert.deepEqual(value.root, {
    nativeId: 'single-root', parentNativeId: null, kind: 'root',
    sourceState: 'running', lifecycle: 'running', agent: 'planner',
    phase: 'analysis', label: 'Synthetic single run', mode: 'default',
    attention: 'needs_attention', activity: 'read', startedAt: 1000,
    endedAt: null, lastActivityAt: null, model: 'synthetic-model',
    usage: { input: 11, output: 7, total: 18, window: 128, windowPeak: 64 }
  });
});

test('workflow synthetic: folosește status/tokens la step, state/totalTokens la nested și children recursiv', () => {
  const value = normalized(workflow);

  assert.deepEqual(value.children.map((node) => [node.nativeId, node.parentNativeId, node.kind, node.lifecycle]), [
    ['step-a', 'workflow-root', 'step', 'running'],
    ['nested-a', 'step-a', 'nested', 'completed'],
    ['nested-b', 'nested-a', 'nested', 'paused'],
    ['step-b-child-id', 'workflow-root', 'step', 'queued']
  ]);
  assert.deepEqual(value.root.usage, { total: 100 });
  assert.deepEqual(value.children[0].usage, { input: 20, output: 5, total: 25 });
  assert.deepEqual(value.children[1].usage, { input: 3, output: 2, total: 5 });
  assert.deepEqual(value.children[2].usage, { total: 2 });
  assert.equal(value.children[0].attention, null);
  warning(value, 'ACTIVE_LONG_RUNNING_UNVERIFIED');

  // Aliasurile capcană nu sunt surse: state-ul step-ului e failed în fixture,
  // iar usage/nested/booleenele legacy nu pot schimba proiecția.
  assert.equal(value.children[0].sourceState, 'running');
  assert.equal(value.children.some((node) => node.nativeId === 'ignored-nested'), false);
  assert.equal(value.root.attention, null);
  assert.notDeepEqual(value.root.usage, { total: 9999 });
  assert.notDeepEqual(value.children[0].usage, { total: 8888 });
});

test('lifecycle: toate stările canonice, complete/completed și terminalele parțiale sunt adevărate', () => {
  const value = normalized(terminal);
  assert.equal(value.root.lifecycle, 'completed');
  assert.deepEqual(value.children.map((node) => node.lifecycle), [
    'queued', 'completed', 'failed', 'stopped', 'paused', 'unknown', 'unknown'
  ]);
  assert.equal(value.children[5].sourceState, 'partial');
  assert.equal(value.children[6].sourceState, 'rejected');
  warning(value, 'PARTIAL_STATE');
  warning(value, 'REJECTED_STATE');
});

test('activity și usage indisponibile sau invalide rămân null, iar scope-urile nu sunt agregate', () => {
  const raw = {
    runId: 'usage-root', state: 'running', startedAt: 1,
    totalTokens: { input: 2, output: -1, total: Infinity, window: 0, windowPeak: 'bad' },
    steps: [{
      runId: 'usage-step', status: 'running', startedAt: 2, tokens: 99,
      children: [{
        id: 'usage-nested', state: 'running', startedAt: 3,
        totalTokens: { input: -1 }, children: []
      }]
    }]
  };
  const value = normalized(raw);

  assert.deepEqual(value.root.usage, { input: 2, window: 0 });
  assert.equal(value.root.activity, null);
  assert.equal(value.root.model, null);
  assert.equal(value.children[0].usage, null);
  assert.equal(value.children[1].usage, null);
  warning(value, 'INVALID_USAGE');
});

test('identități: fallback-uri deterministe, parentRunId valid și duplicatele nu suprascriu primul nod', () => {
  const raw = {
    runId: 'identity-root', state: 'running', startedAt: 1,
    steps: [
      { status: 'running', startedAt: 2, children: [
        { state: 'running', startedAt: 3, children: [] },
        { id: 'declared-parent', parentRunId: 'outside-parent', state: 'running', startedAt: 4, children: [] }
      ] },
      { runId: 'identity-root:step:0', status: 'running', startedAt: 5, children: [] }
    ]
  };
  const value = normalized(raw);

  assert.deepEqual(value.children.map((node) => [node.nativeId, node.parentNativeId]), [
    ['identity-root:step:0', 'identity-root'],
    ['identity-root:step:0:nested:0', 'identity-root:step:0'],
    ['declared-parent', 'outside-parent']
  ]);
  warning(value, 'DUPLICATE_NATIVE_ID');
});

test('limite: taie determinist după adâncime și număr, iar opțiunile invalide revin la default sigur', () => {
  const depthValue = normalized(limits, { maxDepth: 2 });
  assert.deepEqual(depthValue.children.map((node) => node.nativeId), ['limit-step-a', 'limit-nested-a', 'limit-step-b']);
  assert.deepEqual(depthValue.truncated, { depth: true, count: false });

  const countValue = normalized(limits, { maxNodes: 3 });
  assert.deepEqual(countValue.children.map((node) => node.nativeId), ['limit-step-a', 'limit-nested-a']);
  assert.deepEqual(countValue.truncated, { depth: false, count: true });

  const invalidOptions = normalized({ runId: 'option-root', state: 'running', startedAt: 1, steps: [] }, {
    maxDepth: 0, maxNodes: 1001, observedAt: -1
  });
  warning(invalidOptions, 'INVALID_MAX_DEPTH');
  warning(invalidOptions, 'INVALID_MAX_NODES');
  warning(invalidOptions, 'INVALID_OBSERVED_AT');
  assert.equal(invalidOptions.observedAt, null);
});

test('maxNodes: lista mare de steps invalizi consumă bugetul înainte de validare și păstrează warnings bounded', () => {
  const value = normalized({
    runId: 'invalid-budget-root', state: 'running', startedAt: 1,
    steps: Array.from({ length: 50 }, () => null)
  }, { maxNodes: 3 });

  assert.deepEqual(value.children, []);
  assert.deepEqual(value.warnings, ['INVALID_STEP_NODE', 'INVALID_STEP_NODE']);
  assert.deepEqual(value.truncated, { depth: false, count: true });
});

test('maxNodes: duplicatele step consumă bugetul înainte de deduplicare, apoi oprește elementul următor', () => {
  const value = normalized({
    runId: 'duplicate-step-root', state: 'running', startedAt: 1,
    steps: [
      { runId: 'kept-step', status: 'running', startedAt: 2, children: [] },
      { runId: 'kept-step', status: 'running', startedAt: 3, children: [] },
      { runId: 'must-not-be-processed', status: 'running', startedAt: 4, children: [] }
    ]
  }, { maxNodes: 3 });

  assert.deepEqual(value.children.map((node) => node.nativeId), ['kept-step']);
  assert.deepEqual(value.warnings, ['DUPLICATE_NATIVE_ID']);
  assert.deepEqual(value.truncated, { depth: false, count: true });
});

test('maxNodes: același buget înainte de deduplicare se aplică și la children nested', () => {
  const value = normalized({
    runId: 'duplicate-nested-root', state: 'running', startedAt: 1,
    steps: [{
      runId: 'parent-step', status: 'running', startedAt: 2,
      children: [
        { id: 'kept-nested', state: 'running', startedAt: 3, children: [] },
        { id: 'kept-nested', state: 'running', startedAt: 4, children: [] },
        { id: 'must-not-be-nested', state: 'running', startedAt: 5, children: [] }
      ]
    }]
  }, { maxNodes: 4 });

  assert.deepEqual(value.children.map((node) => node.nativeId), ['parent-step', 'kept-nested']);
  assert.deepEqual(value.warnings, ['DUPLICATE_NATIVE_ID']);
  assert.deepEqual(value.truncated, { depth: false, count: true });
});

test('input invalid: toate formele resping stabil, fără throw și fără conținut brut', () => {
  const invalid = [
    null,
    [],
    {},
    { runId: 'x', state: 'running' },
    { runId: 'x', state: 'running', startedAt: -1 },
    { runId: 'x', state: 'running', startedAt: NaN },
    { runId: 'x', state: 'running', startedAt: 1, steps: {} },
    { runId: '   ', state: 'SYNTHETIC_PRIVATE_STATE', startedAt: 1 }
  ];
  for (const raw of invalid) {
    assert.doesNotThrow(() => normalizePiSubagentsStatus(raw));
    assert.deepEqual(normalizePiSubagentsStatus(raw), { ok: false, error: { code: 'INVALID_STATUS' } });
  }
});

test('allowlist ostil: nu expune date private la root, step sau nested; stringurile și tool path sunt bounded/sigure', () => {
  const value = normalized(hostile);
  const serialized = JSON.stringify(value);
  for (const privateMarker of [
    'SYNTHETIC_PRIVATE_DESCRIPTION', 'SYNTHETIC_PRIVATE_PROMPT',
    'SYNTHETIC_PRIVATE_TASK', 'SYNTHETIC_PRIVATE_ARGS',
    'SYNTHETIC_PRIVATE_OUTPUT', 'SYNTHETIC_PRIVATE_ERROR',
    'SYNTHETIC_PRIVATE_SESSION', 'SYNTHETIC_PRIVATE_TRANSCRIPT',
    'SYNTHETIC_PRIVATE_ARTIFACT', 'SYNTHETIC_PRIVATE_UNKNOWN',
    'SYNTHETIC_PRIVATE_CWD'
  ]) assert.equal(serialized.includes(privateMarker), false, privateMarker);

  assert.equal(value.root.activity, null);
  assert.equal(value.children[0].activity, null);
  assert.equal(value.root.label.length, 160);
  warning(value, 'INVALID_ACTIVITY');
  warning(value, 'TRUNCATED_NODE_FIELD');
});
