'use strict';

const crypto = require('crypto');

const MAX_NODES = 200;
const DEFAULT_STALE_AFTER_MS = 60000;
const LIFECYCLES = new Set(['queued', 'running', 'completed', 'failed', 'stopped', 'paused', 'unknown']);
const SNAPSHOT_WARNINGS = new Set(['INVALID_NODE_FIELD', 'TRUNCATED_NODE_FIELD', 'MISSING_STATE', 'PARTIAL_STATE', 'REJECTED_STATE', 'UNKNOWN_STATE', 'INVALID_USAGE', 'UNKNOWN_ACTIVITY_STATE', 'ACTIVE_LONG_RUNNING_UNVERIFIED', 'INVALID_ACTIVITY', 'INVALID_MAX_DEPTH', 'INVALID_MAX_NODES', 'INVALID_OBSERVED_AT', 'INVALID_NESTED_LIST', 'INVALID_NESTED_NODE', 'INVALID_STEP_NODE', 'DUPLICATE_NATIVE_ID', 'INVALID_DECLARED_PARENT']);

function opaqueId(nativeId) {
  return crypto.createHash('sha256').update('rpgfactory:pi-kingdom:v1\u0000' + nativeId, 'utf8').digest('hex');
}

function finiteTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
}

function safeText(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value) ? value : null;
}

function publicRole(agent) {
  return safeText(agent, 80);
}

function publicActivity(activity) {
  const value = safeText(activity, 80);
  return value && !/[\\/]/.test(value) ? value : null;
}

function nodeFromSnapshot(value, root) {
  if (!value || typeof value !== 'object') return null;
  const nativeId = safeText(value.nativeId, 256);
  const lifecycle = LIFECYCLES.has(value.lifecycle) ? value.lifecycle : null;
  if (!nativeId || !lifecycle) return null;
  if (root && value.kind !== 'root') return null;
  if (!root && !['step', 'nested'].includes(value.kind)) return null;
  const parentNativeId = root ? null : safeText(value.parentNativeId, 256);
  if (!root && !parentNativeId) return null;
  return {
    nativeId,
    parentNativeId,
    lifecycle,
    attention: value.attention === 'needs_attention' ? 'needs_attention' : null,
    role: publicRole(value.agent),
    activity: publicActivity(value.activity),
    startedAt: finiteTimestamp(value.startedAt),
    lastActivityAt: finiteTimestamp(value.lastActivityAt),
  };
}

function emptyProjection(warnings) {
  return {
    schemaVersion: 1,
    source: 'pi-subagents',
    availability: 'unavailable',
    freshness: 'unknown',
    observedAt: null,
    otherObservationCount: 0,
    truncated: false,
    warnings,
    nodes: [],
  };
}

