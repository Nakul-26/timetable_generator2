// lib/generator.js
// PURE BACKTRACKING + PROGRESS CALLBACK (SAFE, SIMPLE)

const DEBUG = false;

function generate({
  faculties,
  subjects,
  classes,
  combos,
  DAYS_PER_WEEK = 6,
  HOURS_PER_DAY = 8,
  BREAK_HOURS = [],
  fixed_slots = [],
  progressCallback,
  stopFlag
}) {
  const EMPTY = -1;
  const BREAK = "BREAK";

  // ---------- NORMALIZE ----------
  faculties = faculties.map(f => ({ ...f, _id: String(f._id || f.id) }));
  subjects = subjects.map(s => ({ ...s, _id: String(s._id || s.id), type: s.type || "theory" }));
  combos = combos.map(c => ({
    ...c,
    _id: String(c._id || c.id),
    subject_id: String(c.subject_id),
    class_ids: (c.class_ids || []).map(String),
    faculty_ids: c.faculty_ids ? c.faculty_ids.map(String) : (c.faculty_id ? [String(c.faculty_id)] : [])
  }));
  classes = classes.map(c => ({ ...c, _id: String(c._id || c.id) }));

  const comboById = new Map(combos.map(c => [c._id, c]));
  const subjectById = new Map(subjects.map(s => [s._id, s]));
  const classById = new Map(classes.map(c => [c._id, c]));

  // ---------- TIMETABLE STATE ----------
  const classTT = {};
  const facultyTT = {};
  const subjectHours = {};

  const MAX_DAYS = Math.max(...classes.map(c => Number(c.days_per_week || DAYS_PER_WEEK)));

  for (const cls of classes) {
    const days = Number(cls.days_per_week || DAYS_PER_WEEK);
    classTT[cls._id] = Array.from({ length: days }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK : EMPTY
      )
    );
    subjectHours[cls._id] = {};
  }

  for (const f of faculties) {
    facultyTT[f._id] = Array.from({ length: MAX_DAYS }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK : EMPTY
      )
    );
  }

  // ---------- HELPERS ----------
  function requiredHours(classId, subjectId) {
    const cls = classById.get(classId);
    if (cls?.subject_hours?.[subjectId] != null) return Number(cls.subject_hours[subjectId]);
    return subjectById.get(subjectId)?.no_of_hours_per_week || 0;
  }

  function canPlace(classId, day, hour, comboId) {
    const combo = comboById.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    if (hour + block > HOURS_PER_DAY) return false;

    for (let h = hour; h < hour + block; h++) {
      if (BREAK_HOURS.includes(h)) return false;
      if (classTT[classId][day][h] !== EMPTY) return false;
      for (const fid of combo.faculty_ids) {
        if (facultyTT[fid][day][h] !== EMPTY) return false;
      }
    }

    const used = subjectHours[classId][subj._id] || 0;
    if (used + block > requiredHours(classId, subj._id)) return false;

    return true;
  }

  function place(classId, day, hour, comboId) {
    const combo = comboById.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = comboId;
      for (const fid of combo.faculty_ids) facultyTT[fid][day][h] = comboId;
    }
    subjectHours[classId][subj._id] = (subjectHours[classId][subj._id] || 0) + block;
  }

  function unplace(classId, day, hour, comboId) {
    const combo = comboById.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = EMPTY;
      for (const fid of combo.faculty_ids) facultyTT[fid][day][h] = EMPTY;
    }
    subjectHours[classId][subj._id] -= block;
  }

  // ---------- PROGRESS ----------
  const totalSlots = MAX_DAYS * HOURS_PER_DAY;
  let lastProgress = -1;
  let visitedSlots = 0;

  function reportProgress(day, hour) {
    if (!progressCallback) return;
    const progress = Math.floor(((day * HOURS_PER_DAY + hour) / totalSlots) * 100);
    if (progress !== lastProgress) {
      lastProgress = progress;
      progressCallback({
        progress,
        partialData: {
          class_timetables: classTT,
          faculty_timetables: facultyTT,
          subject_hours_assigned_per_class: subjectHours
        }
      });
    }
  }

  // ---------- PURE BACKTRACKING ----------
  const classIds = classes.map(c => c._id);

  function dfs(day, hour, classIdx) {
    if (stopFlag?.is_set) return false;

    reportProgress(day, hour);

    if (day >= MAX_DAYS) return true;
    if (hour >= HOURS_PER_DAY) return dfs(day + 1, 0, 0);
    if (BREAK_HOURS.includes(hour)) return dfs(day, hour + 1, 0);
    if (classIdx >= classIds.length) return dfs(day, hour + 1, 0);

    const classId = classIds[classIdx];
    const cls = classById.get(classId);

    if (day >= (cls.days_per_week || DAYS_PER_WEEK)) {
      return dfs(day, hour, classIdx + 1);
    }

    if (classTT[classId][day][hour] !== EMPTY) {
      return dfs(day, hour, classIdx + 1);
    }

    for (const cbid of cls.assigned_teacher_subject_combos || []) {
      if (!comboById.has(cbid)) continue;
      if (!canPlace(classId, day, hour, cbid)) continue;

      place(classId, day, hour, cbid);
      if (dfs(day, hour, classIdx + 1)) return true;
      unplace(classId, day, hour, cbid);
    }

    return false;
  }

  // ---------- RUN ----------
  const ok = dfs(0, 0, 0);

  if (!ok) {
    return { ok: false, error: "No feasible timetable found (pure backtracking)" };
  }

  progressCallback?.({ progress: 100 });

  return {
    ok: true,
    class_timetables: classTT,
    faculty_timetables: facultyTT
  };
}

function printTimetable() {}
function scoreTimetable() { return 0; }
function shuffle() {}

export default { generate, printTimetable, scoreTimetable, shuffle };
