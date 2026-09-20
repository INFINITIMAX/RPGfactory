// merge-state.js — three-way merge (base/local/remote) for archive state,
// used only by the frontend (T-07). The server does not merge: it only rejects
// with 409 and returns the on-disk state; the browser merges here and retries.
// Ported from bot-crossing (src/game/merge-state.js), reduced to what we need:
// `archived` (set) and `archivedAt` (key -> epochMs map). This is a classic
// script rather than an ES module, loaded with <script> before app.js.

// mergeSet — for `archived`: (remote ∪ (local \ base)) \ (base \ local).
function mergeSet(base, local, remote) {
  const baseSet = new Set(base || []);
  const localSet = new Set(local || []);
  const removed = new Set([...baseSet].filter((id) => !localSet.has(id)));
  const out = [];
  const seen = new Set();
  for (const id of (remote || [])) {
    if (removed.has(id) || seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  for (const id of localSet) {
    if (baseSet.has(id) || seen.has(id)) continue;
    seen.add(id); out.push(id);
  }
  return out;
}

// sameValue — deep equality ported from bot-crossing. Required for fields such
// as `plots` (values are arrays of `{x,y}` objects), where `===` would always
// report "different" despite identical content because each zone-layout
// recalculation creates new references.
function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => sameValue(a[k], b[k]));
  }
  return false;
}

// mergeMap — for `archivedAt`/`plots`, key by key: remote is the base and the
// local diff is applied over it. Equality is deep (`sameValue`), not `===`:
// both are equivalent for numbers (archivedAt), but only `sameValue` correctly
// recognizes unchanged complex values (plots).
function mergeMap(base, local, remote) {
  const baseMap = base || {};
  const localMap = local || {};
  const out = { ...(remote || {}) };
  for (const [k, v] of Object.entries(localMap)) {
    if (k in baseMap && sameValue(baseMap[k], v)) continue; // untouched locally; keep remote
    out[k] = v;
  }
  for (const k of Object.keys(baseMap)) {
    if (k in localMap) continue;
    delete out[k]; // deleted locally
  }
  return out;
}

function mergeState(base, local, remote) {
  return {
    version: 1,
    archived: mergeSet(base && base.archived, local && local.archived, remote && remote.archived),
    archivedAt: mergeMap(base && base.archivedAt, local && local.archivedAt, remote && remote.archivedAt),
    plots: mergeMap(base && base.plots, local && local.plots, remote && remote.plots),
  };
}
