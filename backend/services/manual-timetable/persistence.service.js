import TimetableResult from "../../models/TimetableResult.js";
import TeacherSubjectCombination from "../../models/TeacherSubjectCombination.js";

/* ------------------------------------------------ */
/* -------------- Normalization Utils ------------- */
/* ------------------------------------------------ */

function normalizeClassTimetables(classTimetables) {
  if (!classTimetables) return classTimetables;

  for (const classId in classTimetables) {
    for (const day in classTimetables[classId]) {
      for (const hour in classTimetables[classId][day]) {
        const slot = classTimetables[classId][day][hour];
        if (!Array.isArray(slot)) {
          classTimetables[classId][day][hour] = slot ? [slot] : [];
        }
      }
    }
  }
  return classTimetables;
}

/* ------------------------------------------------ */
/* ------------------- Load / Save ---------------- */
/* ------------------------------------------------ */

export async function loadSavedTimetable({ timetableId, savedTimetableId }) {
  const saved = await TimetableResult.findById(savedTimetableId).lean();
  if (!saved) {
    throw new Error("Saved timetable not found");
  }

  const normalizedClassTimetables =
    normalizeClassTimetables(saved.class_timetables);

  return {
    classTimetable: normalizedClassTimetables,
    teacherTimetable: saved.teacher_timetables,
    subjectHoursAssigned: saved.subject_hours_assigned,
    config: saved.config,
    version: saved.version,
    createdAt: saved.createdAt,
  };
}

export async function saveTimetable({
  name,
  state,
  savedTimetableId = null,
}) {
  const payload = {
    name,
    source: "manual",
    class_timetables: state.classTimetable,
    teacher_timetables: state.teacherTimetable,
    subject_hours_assigned: state.subjectHoursAssigned,
    config: state.config,
    version: state.version,
  };

  if (savedTimetableId) {
    const updated = await TimetableResult.findByIdAndUpdate(
      savedTimetableId,
      payload,
      { new: true }
    );
    if (!updated) {
      throw new Error("Timetable to update not found");
    }
    return updated;
  }

  const created = new TimetableResult(payload);
  return created.save();
}

/* ------------------------------------------------ */
/* -------- Processed Assignments / Results -------- */
/* ------------------------------------------------ */

async function populateCombos(comboIds) {
  if (!comboIds || comboIds.length === 0) return [];

  const uniqueIds = [...new Set(comboIds.filter(Boolean))];

  return TeacherSubjectCombination.find({ _id: { $in: uniqueIds } })
    .populate("faculty", "name")
    .populate("subject", "name")
    .lean();
}

export async function getProcessedAssignments() {
  const results = await TimetableResult.find({})
    .sort({ createdAt: -1 })
    .lean();

  return Promise.all(
    results.map(async (result) => {
      if (result.source === "assignments" && result.assignments_only) {
        const populatedAssignments = {};
        for (const classId in result.assignments_only) {
          populatedAssignments[classId] = await populateCombos(
            result.assignments_only[classId]
          );
        }
        result.populated_assignments = populatedAssignments;
        return result;
      }

      if (!result.class_timetables) return result;

      const allComboIds = Object.values(result.class_timetables)
        .flatMap((classSchedule) =>
          Object.values(classSchedule).flatMap((day) =>
            Object.values(day).flat()
          )
        )
        .filter(Boolean);

      const populated = await populateCombos(allComboIds);
      const comboMap = new Map(
        populated.map((c) => [c._id.toString(), c])
      );

      const populatedTimetables = {};
      for (const classId in result.class_timetables) {
        populatedTimetables[classId] = {};
        for (const day in result.class_timetables[classId]) {
          populatedTimetables[classId][day] = {};
          for (const hour in result.class_timetables[classId][day]) {
            const slot = result.class_timetables[classId][day][hour];
            populatedTimetables[classId][day][hour] = Array.isArray(slot)
              ? slot.map((id) => comboMap.get(id.toString())).filter(Boolean)
              : [];
          }
        }
      }

      result.class_timetables = populatedTimetables;
      return result;
    })
  );
}
