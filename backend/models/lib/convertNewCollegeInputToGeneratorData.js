// convertNewCollegeInputToGeneratorData.js
//
// UPDATED for new college model:
//
// ✔ subjects are class-specific hours (hoursPerWeek)
// ✔ teacher-subject allowed list
// ✔ teachers assigned to class
// ✔ subjects assigned to class
// ✔ combos generated only if all mappings match
// ✔ class-specific hours stored inside each combo
// --------------------------------------------------------------

export function convertNewCollegeInput({
  classes,
  subjects,
  teachers,
  classSubjects,          // { classId, subjectId, hoursPerWeek }
  classTeachers,          // { classId, teacherId }
  teacherSubjectCombos = []
}) {
  console.log('--- Input Data ---');
  console.log('Classes:', JSON.stringify(classes, null, 2));
  console.log('Subjects:', JSON.stringify(subjects, null, 2));
  console.log('Teachers:', JSON.stringify(teachers, null, 2));
  console.log('Class-Subjects:', JSON.stringify(classSubjects, null, 2));
  console.log('Class-Teachers:', JSON.stringify(classTeachers, null, 2));
  console.log('Teacher-Subject Combos:', JSON.stringify(teacherSubjectCombos, null, 2));
  console.log('--------------------');

  //------------------------------------------------------------
  // Normalize IDs
  //------------------------------------------------------------
  classes = classes.map(c => ({ ...c, _id: String(c._id) }));
  subjects = subjects.map(s => ({ ...s, _id: String(s._id) }));
  teachers = teachers.map(t => ({ ...t, _id: String(t._id) }));

  classSubjects = classSubjects.map(cs => ({
    classId: String(cs.classId),
    subjectId: String(cs.subjectId),
    hoursPerWeek: Number(cs.hoursPerWeek || 0)
  }));

  classTeachers = classTeachers.map(ct => ({
    classId: String(ct.classId),
    teacherId: String(ct.teacherId)
  }));

  teacherSubjectCombos = teacherSubjectCombos.map(x => ({
    teacherId: String(x.teacherId),
    subjectId: String(x.subjectId)
  }));

  console.log('--- Normalized Data ---');
  console.log('Normalized Class-Subjects:', JSON.stringify(classSubjects, null, 2));
  console.log('Normalized Class-Teachers:', JSON.stringify(classTeachers, null, 2));
  console.log('Normalized Teacher-Subject Combos:', JSON.stringify(teacherSubjectCombos, null, 2));
  console.log('-----------------------');

  //------------------------------------------------------------
  // Faculties
  //------------------------------------------------------------
  const faculties = teachers.map(t => ({
    _id: t._id,
    name: t.name || ""
  }));

  //------------------------------------------------------------
  // Subjects (no hours stored here anymore)
  //------------------------------------------------------------
  const subjectsOut = subjects.map(s => ({
    _id: s._id,
    name: s.name,
    sem: s.sem,
    type: s.type || "theory",
    combined_classes: Array.isArray(s.combinedClasses)
      ? s.combinedClasses.map(String)
      : []
  }));

  //------------------------------------------------------------
  // Classes
  //------------------------------------------------------------
  const classesOut = classes.map(c => ({
    _id: c._id,
    id: c._id,
    name: c.name,
    sem: c.sem,
    section: c.section || "",
    days_per_week: c.days_per_week || 6,
    assigned_teacher_subject_combos: [],
    total_class_hours: 0
  }));

  //------------------------------------------------------------
  // Build lookup maps
  //------------------------------------------------------------
  const subjectsPerClass = {};
  const teachersPerClass = {};
  const hoursPerClassSubject = {};

  for (const cs of classSubjects) {
    if (!subjectsPerClass[cs.classId]) subjectsPerClass[cs.classId] = [];
    subjectsPerClass[cs.classId].push(cs.subjectId);

    hoursPerClassSubject[`${cs.classId}|${cs.subjectId}`] = cs.hoursPerWeek;
  }

  for (const ct of classTeachers) {
    if (!teachersPerClass[ct.classId]) teachersPerClass[ct.classId] = [];
    teachersPerClass[ct.classId].push(ct.teacherId);
  }

  function teacherCanTeach(teacherId, subjectId) {
    return teacherSubjectCombos.some(
      x => x.teacherId === teacherId && x.subjectId === subjectId
    );
  }

  //------------------------------------------------------------
  // COMBO GENERATION
  //------------------------------------------------------------
  const combos = [];
  let comboIndex = 1;

  for (const cls of classesOut) {
    const classId = cls._id;
    const classSubjs = subjectsPerClass[classId] || [];
    const classTeach = teachersPerClass[classId] || [];

    for (const subjectId of classSubjs) {
      const subj = subjectsOut.find(s => s._id === subjectId);
      if (!subj) continue;

      const hours = hoursPerClassSubject[`${classId}|${subjectId}`];
      if (!hours || hours <= 0) continue;

      const isCombined = subj.combined_classes.length > 1;

      //------------------------------------------------------------
      // STRICT COMBINED SUBJECT HANDLING
      //------------------------------------------------------------
      if (isCombined) {
        const firstClass = subj.combined_classes[0];
        if (classId !== firstClass) continue;

        // union of teachers of all involved classes
        const unionTeachers = new Set();
        for (const cid of subj.combined_classes) {
          (teachersPerClass[cid] || []).forEach(t => unionTeachers.add(t));
        }
        
        const eligibleTeachers = [...unionTeachers].filter(teacherId => teacherCanTeach(teacherId, subjectId));
        const teacherCount = eligibleTeachers.length;
        if (teacherCount === 0) continue;

        const hoursPerTeacher = Math.floor((hours / teacherCount) * 100) / 100;


        for (const teacherId of eligibleTeachers) {
          if (!teacherCanTeach(teacherId, subjectId)) continue;

          combos.push({
            _id: "C" + comboIndex++,
            faculty_id: teacherId,
            subject_id: subjectId,
            class_ids: subj.combined_classes.map(String),
            hours_per_week: hoursPerTeacher,               // hours apply to each class
            hours_per_class: Object.fromEntries(
              subj.combined_classes.map(c => [
                c,
                hoursPerClassSubject[`${c}|${subjectId}`] || hours
              ])
            ),
            combo_name: `T${teacherId}_S${subjectId}_combined`
          });
        }

        continue;
      }

      //------------------------------------------------------------
      // NORMAL SUBJECT
      //------------------------------------------------------------
      const eligibleTeachers = classTeach.filter(teacherId => teacherCanTeach(teacherId, subjectId));
      const teacherCount = eligibleTeachers.length;
      if (teacherCount === 0) continue;

      const hoursPerTeacher = Math.floor((hours / teacherCount) * 100) / 100;

      for (const teacherId of eligibleTeachers) {
        combos.push({
          _id: "C" + comboIndex++,
          faculty_id: teacherId,
          subject_id: subjectId,
          class_ids: [classId],
          hours_per_week: hoursPerTeacher,
          hours_per_class: { [classId]: hoursPerTeacher },
          combo_name: `T${teacherId}_S${subjectId}_C${classId}`
        });
      }
    }
  }
  
  console.log('--- Generated Combos ---');
  console.log(JSON.stringify(combos, null, 2));
  console.log('------------------------');

  //------------------------------------------------------------
  // Attach combos to classes
  //------------------------------------------------------------
  for (const cls of classesOut) {
    cls.assigned_teacher_subject_combos = combos
      .filter(c => c.class_ids.includes(cls._id))
      .map(c => c._id);

    cls.total_class_hours = combos
      .filter(c => c.class_ids.includes(cls._id))
      .reduce((sum, c) => sum + (c.hours_per_class[cls._id] || 0), 0);
  }

  console.log('--- Final Output ---');
  console.log('Faculties:', JSON.stringify(faculties, null, 2));
  console.log('Subjects:', JSON.stringify(subjectsOut, null, 2));
  console.log('Classes:', JSON.stringify(classesOut, null, 2));
  console.log('Combos:', JSON.stringify(combos, null, 2));
  console.log('--------------------');

  //------------------------------------------------------------
  // Export final dataset
  //------------------------------------------------------------
  return {
    faculties,
    subjects: subjectsOut,
    classes: classesOut,
    combos
  };
}

export default { convertNewCollegeInput };
