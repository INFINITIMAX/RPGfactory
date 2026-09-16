'use strict';

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_NODES = 200;
const MAX_DEPTH = 32;
const MAX_NODES = 1000;
const MAX_TEXT_LENGTH = 160;
const MAX_ACTIVITY_LENGTH = 120;
const LIFECYCLES = {
  pending: 'queued',
  queued: 'queued',
  running: 'running',
  complete: 'completed',
  completed: 'completed',
  failed: 'failed',
  stopped: 'stopped',
  paused: 'paused'
};

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function boundedString(value, limit, warnings) {
  if (typeof value !== 'string') {
    if (value !== undefined && value !== null) warnings.push('INVALID_NODE_FIELD');
    return null;
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > limit) {
    warnings.push('TRUNCATED_NODE_FIELD');
    return normalized.slice(0, limit);
  }
  return normalized;
}

function timestamp(value, warnings) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  warnings.push('INVALID_NODE_FIELD');
  return null;
}

function stateFor(value, warnings) {
  if (typeof value !== 'string' || !value.trim()) {
    warnings.push('MISSING_STATE');
    return { sourceState: null, lifecycle: 'unknown' };
  }
  const sourceState = boundedString(value.toLowerCase(), MAX_TEXT_LENGTH, warnings);
  if (!sourceState) {
    warnings.push('MISSING_STATE');
    return { sourceState: null, lifecycle: 'unknown' };
  }
  const lifecycle = LIFECYCLES[sourceState];
  if (lifecycle) return { sourceState, lifecycle };
  warnings.push(sourceState === 'partial' ? 'PARTIAL_STATE' : sourceState === 'rejected' ? 'REJECTED_STATE' : 'UNKNOWN_STATE');
  return { sourceState, lifecycle: 'unknown' };
}

function usageFor(value, warnings) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    warnings.push('INVALID_USAGE');
    return null;
  }

  const usage = {};
  const fields = ['input', 'output', 'total', 'window', 'windowPeak'];
  for (const field of fields) {
    const candidate = value[field];
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      usage[field] = candidate;
    } else {
      warnings.push('INVALID_USAGE');
    }
  }
  return Object.keys(usage).length ? usage : null;
}

function attentionFor(value, warnings) {
  if (value === undefined || value === null) return null;
  if (value === 'needs_attention') return 'needs_attention';
  if (value === 'active_long_running') {
    warnings.push('ACTIVE_LONG_RUNNING_UNVERIFIED');
    return null;
  }
  warnings.push('UNKNOWN_ACTIVITY_STATE');
  return null;
}

function activityFor(value, warnings) {
  const activity = boundedString(value, MAX_ACTIVITY_LENGTH, warnings);
  if (activity && !/[\\/\u0000-\u001f]/.test(activity)) return activity;
  if (activity) warnings.push('INVALID_ACTIVITY');
  return null;
}

function nodeFor(raw, nativeId, parentNativeId, kind, warnings) {
  const state = stateFor(kind === 'step' ? raw.status : raw.state, warnings);
  const node = {
    nativeId,
    parentNativeId,
    kind,
    sourceState: state.sourceState,
    lifecycle: state.lifecycle,
    agent: boundedString(raw.agent, MAX_TEXT_LENGTH, warnings),
    phase: boundedString(raw.phase, MAX_TEXT_LENGTH, warnings),
    label: boundedString(raw.label, MAX_TEXT_LENGTH, warnings),
    mode: boundedString(raw.mode, MAX_TEXT_LENGTH, warnings),
    attention: attentionFor(raw.activityState, warnings),
    activity: activityFor(raw.currentTool, warnings),
    startedAt: timestamp(raw.startedAt, warnings),
    endedAt: timestamp(raw.endedAt, warnings),
    lastActivityAt: timestamp(raw.lastActivityAt, warnings),
    model: boundedString(raw.model, MAX_TEXT_LENGTH, warnings),
    usage: usageFor(kind === 'step' ? raw.tokens : raw.totalTokens, warnings)
  };
  return node;
}

