// merge-state.js — merge pe 3 căi (base/local/remote) pentru starea de
// arhivare, folosit doar de frontend (T-07). Serverul nu face merge —
// serverul doar refuză cu 409 și întoarce starea de pe disc; browser-ul
// face merge-ul aici și retrimite. Portat din bot-crossing
// (src/game/merge-state.js), redus la ce ne trebuie: `archived` (set) și
// `archivedAt` (map cheie -> epochMs). Script clasic, nu modul ES —
// încărcat cu <script> înainte de app.js.

// mergeSet — pentru `archived`: (remote ∪ (local \ base)) \ (base \ local).
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

// sameValue — egalitate profundă, portată din bot-crossing. Necesară pentru
// câmpuri ca `plots` (valori = array-uri de obiecte `{x,y}`), unde `===`
// ar considera mereu "diferit" chiar dacă conținutul e identic, din cauza
// referințelor noi create la fiecare recalculare a layout-ului de zone.
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

// mergeMap — pentru `archivedAt`/`plots`, key-by-key: remote e baza, diff-ul
// local se aplică peste. Egalitatea e profundă (`sameValue`), nu `===`: pentru
// numere (archivedAt) cele două sunt echivalente, dar pentru valori complexe
// (plots) doar `sameValue` prinde corect "neschimbat".
function mergeMap(base, local, remote) {
  const baseMap = base || {};
  const localMap = local || {};
  const out = { ...(remote || {}) };
  for (const [k, v] of Object.entries(localMap)) {
    if (k in baseMap && sameValue(baseMap[k], v)) continue; // neatins aici, lăsăm varianta remote
    out[k] = v;
  }
  for (const k of Object.keys(baseMap)) {
    if (k in localMap) continue;
    delete out[k]; // șters aici
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
