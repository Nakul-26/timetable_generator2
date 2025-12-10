// backend/utils/timetableManualUtils.js

//---------------------------------------------------------
// Utility functions for manual timetable placement
//---------------------------------------------------------

export function computeRemainingHours(classObj, subjectHoursAssigned) {
  const remaining = {};

  if (!classObj.subject_hours) {
    return remaining;
  }

  for (const [subjId, required] of classObj.subject_hours.entries()) {
    const assigned = subjectHoursAssigned[subjId] || 0;
    remaining[subjId] = required - assigned;
  }

  return remaining;
}


//---------------------------------------------------------
// Teacher constraint checker
//---------------------------------------------------------
export function checkTeacherConstraints(teacherTimetable, facultyId, day, hour) {
  // Already booked?
  if (teacherTimetable?.[facultyId]?.[day]?.[hour] !== undefined && teacherTimetable?.[facultyId]?.[day]?.[hour] !== null) {
    return { ok: false, error: "Teacher not available at this time." };
  }

  // Continuous hour limit: max 2 in a row
  const row = teacherTimetable[facultyId]?.[day];
  if (!row) return { ok: true }; // No entries for this teacher on this day yet

  let before = 0, after = 0;

  for (let h = hour - 1; h >= 0; h--) {
    if (row[h] !== undefined && row[h] !== null) before++;
    else break;
  }

  for (let h = hour + 1; h < row.length; h++) {
    if (row[h] !== undefined && row[h] !== null) after++;
    else break;
  }

  if (before + 1 + after > 2) {
    return { ok: false, error: "Teacher exceeds continuous hour limit (max 2)" };
  }

  return { ok: true };
}


//---------------------------------------------------------
// Class constraint checker
//---------------------------------------------------------
export function checkClassConstraints(classTimetable, classObj, day, hour, subjId, remainingHours) {

  // Slot collision check
  if (classTimetable[classObj._id.toString()]?.[day]?.[hour] !== undefined && classTimetable[classObj._id.toString()]?.[day]?.[hour] !== null) {
    return { ok: false, error: "Class slot already filled." };
  }

  // Subject hours limit check
  if (remainingHours[subjId] <= 0) {
    return { ok: false, error: "Required hours for this subject are already completed." };
  }

  return { ok: true };
}


//---------------------------------------------------------
// Compute available combos for a class slot
//---------------------------------------------------------
export function computeAvailableCombos({
  classObj,
  combos,
  classTimetable,
  teacherTimetable,
  day,
  hour,
  subjectHoursAssigned
}) {
  const remainingHours = computeRemainingHours(classObj, subjectHoursAssigned);

  const valid = [];

  const assignedComboIds = classObj.assigned_teacher_subject_combos.map(id => id.toString());

  for (const cb of combos) {
    // Check if combo is assigned to this class
    if (!assignedComboIds.includes(cb._id.toString()))
      continue;

    const subjId = cb.subject._id.toString();
    const facultyId = cb.faculty._id.toString();

    // Check class constraints
    const classCheck = checkClassConstraints(
      classTimetable,
      classObj,
      day,
      hour,
      subjId,
      remainingHours
    );
    if (!classCheck.ok) continue;

    // Check teacher constraints
    const teacherCheck = checkTeacherConstraints(
      teacherTimetable,
      facultyId,
      day,
      hour
    );
    if (!teacherCheck.ok) continue;

    valid.push(cb);
  }

  return valid;
}
