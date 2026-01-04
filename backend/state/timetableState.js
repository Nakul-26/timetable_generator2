// In-memory store for timetable data, designed for multi-user and multi-timetable support.
const timetables = new Map();
const locks = new Map(); // Lock keys must be globally unique across all timetables

/**
 * Retrieves the state for a specific timetable.
 * @param {string} timetableId - The ID of the timetable to retrieve.
 * @returns {object | undefined} The state object or undefined if not found.
 */
export const getState = (timetableId) => {
  return timetables.get(timetableId);
};

/**
 * Updates the state for a specific timetable. Merges with previous state.
 * Increments version and updates timestamp.
 * @param {string} timetableId - The ID of the timetable to update.
 * @param {object} newState - The new state properties to merge in.
 */
export const setState = (timetableId, newState) => {
  /**
   * IMPORTANT:
   * newState must be a FULL state object (not partial patches).
   */
  if (!newState.classTimetable || !newState.teacherTimetable) {
    throw new Error("Invalid state update: incomplete state provided to setState.");
  }

  const prev = timetables.get(timetableId) || {};
  const newVersion = (prev.version || 0) + 1;
  timetables.set(timetableId, { ...prev, ...newState, version: newVersion, updatedAt: Date.now() });
};

/**
 * Initializes or re-initializes a timetable state.
 * Existing state will be reset.
 * @param {string} timetableId - The unique ID for the new timetable.
 * @param {Array} classes - List of class objects.
 * @param {Array} faculties - List of faculty objects.
 * @param {Array} subjects - List of subject objects.
 * @param {object} config - Configuration object with optional days and hours.
 * @param {number} config.days - Number of days in the timetable grid (default: 6).
 * @param {number} config.hours - Number of hours in the timetable grid (default: 8).
 */
export const initializeState = (timetableId, classes, faculties, subjects, { days = 6, hours = 8 } = {}, electiveGroups = []) => {
    if (timetables.has(timetableId)) {
        // Instead of throwing an error, let's just re-initialize the state.
        // This is useful for "clear all" functionality.
    }

    const classTimetable = {};
    const teacherTimetable = {};
    const subjectHoursAssigned = {};

    classes.forEach(c => {
        classTimetable[c._id] = Array(days).fill(null).map(() => Array.from({ length: hours }, () => []));
        subjectHoursAssigned[c._id] = {};
        subjects.forEach(s => {
            subjectHoursAssigned[c._id][s._id] = 0;
        });
    });

    faculties.forEach(f => {
        teacherTimetable[f._id] = Array(days).fill(null).map(() => Array(hours).fill(null));
    });
  
    const existingState = timetables.get(timetableId) || {};

    timetables.set(timetableId, {
        ...existingState, // Preserve existing properties like electiveGroups if not provided
        classTimetable,
        teacherTimetable,
        subjectHoursAssigned,
        createdAt: existingState.createdAt || Date.now(),
        version: (existingState.version || 0) + 1,
        updatedAt: Date.now(),
        config: { days, hours },
        ...(electiveGroups && { electiveGroups }) // Only update electiveGroups if provided
    });

    console.log(`Timetable ${timetableId} initialized or cleared.`);
};

/**
 * Deletes a timetable's state.
 * @param {string} timetableId - The ID of the timetable to delete.
 * @returns {boolean} true if the timetable was deleted, false otherwise.
 */
export const deleteState = (timetableId) => {
  return timetables.delete(timetableId);
};

/**
 * Loads a saved state for a given timetable ID.
 * @param {string} timetableId - The unique ID for the timetable session.
 * @param {object} savedState - The saved state object to load.
 */
export const loadState = (timetableId, savedState) => {
    if (!savedState.classTimetable || !savedState.teacherTimetable) {
        throw new Error("Invalid saved state: missing classTimetable or teacherTimetable.");
    }
    timetables.set(timetableId, {
        ...savedState,
        updatedAt: Date.now(),
    });
    console.log(`Timetable ${timetableId} loaded with saved state.`);
};

/**
 * Creates a deep copy (snapshot) of a timetable's state.
 * Useful for undo, debugging, or durable storage.
 * @param {string} timetableId - The ID of the timetable to snapshot.
 * @returns {object | undefined} A JSON-serializable snapshot of the state.
 */
export const snapshotState = (timetableId) => {
    const state = timetables.get(timetableId);
    return state ? JSON.parse(JSON.stringify(state)) : undefined;
};

/**
 * Attempts to acquire a lock for a specific resource key (e.g., a timetable slot).
 * @param {string} key - A unique key representing the resource to lock.
 * @param {number} ttl - Time to live for the lock in milliseconds (default: 3000ms).
 * @returns {boolean} `true` if the lock was acquired, `false` if it was already held.
 */
export function lockSlot(key, ttl = 3000) {
  if (locks.has(key)) return false;

  const timeout = setTimeout(() => {
    locks.delete(key);
  }, ttl);

  locks.set(key, timeout);
  return true;
}

/**
 * Releases a previously acquired lock.
 * @param {string} key - The unique key of the lock to release.
 */
export function unlockSlot(key) {
  const timeout = locks.get(key);
  if (timeout) clearTimeout(timeout);
  locks.delete(key);
}

/**
 * Asserts that a timetable with the given ID exists.
 * Throws an error if the timetable is not found.
 * @param {string} timetableId - The ID of the timetable to check.
 * @throws {Error} If the timetable with the given ID does not exist.
 */
export const assertState = (timetableId) => {
    if (!timetables.has(timetableId)) {
        throw new Error(`Timetable with ID ${timetableId} not found.`);
    }
};