function limitFor(value, fallback, maximum, warning, warnings) {
  if (value === undefined) return fallback;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum) return value;
  warnings.push(warning);
  return fallback;
}

function normalizePiSubagentsStatus(raw, options = {}) {
  const warnings = [];
  if (!isPlainObject(raw) || !validId(raw.runId) || typeof raw.state !== 'string' ||
      !(typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) && raw.startedAt >= 0) ||
      (raw.steps !== undefined && !Array.isArray(raw.steps))) {
    return { ok: false, error: { code: 'INVALID_STATUS' } };
  }

  if (!isPlainObject(options)) options = {};
  const maxDepth = limitFor(options.maxDepth, DEFAULT_MAX_DEPTH, MAX_DEPTH, 'INVALID_MAX_DEPTH', warnings);
  const maxNodes = limitFor(options.maxNodes, DEFAULT_MAX_NODES, MAX_NODES, 'INVALID_MAX_NODES', warnings);
  const observedAt = typeof options.observedAt === 'number' && Number.isFinite(options.observedAt) && options.observedAt >= 0
    ? options.observedAt
    : null;
  if (options.observedAt !== undefined && observedAt === null) warnings.push('INVALID_OBSERVED_AT');

  const rootId = raw.runId.trim();
  const seenIds = new Set([rootId]);
  const children = [];
  let encounteredNodes = 1;
  const truncated = { depth: false, count: false };
  const root = nodeFor(raw, rootId, null, 'root', warnings);

  function addNested(items, structuralParentId, depth) {
    if (!Array.isArray(items)) {
      if (items !== undefined) warnings.push('INVALID_NESTED_LIST');
      return;
    }
    if (depth > maxDepth) {
      if (items.length) truncated.depth = true;
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (encounteredNodes >= maxNodes) {
        truncated.count = true;
        return;
      }
      encounteredNodes += 1;
      const item = items[index];
      if (!isPlainObject(item)) {
        warnings.push('INVALID_NESTED_NODE');
        continue;
      }
      const fallbackId = `${structuralParentId}:nested:${index}`;
      const nativeId = validId(item.id) ? item.id.trim() : fallbackId;
      if (seenIds.has(nativeId)) {
        warnings.push('DUPLICATE_NATIVE_ID');
        continue;
      }
      const parentNativeId = validId(item.parentRunId) ? item.parentRunId.trim() : structuralParentId;
      if (item.parentRunId !== undefined && !validId(item.parentRunId)) warnings.push('INVALID_DECLARED_PARENT');
      seenIds.add(nativeId);
      children.push(nodeFor(item, nativeId, parentNativeId, 'nested', warnings));
      addNested(item.children, nativeId, depth + 1);
    }
  }

  const steps = raw.steps || [];
  if (1 > maxDepth && steps.length) {
    truncated.depth = true;
  } else {
    for (let index = 0; index < steps.length; index += 1) {
      if (encounteredNodes >= maxNodes) {
        truncated.count = true;
        break;
      }
      encounteredNodes += 1;
      const step = steps[index];
      if (!isPlainObject(step)) {
        warnings.push('INVALID_STEP_NODE');
        continue;
      }
      const fallbackId = `${rootId}:step:${index}`;
      const nativeId = validId(step.runId) ? step.runId.trim() : validId(step.childId) ? step.childId.trim() : fallbackId;
      if (seenIds.has(nativeId)) {
        warnings.push('DUPLICATE_NATIVE_ID');
        continue;
      }
      seenIds.add(nativeId);
      children.push(nodeFor(step, nativeId, rootId, 'step', warnings));
      addNested(step.children, nativeId, 2);
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      source: 'pi-subagents',
      observedAt,
      root,
      children,
      truncated,
      warnings
    }
  };
}

module.exports = { normalizePiSubagentsStatus };
