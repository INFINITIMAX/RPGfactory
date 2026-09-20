// world.js — PURE RF-05b functions for grouping profiles by project and
// choosing each project's accent color. No database, HTTP, or require-time
// side effects, just like `hex-layout.js`.
//
// Reference source: bot-crossing (src/world/plots.js). `PLOT_PALETTE` and
// `hashString` were ported as a CSS color list and simple FNV-1a respectively
// for deterministic selection. No 3D geometry/rendering was imported; those
// concerns were ported separately in hex-layout.js/public/world.js.

/**
 * Groups profiles by `last_project`, sorted descending by size. The largest
 * comes first because ordering decides which NEW project without history gets
 * the cell closest to center (see hex-layout.js). Equal-sized groups sort
 * alphabetically by `project`, independent of SQLite return order.
 *
 * Profiles with null/empty `last_project` are EXCLUDED because they have no
 * map location in this batch. This is an accepted limitation, not fixed here.
 *
 * @param profiles  Rows returned by `profilesStore.listProfiles()`.
 * @returns [{ id: string, size: number }]
 */
function groupProjects(profiles) {
  const counts = new Map();
  for (const profile of profiles) {
    const project = profile.last_project;
    if (!project) continue; // null/empty: excluded, with no map location in this batch
    counts.set(project, (counts.get(project) || 0) + 1);
  }

  const projects = Array.from(counts, ([id, size]) => ({ id, size }));
  projects.sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return projects;
}

// Twelve distinct CSS colors ported from `PLOT_PALETTE` (numeric Three.js hex
// values become CSS strings). Selected to remain readable on both a dark
// background (current hud.css theme, #111) and a possible light background;
// no color is too close to pure white or black.
const PALETTE = [
  '#c96442',
  '#4f9a63',
  '#4f7ec9',
  '#b8942a',
  '#8b5cc9',
  '#c94f8b',
  '#3fa8a0',
  '#c97f4f',
  '#6f8f4f',
  '#5c7fc9',
  '#c95c5c',
  '#7f6fc9',
];

// Simple FNV-1a ported from bot-crossing `hashString`: deterministic and
// independent of call count or order.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Stable color per project: the same `project` yields the same color,
 * regardless of order or call count.
 * @param project string
 * @returns string  CSS color from PALETTE
 */
function pickAccent(project) {
  return PALETTE[hashString(project) % PALETTE.length];
}

/**
 * Profiles for each project as an ID list, not only a count as in
 * `groupProjects`. RF-05c needs to know exactly WHO receives a slot. Uses the
 * same exclusion as `groupProjects`: null/empty `last_project` is excluded
 * because it has no map location in this batch.
 *
 * Order within each list matters to `assignSlots` below. Preserve order from
 * `profiles` (already `ORDER BY created_at ASC, id ASC` from
 * `profilesStore.listProfiles()`) rather than resorting here.
 *
 * @param profiles  Rows returned by `profilesStore.listProfiles()`.
 * @returns Map<project, [profileId, ...]>
 */
function profilesByProject(profiles) {
  const byProject = new Map();
  for (const profile of profiles) {
    const project = profile.last_project;
    if (!project) continue; // null/empty: excluded, as in groupProjects
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project).push(profile.id);
  }
  return byProject;
}

/**
 * Assigns a station (`slot_index`) to every profile in ONE project, with
 * memory. This is deterministic, NOT hash+jitter. spec.md §7 explicitly
 * prohibits hash+jitter because it could visually overlap two different
 * specialists on the same slot at different times by recalculating position
 * from an ID hash instead of retaining a small explicitly assigned integer.
 *
 * Memory rules:
 * - a profile with a previous station (`previous`) KEEPS it while
 *   `slotIndex < capacity` AND it remains in `profileIds`; a specialist does
 *   not jump slots merely because a colleague appeared or departed;
 * - a profile absent from `profileIds` has left the project and releases its
 *   station; it is absent from the result and the slot becomes available;
 * - a profile WITHOUT a previous station, or whose old station exceeds
 *   `capacity`, receives the lowest free `slotIndex`; `profileIds` order
 *   decides who gets newly available slots first;
 * - when `profileIds.length > capacity`, profiles that do not fit receive no
 *   slot and are absent from the result. This accepted limitation does not
 *   invent visual overflow.
 *
 * @param profileIds  Current [profileId, ...] values for this project.
 * @param previous    Map<profileId, slotIndex> — previous stations for THIS
 *                    project, not other projects.
 * @param capacity    Total zone slots = cells.length * 7.
 * @returns Map<profileId, slotIndex>
 */
function assignSlots(profileIds, previous, capacity) {
  const currentIds = new Set(profileIds);
  const result = new Map();
  const takenSlots = new Set();

  // Step 1: retain valid previous stations when the profile is still in the
  // project AND the slot still fits within current capacity.
  const needsSlot = [];
  for (const profileId of profileIds) {
    const prevSlot = previous.get(profileId);
    if (prevSlot !== undefined && prevSlot < capacity && !takenSlots.has(prevSlot)) {
      result.set(profileId, prevSlot);
      takenSlots.add(prevSlot);
    } else {
      needsSlot.push(profileId);
    }
  }

  // Step 2: profiles without a valid station receive the lowest free slot in
  // `profileIds` order, deterministically rather than by hash/random.
  let nextFree = 0;
  for (const profileId of needsSlot) {
    while (nextFree < capacity && takenSlots.has(nextFree)) nextFree++;
    if (nextFree >= capacity) continue; // no room: accepted overflow, no slot
    result.set(profileId, nextFree);
    takenSlots.add(nextFree);
  }

  return result;
}

module.exports = { groupProjects, pickAccent, profilesByProject, assignSlots };
