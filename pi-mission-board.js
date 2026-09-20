'use strict';

const HEX_ID = /^[a-f0-9]{64}$/;
const MAX_MISSIONS = 200;
const MAX_RUNS = 200;
const MAX_PROOFS = 200;
const WARNING_CODES = new Set([
  'ROOT_UNAVAILABLE', 'ROOT_REJECTED', 'MISSION_CANDIDATE_REJECTED', 'MISSION_TOO_LARGE',
  'MISSION_READ_FAILED', 'MISSION_JSON_INVALID', 'MISSION_INVALID', 'MISSION_NAME_MISMATCH',
  'RUN_INVALID', 'DECISION_INVALID', 'PROOF_INVALID'
]);
const MISSION_STATUSES = new Set(['planned', 'active', 'waiting', 'needs_decision', 'completed', 'failed', 'cancelled']);
const RUN_MODES = new Set(['single', 'parallel', 'chain', 'workflow', 'scheduled', 'external']);
const RUN_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'stopped', 'paused', 'unknown']);
const GOAL_STATUSES = new Set(['active', 'paused', 'budget-exhausted']);
const ARTIFACT_KINDS = new Set(['status', 'output', 'patch', 'manifest', 'review', 'note', 'other']);
const RECEIPT_KINDS = new Set(['pull_request', 'ci', 'deployment', 'release']);
const RECEIPT_STATUSES = new Set(['pending', 'ready', 'succeeded', 'failed']);
const LIFECYCLES = new Set(['queued', 'running', 'completed', 'failed', 'stopped', 'paused', 'unknown']);
const RELATIONS = new Set(['coordinator', 'direct', 'descendant', 'unknown']);
const KINGDOM_WARNING_CODES = new Set([
  'INVALID_OPTIONS', 'INVALID_OBSERVATIONS', 'INVALID_OBSERVATION', 'SOURCE_TRUNCATED', 'NODES_TRUNCATED',
  'INVALID_NODE_FIELD', 'TRUNCATED_NODE_FIELD', 'MISSING_STATE', 'PARTIAL_STATE', 'REJECTED_STATE',
  'UNKNOWN_STATE', 'INVALID_USAGE', 'UNKNOWN_ACTIVITY_STATE', 'ACTIVE_LONG_RUNNING_UNVERIFIED',
  'INVALID_ACTIVITY', 'INVALID_MAX_DEPTH', 'INVALID_MAX_NODES', 'INVALID_OBSERVED_AT', 'INVALID_NESTED_LIST',
  'INVALID_NESTED_NODE', 'INVALID_STEP_NODE', 'DUPLICATE_NATIVE_ID', 'INVALID_DECLARED_PARENT'
]);

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function timestamp(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function nullableTimestamp(value) {
  return value === null || timestamp(value);
}

function nullableSafeInteger(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function nullableText(value, maximum = 80) {
  return value === null || (typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(value));
}

function unavailableKingdom() {
  return {
    schemaVersion: 1,
    source: 'pi-subagents',
    availability: 'unavailable',
    freshness: 'unknown',
    observedAt: null,
    otherObservationCount: 0,
    truncated: false,
    warnings: [],
    nodes: [],
  };
}

function empty(kingdom, scan) {
  const safeScan = validScan(scan) ? scan : null;
  return {
    schemaVersion: 1,
    source: 'rpgfactory-pi-mission-board',
    observedAt: null,
    missionAvailability: 'unavailable',
    truncated: safeScan
      ? { missions: safeScan.truncated.missions, runs: safeScan.truncated.runs, proofs: safeScan.truncated.proofs }
      : { missions: false, runs: false, proofs: false },
    warnings: safeScan ? [...new Set(safeScan.warnings)] : [],
    kingdom: validKingdom(kingdom) ? kingdom : unavailableKingdom(),
    missions: [],
  };
}

function validNode(node) {
  if (!exact(node, ['id', 'parentId', 'relation', 'depth', 'rank', 'role', 'lifecycle', 'attention', 'activity', 'startedAt', 'lastActivityAt', 'active']) ||
      !HEX_ID.test(node.id) || (node.parentId !== null && !HEX_ID.test(node.parentId)) ||
      !RELATIONS.has(node.relation) || node.rank !== node.relation ||
      (node.depth !== null && (!Number.isSafeInteger(node.depth) || node.depth < 0)) ||
      !nullableText(node.role) || !nullableText(node.activity) || !LIFECYCLES.has(node.lifecycle) ||
      (node.attention !== null && node.attention !== 'needs_attention') ||
      !nullableTimestamp(node.startedAt) || !nullableTimestamp(node.lastActivityAt) || typeof node.active !== 'boolean') return false;
  return node.relation === 'coordinator'
    ? node.depth === 0 && node.parentId === null
    : true;
}

function validKingdom(value) {
  if (!exact(value, ['schemaVersion', 'source', 'availability', 'freshness', 'observedAt', 'otherObservationCount', 'truncated', 'warnings', 'nodes']) ||
      value.schemaVersion !== 1 || value.source !== 'pi-subagents' ||
      (value.availability !== 'ready' && value.availability !== 'unavailable') ||
      !['fresh', 'stale', 'unknown'].includes(value.freshness) || !nullableTimestamp(value.observedAt) ||
      !Number.isSafeInteger(value.otherObservationCount) || value.otherObservationCount < 0 ||
      typeof value.truncated !== 'boolean' || !Array.isArray(value.warnings) || value.warnings.length > MAX_RUNS ||
      !value.warnings.every((warning) => KINGDOM_WARNING_CODES.has(warning)) ||
      !Array.isArray(value.nodes) || value.nodes.length > MAX_RUNS || !value.nodes.every(validNode)) return false;
  const ids = new Set(value.nodes.map((node) => node.id));
  return ids.size === value.nodes.length && value.nodes.every((node) => node.parentId === null || ids.has(node.parentId));
}

function validScan(value) {
  return exact(value, ['schemaVersion', 'source', 'observedAt', 'missions', 'truncated', 'warnings']) &&
    value.schemaVersion === 1 && value.source === 'pi-subagents-missions' && nullableTimestamp(value.observedAt) &&
    Array.isArray(value.missions) && value.missions.length <= MAX_MISSIONS &&
    exact(value.truncated, ['missions', 'runs', 'proofs']) &&
    Object.values(value.truncated).every((item) => typeof item === 'boolean') &&
    Array.isArray(value.warnings) && value.warnings.length <= WARNING_CODES.size &&
    value.warnings.every((warning) => WARNING_CODES.has(warning));
}

function validRun(value) {
  return exact(value, ['id', 'mode', 'status', 'startedAt', 'completedAt', 'usageTokens']) &&
    HEX_ID.test(value.id) && RUN_MODES.has(value.mode) && (value.status === null || RUN_STATUSES.has(value.status)) &&
    nullableTimestamp(value.startedAt) && nullableTimestamp(value.completedAt) &&
    (value.startedAt === null || value.completedAt === null || value.completedAt >= value.startedAt) &&
    nullableSafeInteger(value.usageTokens);
}

function validProof(value) {
  return exact(value, ['ref', 'source', 'kind', 'status']) && HEX_ID.test(value.ref) &&
    ((value.source === 'artifact' && ARTIFACT_KINDS.has(value.kind) && value.status === null) ||
     (value.source === 'receipt' && RECEIPT_KINDS.has(value.kind) && RECEIPT_STATUSES.has(value.status)));
}

function validProjection(value) {
  if (!exact(value, ['schemaVersion', 'source', 'id', 'status', 'createdAt', 'updatedAt', 'goalStatus', 'usageTokens', 'openDecisionCount', 'runs', 'proofs']) ||
      value.schemaVersion !== 1 || value.source !== 'pi-subagents-mission' || !HEX_ID.test(value.id) ||
      !MISSION_STATUSES.has(value.status) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || value.updatedAt < value.createdAt ||
      (value.goalStatus !== null && !GOAL_STATUSES.has(value.goalStatus)) || !nullableSafeInteger(value.usageTokens) ||
      !Number.isSafeInteger(value.openDecisionCount) || value.openDecisionCount < 0 ||
      !Array.isArray(value.runs) || value.runs.length > MAX_RUNS || !value.runs.every(validRun) ||
      !Array.isArray(value.proofs) || value.proofs.length > MAX_PROOFS || !value.proofs.every(validProof)) return false;
  return new Set(value.proofs.map((proof) => proof.ref)).size === value.proofs.length;
}

function projectPiMissionBoard(kingdom, missionScan, options = {}) {
  if (!plain(options) || options.configured !== true || !validKingdom(kingdom) || !missionScan || missionScan.ok !== true || !validScan(missionScan.value)) {
    return empty(kingdom);
  }

  const scan = missionScan.value;
  const unavailable = empty(kingdom, scan);
  if (scan.warnings.includes('ROOT_UNAVAILABLE') || scan.warnings.includes('ROOT_REJECTED')) return unavailable;
  const nodeById = new Map(kingdom.nodes.map((node) => [node.id, node]));
  const missions = [];
  const missionIds = new Set();

  for (const item of scan.missions) {
    // proofTargets is accepted only as part of the internal b3c contract.
    // Its content is not read, validated, copied, or returned.
    if (!exact(item, ['projection', 'proofTargets']) || !Array.isArray(item.proofTargets) || !validProjection(item.projection)) return unavailable;
    const source = item.projection;
    if (missionIds.has(source.id)) return unavailable;
    missionIds.add(source.id);

    const runs = source.runs.map((run) => {
      const node = nodeById.get(run.id);
      return {
        id: run.id,
        mode: run.mode,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        usageTokens: run.usageTokens,
        linked: !!node,
        role: node ? node.role : null,
      };
    });
    const handoffs = [];
    for (let index = 1; index < runs.length; index += 1) {
      const previous = runs[index - 1];
      const next = runs[index];
      if (previous.linked && next.linked && previous.completedAt !== null && next.startedAt !== null && previous.completedAt <= next.startedAt) {
        handoffs.push({ fromRunId: previous.id, toRunId: next.id, at: next.startedAt, basis: 'temporal_sequence' });
      }
    }
    const proofs = source.proofs.map((proof) => ({ ref: proof.ref, source: proof.source, kind: proof.kind, status: proof.status }));
    missions.push({
      id: source.id,
      status: source.status,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      goalStatus: source.goalStatus,
      usageTokens: source.usageTokens,
      openDecisionCount: source.openDecisionCount,
      runs,
      handoffs,
      proofs,
    });
  }

  missions.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  return {
    schemaVersion: 1,
    source: 'rpgfactory-pi-mission-board',
    observedAt: missions.length ? Math.max(...missions.map((mission) => mission.updatedAt)) : null,
    missionAvailability: 'ready',
    truncated: { missions: scan.truncated.missions, runs: scan.truncated.runs, proofs: scan.truncated.proofs },
    warnings: [...new Set(scan.warnings)],
    kingdom,
    missions,
  };
}

module.exports = { projectPiMissionBoard };
