import ClassModel from "../../models/Class.js";

import {
  computeRemainingHours,
  checkClassConstraints,
  checkTeacherConstraints
} from "../../utils/timetableManualUtils.js";

import { getState } from "../../state/timetableState.js";
import {
  resolveComboFromState,
  resolveCombosFromState,
} from "./comboResolver.service.js";

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

    const combo = await resolveComboFromState(state, comboId);
    if (!combo) continue;

    for (const facultyId of combo.facultyIds) {
      if (teacherTimetable[facultyId]?.[day]?.[hour] === comboId) {
        teacherTimetable[facultyId][day][hour] = null;
      }
    }

    if (combo.subjectId && subjectHoursAssigned[classId]?.[combo.subjectId] > 0) {
      subjectHoursAssigned[classId][combo.subjectId]--;
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
    electiveGroups,
    lockedSlots,
  } = newState;

  const classObj = await ClassModel.findById(classId).lean();
  if (!classObj) throw new Error("Class not found");

  if (lockedSlots?.[classId]?.[day]?.[hour]) {
    throw new Error("This slot is locked.");
  }

  const combosInSlot = classTimetable[classId]?.[day]?.[hour] || [];
  if (combosInSlot.includes(comboId)) return newState;

  const combo = await resolveComboFromState(newState, comboId);

  if (!combo) throw new Error("Combo not found");

  const subjectId = combo.subjectId;
  let isReplacement = false;

  if (combosInSlot.length > 0) {
    const existing = await resolveCombosFromState(newState, combosInSlot);
    const subjectIdsInSlot = existing.map((c) => c.subjectId).filter(Boolean);
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
      remainingHours,
      { allowHourOverflow: true }
    );
    if (!c1.ok) throw new Error(c1.error);
  }

  for (const facultyId of combo.facultyIds) {
    const c2 = checkTeacherConstraints(
      teacherTimetable,
      facultyId,
      day,
      hour
    );
    if (!c2.ok) throw new Error(c2.error);
  }

  classTimetable[classId][day][hour].push(comboId);

  for (const facultyId of combo.facultyIds) {
    if (!teacherTimetable[facultyId]) {
      const { days, hours } = config;
      teacherTimetable[facultyId] = Array(days)
        .fill(null)
        .map(() => Array(hours).fill(null));
    }

    teacherTimetable[facultyId][day][hour] = comboId;
  }
  subjectHoursAssigned[classId][subjectId] =
    (subjectHoursAssigned[classId][subjectId] || 0) + 1;

  return newState;
}
