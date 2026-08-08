/**
 * legacyMapper.js
 *
 * THE ONLY file allowed to import legacy collections:
 *   - TeacherSubjectCombination
 *   - ClassSubject
 *   - ElectiveSubjectSetting
 *
 * All methods return canonical TeachingAssignment shapes.
 * Delete methods from this file as their source collections are dropped.
 *
 * See: ARCHITECTURE.md — "The two legal translation boundaries"
 */

import TeacherSubjectCombination from "../../models/TeacherSubjectCombination.js";
import ClassSubject from "../../models/ClassSubject.js";
import TeachingAllocation from "../../models/TeachingAllocation.js";
import ElectiveSubjectSetting from "../../models/ElectiveSubjectSetting.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toStr(v) {
  return v == null ? "" : String(v).trim();
}

function toStrArray(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  const s = toStr(v);
  return s ? [s] : [];
}

// Map a TeachingAllocation.type to canonical mode
function allocationTypeToMode(allocationType) {
  const t = String(allocationType || "").toUpperCase();
  if (t === "LAB" || t === "ELECTIVE_LAB") return "LAB";
  if (t === "ELECTIVE") return "ELECTIVE";
  if (t === "NO_TEACHER") return "NO_TEACHER";
  return "THEORY";
}

// ---------------------------------------------------------------------------
// Public mappers
// ---------------------------------------------------------------------------

/**
 * Convert a raw TeachingAllocation document (from MongoDB) into a canonical
 * TeachingAssignment domain object.
 *
 * This is the PRIMARY mapper for active code. TeachingAllocation IS
 * TeachingAssignment — this function just normalises field names.
 *
 * @param {object} doc - lean() TeachingAllocation document
 * @returns {import("../types/domain.js").TeachingAssignment | null}
 */