function projectPiKingdom(observations, { now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS } = {}) {
  if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER ||
      !Number.isFinite(staleAfterMs) || staleAfterMs < 0 || staleAfterMs > 24 * 60 * 60 * 1000) {
    return emptyProjection(['INVALID_OPTIONS']);
  }
  if (!Array.isArray(observations)) return emptyProjection(['INVALID_OBSERVATIONS']);

  const candidates = [];
  let invalidCount = 0;
  for (const observation of observations) {
    if (!observation || typeof observation !== 'object') { invalidCount++; continue; }
    const snapshot = observation.snapshot;
    if (!snapshot || typeof snapshot !== 'object' || snapshot.schemaVersion !== 1 || snapshot.source !== 'pi-subagents' || !Array.isArray(snapshot.children)) {
      invalidCount++;
      continue;
    }
    const root = nodeFromSnapshot(snapshot.root, true);
    if (!root) { invalidCount++; continue; }
    const children = [];
    let malformed = false;
    for (const child of snapshot.children) {
      const node = nodeFromSnapshot(child, false);
      if (!node) { malformed = true; break; }
      children.push(node);
    }
    if (malformed || new Set([root.nativeId, ...children.map((node) => node.nativeId)]).size !== children.length + 1) {
      invalidCount++;
      continue;
    }
    const observedAt = finiteTimestamp(snapshot.observedAt) ?? finiteTimestamp(observation.storedAt);
    if (observedAt === null) { invalidCount++; continue; }
    candidates.push({ root, children, observedAt, tie: opaqueId(root.nativeId), snapshotTruncatedDepth: snapshot.truncated && snapshot.truncated.depth === true, snapshotTruncatedCount: snapshot.truncated && snapshot.truncated.count === true, snapshotWarnings: Array.isArray(snapshot.warnings) ? snapshot.warnings : [] });
  }
  if (!candidates.length) return emptyProjection(invalidCount ? ['INVALID_OBSERVATION'] : []);

  candidates.sort((a, b) => b.observedAt - a.observedAt || a.tie.localeCompare(b.tie));
  const focal = candidates[0];
  const freshness = now - focal.observedAt > staleAfterMs ? 'stale' : 'fresh';
  const byNativeId = new Map([[focal.root.nativeId, focal.root], ...focal.children.map((node) => [node.nativeId, node])]);
  const resolved = new Map();
  const resolving = new Set();

  function relationFor(node) {
    if (node === focal.root) return { relation: 'coordinator', depth: 0, parentId: null };
    if (resolved.has(node.nativeId)) return resolved.get(node.nativeId);
    if (resolving.has(node.nativeId)) return { relation: 'unknown', depth: null, parentId: byNativeId.has(node.parentNativeId) ? opaqueId(node.parentNativeId) : null };
    resolving.add(node.nativeId);
    const parent = byNativeId.get(node.parentNativeId);
    let result;
    if (!parent) result = { relation: 'unknown', depth: null, parentId: null };
    else {
      const parentResult = relationFor(parent);
      if (parentResult.relation === 'unknown') result = { relation: 'unknown', depth: null, parentId: opaqueId(node.parentNativeId) };
      else result = {
        relation: parent === focal.root ? 'direct' : 'descendant',
        depth: parentResult.depth + 1,
        parentId: opaqueId(node.parentNativeId),
      };
    }
    resolving.delete(node.nativeId);
    resolved.set(node.nativeId, result);
    return result;
  }

  // Root-first BFS retains every exposed node's proven ancestry. Unknown
  // branches have no safe public parent and are appended deterministically.
  const childrenByParent = new Map();
  for (const child of focal.children) {
    if (!childrenByParent.has(child.parentNativeId)) childrenByParent.set(child.parentNativeId, []);
    childrenByParent.get(child.parentNativeId).push(child);
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => opaqueId(a.nativeId).localeCompare(opaqueId(b.nativeId)));
  const sourceNodes = [];
  const queued = [focal.root];
  const seen = new Set();
  while (queued.length) {
    const node = queued.shift();
    if (seen.has(node.nativeId)) continue;
    seen.add(node.nativeId);
    sourceNodes.push(node);
    for (const child of childrenByParent.get(node.nativeId) || []) queued.push(child);
  }
  for (const node of focal.children.slice().sort((a, b) => opaqueId(a.nativeId).localeCompare(opaqueId(b.nativeId)))) if (!seen.has(node.nativeId)) sourceNodes.push(node);
  const sourceTruncated = !!(focal.snapshotTruncatedDepth || focal.snapshotTruncatedCount);
  const truncated = sourceTruncated || sourceNodes.length > MAX_NODES;
  const included = new Set(sourceNodes.slice(0, MAX_NODES).map((node) => node.nativeId));
  const nodes = sourceNodes.slice(0, MAX_NODES).map((node) => {
    const relation = relationFor(node);
    const parentExcluded = relation.parentId && !included.has(node.parentNativeId);
    const publicRelation = parentExcluded ? 'unknown' : relation.relation;
    return {
      id: opaqueId(node.nativeId),
      parentId: parentExcluded ? null : relation.parentId,
      relation: publicRelation,
      depth: parentExcluded ? null : relation.depth,
      rank: publicRelation,
      role: node.role,
      lifecycle: node.lifecycle,
      attention: node.attention,
      activity: node.activity,
      startedAt: node.startedAt,
      lastActivityAt: node.lastActivityAt,
      active: freshness === 'fresh' && node.lifecycle === 'running',
    };
  });
  const warnings = [];
  for (const warning of focal.snapshotWarnings || []) if (SNAPSHOT_WARNINGS.has(warning)) warnings.push(warning);
  if (invalidCount) warnings.push('INVALID_OBSERVATION');
  if (sourceTruncated) warnings.push('SOURCE_TRUNCATED');
  if (sourceNodes.length > MAX_NODES) warnings.push('NODES_TRUNCATED');
  return {
    schemaVersion: 1,
    source: 'pi-subagents',
    availability: 'ready',
    freshness,
    observedAt: focal.observedAt,
    otherObservationCount: candidates.length - 1,
    truncated,
    warnings,
    nodes,
  };
}

module.exports = { projectPiKingdom };
