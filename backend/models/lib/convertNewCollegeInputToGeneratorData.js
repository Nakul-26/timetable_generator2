// convertNewCollegeInputToGeneratorData.js
//
// Converts NEW COLLEGE MODEL into generator-compatible model.
//
// INPUT MODEL:
//
// classes: [
//   { id, name, sem, days_per_week }
// ]
//
// subjects: [
//   { id, name, sem, no_of_hours_per_week, type, combinedClasses?: [] }
// ]
//
// classSubjects: [
//   { classId, subjectId }
// ]
//
// classTeachers: [
//   { classId, teacherId }
// ]
//
// teachers: [
//   { id, name }
// ]
//
// teacherSubjectMap (optional): [
//   { teacherId, subjectId }   // only if specialization is needed
// ]
//
// OUTPUT MODEL → FEEDS DIRECTLY INTO YOUR GENERATOR:
// {
//   faculties,
//   subjects,
//   classes,
//   combos
// }
//
// NOTE: For combined classes:
// If a subject has combinedClasses: ["A", "B"]
// → one combo will be created with combo.class_ids = ["A","B"]
// → generator enforces strict combined mode.
// ----------------------------------------------------------------------

export function convertNewCollegeInput({
  classes,
  subjects,
  teachers,
  classSubjects,
  classTeachers,
  teacherSubjectMap = null,
}) {
  // --- Normalize all IDs to strings ---
  classes = classes.map(c => ({ ...c, _id: String(c.id || c._id) }));
  subjects = subjects.map(s => ({ ...s, _id: String(s.id || s._id) }));
  teachers = teachers.map(t => ({ ...t, _id: String(t.id || t._id) }));
  classSubjects = classSubjects.map(cs => ({
    classId: String(cs.classId),
    subjectId: String(cs.subjectId),
  }));
  classTeachers = classTeachers.map(ct => ({
    classId: String(ct.classId),
    teacherId: String(ct.teacherId),
  }));
  if (teacherSubjectMap) {
    teacherSubjectMap = teacherSubjectMap.map(x => ({
      teacherId: String(x.teacherId),
      subjectId: String(x.subjectId),
    }));
  }

  // ----------------------------------------------------------------------
  // 1. Faculties array for generator
  // ----------------------------------------------------------------------
  const faculties = teachers.map(t => ({
    _id: t._id,
    name: t.name,
  }));

  // ----------------------------------------------------------------------
  // 2. Subjects array for generator
  // Add default values if missing
  // ----------------------------------------------------------------------
  const subjectsOut = subjects.map(s => ({
    _id: s._id,
    name: s.name,
    sem: s.sem,
    no_of_hours_per_week: s.no_of_hours_per_week || 0,
    type: s.type || "theory",
    combined_classes: Array.isArray(s.combinedClasses)
      ? s.combinedClasses.map(String)
      : [],
  }));

  // ----------------------------------------------------------------------
  // 3. Classes array for generator
  // ----------------------------------------------------------------------
  const classesOut = classes.map(c => ({
    _id: c._id,
    id: c._id,
    name: c.name,
    sem: c.sem,
    section: c.section || "",
    days_per_week: c.days_per_week || 6,
    assigned_teacher_subject_combos: [], // filled below
    total_class_hours: 0, // computed later by generator
  }));

  // ----------------------------------------------------------------------
  // BUILD: Helper maps for quick lookup
  // ----------------------------------------------------------------------
  const teachersPerClass = {}; // classId → [teacherIds]
  const subjectsPerClass = {}; // classId → [subjectIds]

  for (const ct of classTeachers) {
    if (!teachersPerClass[ct.classId]) teachersPerClass[ct.classId] = [];
    teachersPerClass[ct.classId].push(ct.teacherId);
  }
  for (const cs of classSubjects) {
    if (!subjectsPerClass[cs.classId]) subjectsPerClass[cs.classId] = [];
    subjectsPerClass[cs.classId].push(cs.subjectId);
  }

  // ----------------------------------------------------------------------
  // 4. Generate COMBOS
  // ----------------------------------------------------------------------
  const combos = [];
  let comboCounter = 1;

  function isTeacherAllowed(teacherId, subjectId) {
    if (!teacherSubjectMap) return true;
    return teacherSubjectMap.some(
      x => x.teacherId === teacherId && x.subjectId === subjectId
    );
  }

  for (const cls of classesOut) {
    const classId = cls._id;

    const subjList = subjectsPerClass[classId] || [];
    const teacherList = teachersPerClass[classId] || [];

    for (const subjectId of subjList) {
      const subj = subjectsOut.find(s => s._id === subjectId);
      if (!subj) continue;

      // CASE 1 — combined subject
      if (subj.combined_classes && subj.combined_classes.length > 1) {
        // only the FIRST class generates the combined combo
        const firstClass = subj.combined_classes[0];
        if (classId !== firstClass) continue;

        // pick all teachers assigned to ANY of the combined classes
        const unionTeachers = new Set();
        for (const cid of subj.combined_classes) {
          const list = teachersPerClass[cid] || [];
          list.forEach(t => unionTeachers.add(t));
        }

        for (const teacherId of unionTeachers) {
          if (!isTeacherAllowed(teacherId, subjectId)) continue;

          combos.push({
            _id: String("C" + comboCounter++),
            faculty_id: teacherId,
            subject_id: subjectId,
            class_ids: subj.combined_classes.map(String),
            combo_name: `${teacherId}_${subjectId}_combined`,
          });
        }
        continue;
      }

      // CASE 2 — normal (non-combined) subject for this class
      for (const teacherId of teacherList) {
        if (!isTeacherAllowed(teacherId, subjectId)) continue;

        combos.push({
          _id: String("C" + comboCounter++),
          faculty_id: teacherId,
          subject_id: subjectId,
          class_ids: [classId],
          combo_name: `${teacherId}_${subjectId}_${classId}`,
        });
      }
    }
  }

  // ----------------------------------------------------------------------
  // 5. Attach combos to classes
  // ----------------------------------------------------------------------
  for (const cls of classesOut) {
    cls.assigned_teacher_subject_combos = combos
      .filter(cb => cb.class_ids.includes(cls._id))
      .map(cb => cb._id);
  }

  // ----------------------------------------------------------------------
  // 6. Return generator-ready model
  // ----------------------------------------------------------------------
  return {
    faculties,
    subjects: subjectsOut,
    classes: classesOut,
    combos,
  };
}

export default { convertNewCollegeInput };
