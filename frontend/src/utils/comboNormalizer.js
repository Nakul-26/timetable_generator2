/**
 * Single boundary for normalizing generator/solver "combo" objects into one
 * canonical camelCase shape, so display code never has to guess between
 * snake_case (raw GeneratorCombo, from solver results / TimetableResult docs)
 * and populated Mongoose shapes (raw TeacherSubjectCombination docs).
 *
 * Canonical shape:
 * {
 *   id:           string
 *   subjectId:    string
 *   subjectName:  string | null
 *   teacherIds:   string[]
 *   teacherNames: string[]
 *   classIds:     string[]
 *   mode:         string | null   // e.g. "THEORY" | "LAB" | "ELECTIVE" | "NO_TEACHER"
 * }
 *
 * Mirrors backend/utils/comboNormalizer.js, adapted to the AssignmentDTO-style
 * field names (id/teacherIds/mode) already used by /fixed-slot-combos and the
 * Class Workspace, so the whole frontend speaks one combo shape.
 */

function toStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

function toStrArray(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  return [];
}

function extractSubjectId(raw) {
  return toStr(
    raw.subjectId ||
      raw.subject_id ||
      raw.subject?._id ||
      (typeof raw.subject === "string" ? raw.subject : "")
  );
}

function extractTeacherIds(raw) {
  const camel = toStrArray(raw.teacherIds);
  if (camel.length) return camel;
  const snake = toStrArray(raw.faculty_ids);
  if (snake.length) return snake;
  if (raw.faculty_id) return [toStr(raw.faculty_id)];
  if (raw.faculty?._id) return [toStr(raw.faculty._id)];
  if (typeof raw.faculty === "string") return [raw.faculty];
  return [];
}

function extractClassIds(raw) {
  const camel = toStrArray(raw.classIds);
  if (camel.length) return camel;
  const snake = toStrArray(raw.class_ids);
  if (snake.length) return snake;
  if (raw.class_id) return [toStr(raw.class_id)];
  if (raw.class?._id) return [toStr(raw.class._id)];
  return [];
}

function extractMode(raw) {
  const mode = toStr(
    raw.mode || raw.type || raw.subjectType || raw.subject_type || raw.subject?.type
  ).toUpperCase();
  return mode || null;
}

export function normalizeCombo(raw) {
  if (!raw) return null;
  const id = toStr(raw.id || raw._id || raw.comboId || raw.combo_id);
  if (!id) return null;

  const teacherIds = extractTeacherIds(raw);
  const teacherNames =
    Array.isArray(raw.teacherNames) && raw.teacherNames.length
      ? raw.teacherNames
      : raw.faculty?.name
        ? [raw.faculty.name]
        : [];

  return {
    id,
    subjectId: extractSubjectId(raw),
    subjectName: raw.subjectName || raw.subject?.name || null,
    teacherIds,
    teacherNames,
    classIds: extractClassIds(raw),
    mode: extractMode(raw),
  };
}

export function normalizeCombos(raws) {
  if (!Array.isArray(raws)) return [];
  return raws.map(normalizeCombo).filter(Boolean);
}
