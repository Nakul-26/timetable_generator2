// lib/generator.js
// PURE BACKTRACKING + HARD + SOFT CONSTRAINTS + PROGRESS CALLBACK

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
    faculty_ids: c.faculty_ids ? c.faculty_ids.map(String) : (c.faculty_id ? [String(c.faculty_id)] : [])
  }));
  classes = classes.map(c => ({ ...c, _id: String(c._id || c.id) }));

  const comboById = new Map(combos.map(c => [c._id, c]));
  const subjectById = new Map(subjects.map(s => [s._id, s]));
  const classById = new Map(classes.map(c => [c._id, c]));

  // ---------- STATE ----------
  const classTT = {};
  const facultyTT = {};
  const subjectHours = {};
  const fixedMap = new Map();

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

  // ---------- FIXED SLOTS (HARD) ----------
  for (const fs of fixed_slots) {
    const { class: classId, day, hour, combo: comboId } = fs;
    const combo = comboById.get(comboId);
    if (!combo) continue;
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = comboId;
      for (const fid of combo.faculty_ids) facultyTT[fid][day][h] = comboId;
      fixedMap.set(`${classId}|${day}|${h}`, comboId);
    }
    subjectHours[classId][subj._id] = (subjectHours[classId][subj._id] || 0) + block;
  }

  // ---------- HELPERS ----------
  function requiredHours(classId, subjectId) {
    const cls = classById.get(classId);
    if (cls?.subject_hours?.[subjectId] != null) return Number(cls.subject_hours[subjectId]);
    return subjectById.get(subjectId)?.no_of_hours_per_week || 0;
  }

  function teacherContinuousHours(fid, day, hour) {
    let count = 0;
    for (let h = hour - 1; h >= 0; h--) {
      if (facultyTT[fid][day][h] !== EMPTY && facultyTT[fid][day][h] !== BREAK) count++;
      else break;
    }
    return count;
  }

  function subjectSpreadPenalty(classId, day, subjectId) {
    let penalty = 0;
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const cid = classTT[classId][day][h];
      if (cid !== EMPTY && cid !== BREAK) {
        const s = comboById.get(cid)?.subject_id;
        if (s === subjectId) penalty++;
      }
    }
    return penalty;
  }

  function canPlace(classId, day, hour, comboId) {
    if (fixedMap.has(`${classId}|${day}|${hour}`)) return false;

    const combo = comboById.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    if (hour + block > HOURS_PER_DAY) return false;

    for (let h = hour; h < hour + block; h++) {
      if (BREAK_HOURS.includes(h)) return false;
      if (classTT[classId][day][h] !== EMPTY) return false;
      for (const fid of combo.faculty_ids) {
        if (facultyTT[fid][day][h] !== EMPTY) return false;
        // HARD: max 2 continuous hours
        if (teacherContinuousHours(fid, day, h) >= 2) return false;
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
    if (fixedMap.has(`${classId}|${day}|${hour}`)) return;

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

  function reportProgress(day, hour) {
    if (!progressCallback) return;
    const p = Math.floor(((day * HOURS_PER_DAY + hour) / totalSlots) * 100);
    if (p !== lastProgress) {
      lastProgress = p;
      progressCallback({
        progress: p,
        partialData: {
          class_timetables: classTT,
          faculty_timetables: facultyTT,
          subject_hours_assigned_per_class: subjectHours
        }
      });
    }
  }

  // ---------- BACKTRACKING ----------
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
    if (day >= (cls.days_per_week || DAYS_PER_WEEK)) return dfs(day, hour, classIdx + 1);
    if (classTT[classId][day][hour] !== EMPTY) return dfs(day, hour, classIdx + 1);

    const candidates = (cls.assigned_teacher_subject_combos || [])
      .filter(id => comboById.has(id))
      .sort((a, b) => {
        const sa = comboById.get(a).subject_id;
        const sb = comboById.get(b).subject_id;
        return subjectSpreadPenalty(classId, day, sa) - subjectSpreadPenalty(classId, day, sb);
      });

    for (const cbid of candidates) {
      if (!canPlace(classId, day, hour, cbid)) continue;
      place(classId, day, hour, cbid);
      if (dfs(day, hour, classIdx + 1)) return true;
      unplace(classId, day, hour, cbid);
    }
    return false;
  }

  const ok = dfs(0, 0, 0);
  if (!ok) return { ok: false, error: "No feasible timetable found" };

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
