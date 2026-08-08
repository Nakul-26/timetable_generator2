/**
 * teachingAllocation.service.js
 *
 * Shared cleanup logic for removing a teacher from TeachingAllocation records.
 * Previously re-implemented independently in routes/api/teacherSubject.js,
 * routes/api/class.js, and routes/api/faculty.js.
 */
import TeachingAllocation from "../../models/TeachingAllocation.js";

/**
 * Nullify/remove a teacher's presence across TeachingAllocation records,
 * optionally scoped to a single subject and/or class.
 *
 * @param {string} collegeId
 * @param {string} teacherId
 * @param {object} [scope]
 * @param {string} [scope.subjectId] - restrict to allocations for this subject
 * @param {string} [scope.classId] - restrict to allocations that include this class
 */
export async function unassignTeacherFromAllocations(collegeId, teacherId, { subjectId = null, classId = null } = {}) {
  if (!collegeId || !teacherId) return;

  const baseFilter = { collegeId };
  if (classId) baseFilter.classIds = classId;
  if (subjectId) baseFilter.subject = subjectId;

  // 1. NORMAL/LAB single-teacher field
  await TeachingAllocation.updateMany(
    { ...baseFilter, teacher: teacherId },
    { $set: { teacher: null } }
  );

  // 2. LAB/ELECTIVE co-teachers array
  await TeachingAllocation.updateMany(
    { ...baseFilter, teachers: teacherId },
    { $pull: { teachers: teacherId } }
  );

  // 3. Elective per-subject teacher assignments
  const elemFilter = { "elem.teacher": teacherId };
  if (subjectId) elemFilter["elem.subject"] = subjectId;

  await TeachingAllocation.updateMany(
    {
      ...baseFilter,
      "subjects.teacher": teacherId,
      ...(subjectId ? { "subjects.subject": subjectId } : {}),
    },
    { $set: { "subjects.$[elem].teacher": null } },
    { arrayFilters: [elemFilter] }
  );
}
