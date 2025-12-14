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

export async function autoFillTimetable(classId, currentState) {
    const { classTimetable, teacherTimetable, subjectHoursAssigned } = currentState;

    const classObj = await ClassModel.findById(classId).lean();
    if (!classObj) {
        return { ok: false, error: "Class not found" };
    }

    const combos = await TeacherSubjectCombination.find({
        '_id': { $in: classObj.assigned_teacher_subject_combos }
    }).populate('faculty subject').lean();

    // Create deep copies to work with
    let newClassTimetable = JSON.parse(JSON.stringify(classTimetable));
    let newTeacherTimetable = JSON.parse(JSON.stringify(teacherTimetable));
    let newSubjectHoursAssigned = JSON.parse(JSON.stringify(subjectHoursAssigned)); // Deep copy for nested object

    // `requiredHours` should track for this specific class.
    // It's derived from classObj.subject_hours and newSubjectHoursAssigned for this class.
    const requiredHoursForClass = {};
    for (const [subjId, required] of Object.entries(classObj.subject_hours)) {
        const assigned = newSubjectHoursAssigned[classId]?.[subjId] || 0;
        requiredHoursForClass[subjId] = required - assigned;
    }
    
    const solver = (day, hour) => {
        if (day >= 6) { // 6 days in a week (0-5)
            // Check if all subjects for this class have their required hours met
            for (const [subjId, required] of Object.entries(classObj.subject_hours)) {
                if ((newSubjectHoursAssigned[classId]?.[subjId] || 0) < required) {
                    return false; // Not all required hours are met for this class
                }
            }
            return true; // Solution found for this class
        }

        const nextHour = (hour + 1) % 8; // 8 hours in a day (0-7)
        const nextDay = (hour + 1 === 8) ? day + 1 : day;

        // If slot is already filled, move to the next one
        if (newClassTimetable[classId]?.[day]?.[hour]) {
            return solver(nextDay, nextHour);
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

        for (const combo of availableCombos) {
            const facultyId = combo.faculty._id.toString();
            const subjectId = combo.subject._id.toString();

            // Check if this subject still needs hours
            if (requiredHoursForClass[subjectId] <= 0) {
                continue; // This subject's hours are already fulfilled for this class
            }

            // Place combo
            newClassTimetable[classId][day][hour] = combo._id.toString();
            
            // Ensure teacher's timetable array exists for this faculty and day
            if (!newTeacherTimetable[facultyId]) newTeacherTimetable[facultyId] = Array(6).fill(null).map(() => Array(8).fill(null));
            newTeacherTimetable[facultyId][day][hour] = combo._id.toString();
            
            // Increment subject hours for this class
            if (!newSubjectHoursAssigned[classId]) newSubjectHoursAssigned[classId] = {};
            newSubjectHoursAssigned[classId][subjectId] = (newSubjectHoursAssigned[classId][subjectId] || 0) + 1;
            requiredHoursForClass[subjectId]--; // Decrement local remaining hours tracker

            // Recurse
            if (solver(nextDay, nextHour)) {
                return true;
            }

            // Backtrack
            newSubjectHoursAssigned[classId][subjectId]--; // Decrement for this class
            requiredHoursForClass[subjectId]++; // Increment local remaining hours tracker
            newTeacherTimetable[facultyId][day][hour] = null;
            newClassTimetable[classId][day][hour] = null;
        }

        return false; // No solution found from this path
    };

    if (solver(0, 0)) {
        return { 
            ok: true, 
            newState: { 
                classTimetable: newClassTimetable, 
                teacherTimetable: newTeacherTimetable, 
                subjectHoursAssigned: newSubjectHoursAssigned 
            } 
        };
    } else {
        return { ok: false, error: "Could not find a valid timetable solution for this class." };
    }
}
