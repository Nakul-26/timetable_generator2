import ClassModel from "../models/Class.js";
import TeacherSubjectCombination from "../models/TeacherSubjectCombination.js";

//---------------------------------------------------------
// Utility functions for manual timetable placement
//---------------------------------------------------------

export function computeRemainingHours(classObj, subjectHoursAssigned) {
  const remaining = {};

  if (!classObj.subject_hours) {
    return remaining;
  }

  for (const [subjId, required] of Object.entries(classObj.subject_hours)) {
    const assigned = subjectHoursAssigned[classObj._id.toString()]?.[subjId] || 0;
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
  const slot = classTimetable[classObj._id.toString()]?.[day]?.[hour];
  if (slot && slot.length > 0) {
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

export async function autoFillTimetable(classId, currentState) {
    const { config, classTimetable, teacherTimetable, subjectHoursAssigned } = currentState;

    const classObj = await ClassModel.findById(classId).lean();
    if (!classObj) {
        return { ok: false, error: "Class not found" };
    }

    const combos = await TeacherSubjectCombination.find({
        '_id': { $in: classObj.assigned_teacher_subject_combos }
    }).populate('faculty subject').lean();

    let newClassTimetable = JSON.parse(JSON.stringify(classTimetable));
    let newTeacherTimetable = JSON.parse(JSON.stringify(teacherTimetable));
    let newSubjectHoursAssigned = JSON.parse(JSON.stringify(subjectHoursAssigned));
    const placedComboIds = [];

    const requiredHoursForClass = {};
    if (classObj.subject_hours) {
        for (const [subjId, required] of Object.entries(classObj.subject_hours)) {
            const assigned = newSubjectHoursAssigned[classId]?.[subjId] || 0;
            requiredHoursForClass[subjId] = required - assigned;
        }
    }

    const days = config.days || 6;
    const hours = config.hours || 8;

    for (let day = 0; day < days; day++) {
        for (let hour = 0; hour < hours; hour++) {
            if (newClassTimetable[classId]?.[day]?.[hour]?.length > 0) {
                continue;
            }

            const availableCombos = computeAvailableCombos({
                classObj,
                combos,
                classTimetable: newClassTimetable,
                teacherTimetable: newTeacherTimetable,
                day,
                hour,
                subjectHoursAssigned: newSubjectHoursAssigned
            });

            const preferredCombos = [];
            const otherCombos = [];

            for (const combo of availableCombos) {
                const facultyId = combo.faculty._id.toString();
                if (hour > 0 && newTeacherTimetable[facultyId]?.[day]?.[hour - 1]) {
                    otherCombos.push(combo);
                } else {
                    preferredCombos.push(combo);
                }
            }
            
            const tryPlaceFromList = (list) => {
                for (const combo of list) {
                    const facultyId = combo.faculty._id.toString();
                    const subjectId = combo.subject._id.toString();

                    if (requiredHoursForClass[subjectId] > 0) {
                        newClassTimetable[classId][day][hour].push(combo._id.toString());
                        placedComboIds.push(combo._id.toString());
                        
                        if (!newTeacherTimetable[facultyId]) {
                            newTeacherTimetable[facultyId] = Array(days).fill(null).map(() => Array(hours).fill(null));
                        }
                        newTeacherTimetable[facultyId][day][hour] = combo._id.toString();
                        
                        if (!newSubjectHoursAssigned[classId]) {
                            newSubjectHoursAssigned[classId] = {};
                        }
                        newSubjectHoursAssigned[classId][subjectId] = (newSubjectHoursAssigned[classId][subjectId] || 0) + 1;
                        requiredHoursForClass[subjectId]--;

                        return true; 
                    }
                }
                return false; 
            };

            const placed = tryPlaceFromList(preferredCombos);
            if (!placed) {
                tryPlaceFromList(otherCombos);
            }
        }
    }

    return { 
        ok: true, 
        newState: { 
            classTimetable: newClassTimetable, 
            teacherTimetable: newTeacherTimetable, 
            subjectHoursAssigned: newSubjectHoursAssigned,
            config: currentState.config,
            version: currentState.version
        },
        placedComboIds: [...new Set(placedComboIds)]
    };
}
