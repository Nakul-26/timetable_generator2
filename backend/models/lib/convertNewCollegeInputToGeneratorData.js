// convertNewCollegeInputToGeneratorData.js
//
// FINAL UPDATED VERSION
// ✔ class-specific required hours -> class.subject_hours
// ✔ subjects have fallback no_of_hours_per_week
// ✔ combo-hours used only for teacher splitting
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
  // Subjects (fallback hours included)
  //------------------------------------------------------------
  const subjectsOut = subjects.map(s => {
    const hoursList = classSubjects
      .filter(cs => cs.subjectId === s._id)
      .map(cs => Number(cs.hoursPerWeek || 0));

    const no_of_hours_per_week = hoursList.length
      ? Math.max(...hoursList)
      : 0;

    return {
      _id: s._id,
      name: s.name,
      sem: s.sem,
      type: s.type || "theory",
      combined_classes: Array.isArray(s.combinedClasses)
        ? s.combinedClasses.map(String)
        : [],
      no_of_hours_per_week
    };
  });

  //------------------------------------------------------------
  // Classes - include subject_hours
  //------------------------------------------------------------
  const classesOut = classes.map(c => {
    const classId = c._id;
    const subject_hours = {};

    for (const key in hoursPerClassSubject) {
      const [cid, sid] = key.split("|");
      if (cid === classId) {
        subject_hours[sid] = hoursPerClassSubject[key];
      }
    }

    return {
      _id: classId,
      id: classId,
      name: c.name,
      sem: c.sem,
      section: c.section || "",
      days_per_week: c.days_per_week || 6,
      assigned_teacher_subject_combos: [],
      total_class_hours: 0,
      subject_hours
    };
  });

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

      const hoursRequired = cls.subject_hours[subjectId] || 0;
      if (hoursRequired <= 0) continue;

      const eligibleTeachers = classTeach.filter(tId =>
        teacherCanTeach(tId, subjectId)
      );
      if (eligibleTeachers.length === 0) continue;

      const splitHours = hoursRequired / eligibleTeachers.length;

      for (const teacherId of eligibleTeachers) {
        combos.push({
          _id: "C" + comboIndex++,
          faculty_id: teacherId,
          subject_id: subjectId,
          class_ids: [classId],
          hours_per_week: splitHours,
          hours_per_class: { [classId]: splitHours },
          combo_name: `T${teacherId}_S${subjectId}_C${classId}`
        });
      }
    }
  }

  console.log('--- Generated Combos (teacher splits) ---');
  console.log(JSON.stringify(combos, null, 2));
  console.log('----------------------------------------');

  //------------------------------------------------------------
  // Attach combos + calculate total_class_hours from subject_hours
  //------------------------------------------------------------
  for (const cls of classesOut) {
    cls.assigned_teacher_subject_combos = combos
      .filter(c => c.class_ids.includes(cls._id))
      .map(c => c._id);

    cls.total_class_hours = Object.values(cls.subject_hours)
      .reduce((a, b) => a + b, 0);
  }

  console.log('--- Final Output ---');
  console.log('Faculties:', JSON.stringify(faculties, null, 2));
  console.log('Subjects:', JSON.stringify(subjectsOut, null, 2));
  console.log('Classes:', JSON.stringify(classesOut, null, 2));
  console.log('Combos:', JSON.stringify(combos, null, 2));
  console.log('--------------------');

  return {
    faculties,
    subjects: subjectsOut,
    classes: classesOut,
    combos
  };
}

export default { convertNewCollegeInput };