export function fromTeachingAllocation(doc) {
  if (!doc) return null;

  const id = toStr(doc._id || doc.id);
  if (!id) return null;

  // Consolidate teacher fields (allocation has both .teacher and .teachers[])
  const teacherIds = [
    ...toStrArray(doc.teachers),          // plural first (lab co-teaching)
    ...toStrArray(doc.teacher),           // singular fallback
  ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

  // classIds — always an array
  const classIds = toStrArray(doc.classIds || doc.class_ids);

  const mode = allocationTypeToMode(doc.type);
  const isElective = mode === "ELECTIVE" || Boolean(doc.isElective);

  return {
    id,
    collegeId: toStr(doc.collegeId),
    teacherIds,
    subjectId: toStr(doc.subject?._id || doc.subject),
    classIds,
    classGroupId: toStr(doc.combinedClassGroupId) || null,
    hoursPerWeek: Number(doc.hoursPerWeek) || 0,
    mode,
    isElective,
    electiveGroupId: toStr(doc.electiveGroupId || doc.combinedClassGroupId) || null,
    source: String(doc.source || "DIRECT"),

    // Elective sub-pairs — preserved for generator adapter; not used in domain logic
    _electiveSubjects: Array.isArray(doc.subjects) ? doc.subjects : [],
  };
}

/**
 * Convert a TeacherSubjectCombination + optional ClassSubject pair into a
 * TeachingAssignment.
 *
 * LEGACY. Used only while TSC records still exist.
 * Delete when TeacherSubjectCombination collection is dropped (Phase 3).
 *
 * @param {object} tscDoc - lean() TeacherSubjectCombination document
 * @param {object|null} csDoc - lean() ClassSubject document (for hoursPerWeek)
 * @param {string[]} classIds - class ids that this TSC applies to
 * @returns {import("../types/domain.js").TeachingAssignment | null}
 */
export function fromTSCAndCS(tscDoc, csDoc = null, classIds = []) {
  if (!tscDoc) return null;

  const id = toStr(tscDoc._id);
  if (!id) return null;

  const subjectId = toStr(tscDoc.subject?._id || tscDoc.subject);

  // Infer mode from subject type if populated
  const subjectType = toStr(tscDoc.subject?.type || "").toLowerCase();
  let mode = "THEORY";
  if (subjectType === "lab") mode = "LAB";
  else if (subjectType === "no_teacher") mode = "NO_TEACHER";

  return {
    id,
    collegeId: toStr(tscDoc.collegeId),
    teacherIds: [toStr(tscDoc.faculty?._id || tscDoc.faculty)].filter(Boolean),
    subjectId,
    classIds: classIds.length ? classIds : [],
    classGroupId: null,
    hoursPerWeek: Number(csDoc?.hoursPerWeek) || 0,
    mode,
    isElective: false,
    electiveGroupId: null,
    source: "MAPPING_SYNC",
    _electiveSubjects: [],
  };
}

// ---------------------------------------------------------------------------
// Batch loaders (return TeachingAssignment[])
// ---------------------------------------------------------------------------

/**
 * Load all TeachingAssignments for a college from TeachingAllocation collection.
 * This is the canonical query — use this everywhere you need assignments.
 *
 * @param {string} collegeId
 * @param {object} [filter] - additional Mongoose filter fields
 * @returns {Promise<ReturnType<typeof fromTeachingAllocation>[]>}
 */
export async function loadAssignments(collegeId, filter = {}) {
  if (!collegeId) throw new Error("[LegacyMapper] collegeId is required");

  const docs = await TeachingAllocation.find({ collegeId, ...filter }).lean();
  return docs.map(fromTeachingAllocation).filter(Boolean);
}

/**
 * Load TeachingAssignments for a specific set of class ids.
 *
 * @param {string} collegeId
 * @param {string[]} classIds
 * @returns {Promise<ReturnType<typeof fromTeachingAllocation>[]>}
 */
export async function loadAssignmentsForClasses(collegeId, classIds = []) {
  if (!collegeId) throw new Error("[LegacyMapper] collegeId is required");
  if (!classIds.length) return [];

  const docs = await TeachingAllocation.find({
    collegeId,
    classIds: { $in: classIds },
  }).lean();

  return docs.map(fromTeachingAllocation).filter(Boolean);
}

/**
 * Load a single TeachingAssignment by its id.
 *
 * @param {string} collegeId
 * @param {string} assignmentId
 * @returns {Promise<ReturnType<typeof fromTeachingAllocation> | null>}
 */
export async function loadAssignment(collegeId, assignmentId) {
  if (!collegeId || !assignmentId) return null;

  const doc = await TeachingAllocation.findOne({
    _id: assignmentId,
    collegeId,
  }).lean();

  return doc ? fromTeachingAllocation(doc) : null;
}

// ---------------------------------------------------------------------------
// ElectiveSubjectSetting mapper
//
// An ElectiveSubjectSetting captures a *requirement* — which teacher
// categories are needed for a subject within a class's elective group — not
// a resolved TeachingAssignment (it pins no specific teacher). Callers that
// need the raw requirement shape should use fromElectiveSetting() below
// rather than importing ElectiveSubjectSetting directly.
// ---------------------------------------------------------------------------

/**
 * Convert a raw ElectiveSubjectSetting document into a domain-shaped record.
 *
 * @param {object} doc - lean() ElectiveSubjectSetting document
 * @returns {{ classId: string, subjectId: string, teacherCategoryRequirements: object } | null}
 */
export function fromElectiveSetting(doc) {
  if (!doc) return null;

  const classId = toStr(doc.class?._id || doc.class);
  const subjectId = toStr(doc.subject?._id || doc.subject);
  if (!classId || !subjectId) return null;

  let requirements = doc.teacherCategoryRequirements || {};
  if (requirements instanceof Map) {
    requirements = Object.fromEntries(requirements.entries());
  } else if (typeof requirements.toObject === "function") {
    requirements = requirements.toObject();
  }

  return { classId, subjectId, teacherCategoryRequirements: requirements };
}

/**
 * Load elective settings for a single class.
 *
 * @param {string} collegeId
 * @param {string} classId
 * @returns {Promise<ReturnType<typeof fromElectiveSetting>[]>}
 */
export async function loadElectiveSettingsForClass(collegeId, classId) {
  if (!collegeId || !classId) return [];

  const docs = await ElectiveSubjectSetting.find({ class: classId, collegeId }).lean();
  return docs.map(fromElectiveSetting).filter(Boolean);
}

/**
 * Load all elective settings for a college.
 *
 * @param {string} collegeId
 * @returns {Promise<ReturnType<typeof fromElectiveSetting>[]>}
 */
export async function loadElectiveSettings(collegeId) {
  if (!collegeId) return [];

  const docs = await ElectiveSubjectSetting.find({ collegeId }).lean();
  return docs.map(fromElectiveSetting).filter(Boolean);
}
