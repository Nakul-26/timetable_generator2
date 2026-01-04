import ClassModel from "../../models/Class.js";
import TeacherSubjectCombination from "../../models/TeacherSubjectCombination.js";

import {
  computeRemainingHours,
  checkClassConstraints,
  checkTeacherConstraints
} from "../../utils/timetableManualUtils.js";

import { getState } from "../../state/timetableState.js";

/* ------------------------------------------------ */
/* ---------------- Slot Utilities ---------------- */
/* ------------------------------------------------ */

export async function clearSlot({ classId, day, hour, state }) {
  const {
    classTimetable,
    teacherTimetable,
    subjectHoursAssigned
  } = state;

  const comboIds = classTimetable[classId]?.[day]?.[hour];
  if (!comboIds || !Array.isArray(comboIds) || comboIds.length === 0) return;

  for (const comboId of comboIds) {
    if (!comboId) continue;

    const combo = await TeacherSubjectCombination.findById(comboId).lean();
    if (!combo) continue;

    const facultyId = combo.faculty.toString();
    const subjectId = combo.subject.toString();

    if (teacherTimetable[facultyId]?.[day]?.[hour] === comboId) {
      teacherTimetable[facultyId][day][hour] = null;
    }

    if (subjectHoursAssigned[classId]?.[subjectId] > 0) {
      subjectHoursAssigned[classId][subjectId]--;
    }
  }

  classTimetable[classId][day][hour] = [];
}

export async function withTempClearedState(
  timetableId,
  classId,
  day,
  hour,
  cb
) {
  const state = getState(timetableId);
  const tempState = JSON.parse(JSON.stringify(state));

  await clearSlot({ classId, day, hour, state: tempState });
  return cb(tempState);
}

export async function placeCombo({
  timetableId,
  classId,
  day,
  hour,
  comboId
}) {
  if (!comboId) {
    throw new Error("comboId is required for placeCombo.");
  }

  const state = getState(timetableId);
  let newState = JSON.parse(JSON.stringify(state));

  const {
    classTimetable,
    teacherTimetable,
    subjectHoursAssigned,
    config,
    electiveGroups
  } = newState;

  const classObj = await ClassModel.findById(classId).lean();
  if (!classObj) throw new Error("Class not found");

  const combosInSlot = classTimetable[classId]?.[day]?.[hour] || [];
  if (combosInSlot.includes(comboId)) return newState;

  const combo = await TeacherSubjectCombination
    .findById(comboId)
    .populate("subject")
    .lean();

  if (!combo) throw new Error("Combo not found");

  const subjectId = combo.subject._id.toString();
  let isReplacement = false;

  if (combosInSlot.length > 0) {
    const existing = await TeacherSubjectCombination
      .find({ _id: { $in: combosInSlot } })
      .select("subject")
      .lean();

    const subjectIdsInSlot = existing.map(c => c.subject.toString());
    const allSubjects = [...subjectIdsInSlot, subjectId];

    const group = electiveGroups.find(
      g => g.classId === classId && g.subjects.includes(subjectId)
    );

    const validElective =
      group &&
      allSubjects.every(s => group.subjects.includes(s)) &&
      allSubjects.length <= group.subjects.length;

    if (!validElective) {
      if (combosInSlot.length === 1) {
        isReplacement = true;
        await clearSlot({ classId, day, hour, state: newState });
      } else {
        throw new Error(
          "Invalid placement: slot full or not part of elective group."
        );
      }
    }
  }

  const remainingHours = computeRemainingHours(classObj, subjectHoursAssigned);

  if (!isReplacement) {
    const c1 = checkClassConstraints(
      classTimetable,
      classObj,
      day,
      hour,
      subjectId,
      remainingHours
    );
    if (!c1.ok) throw new Error(c1.error);
  }

  const c2 = checkTeacherConstraints(
    teacherTimetable,
    combo.faculty.toString(),
    day,
    hour
  );
  if (!c2.ok) throw new Error(c2.error);

  classTimetable[classId][day][hour].push(comboId);

  const facultyId = combo.faculty.toString();
  if (!teacherTimetable[facultyId]) {
    const { days, hours } = config;
    teacherTimetable[facultyId] = Array(days)
      .fill(null)
      .map(() => Array(hours).fill(null));
  }

  teacherTimetable[facultyId][day][hour] = comboId;
  subjectHoursAssigned[classId][subjectId] =
    (subjectHoursAssigned[classId][subjectId] || 0) + 1;

  return newState;
}
