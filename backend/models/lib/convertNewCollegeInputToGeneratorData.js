// convertNewCollegeInputToGeneratorData.js
// FINAL UPDATED VERSION WITH ELECTIVE GROUP STRUCTURE SUPPORT
//-------------------------------------------------------------

export function convertNewCollegeInput({
  classes,
  subjects,
  teachers,
  classSubjects,
  classTeachers,
  teacherSubjectCombos = [],
  classElectiveGroups = []  // 🔹 NEW
}) {

  if (process.env.NODE_ENV !== "production") {
    console.log("Electives:", JSON.stringify(classElectiveGroups, null, 2));
  }

  //------------------------------------------------------------
  // Normalize
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


  //------------------------------------------------------------
  // Lookup maps
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

  function teacherCanTeach(tid, sid) {
    return teacherSubjectCombos.some(c => c.teacherId === tid && c.subjectId === sid);
  }


  //------------------------------------------------------------
  // Subjects
  //------------------------------------------------------------
  const subjectsOut = subjects.map(s => {
    const hoursList = classSubjects
      .filter(cs => cs.subjectId === s._id)
      .map(cs => Number(cs.hoursPerWeek || 0));

    const no_of_hours_per_week = hoursList.length ? Math.max(...hoursList) : 0;

    return {
      _id: s._id,
      name: s.name,
      sem: s.sem,
      type: s.type || "theory",
      combined_classes: Array.isArray(s.combined_classes)
        ? s.combined_classes.map(String)
        : [],
      no_of_hours_per_week
    };
  });


  //------------------------------------------------------------
  // Classes
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
      subject_hours,
      elective_groups: [] // 🔹 NEW
    };
  });


  //------------------------------------------------------------
  // Electives processing
  //------------------------------------------------------------
  let electiveIndex = 1;

  for (const eg of classElectiveGroups) {
    const classId = String(eg.classId);
    const classObj = classesOut.find(c => c._id === classId);
    if (!classObj) continue;

    const subjects = (eg.subjects || []).map(String).filter(id =>
      subjectsOut.some(s => s._id === id)
    );

    if (subjects.length < 2) continue; // must be at least two subjects to be parallel electives

    const teachers = [];
    for (const subId of subjects) {
      const tlist = teachersPerClass[classId] || [];
      for (const tid of tlist) {
        if (teacherCanTeach(tid, subId)) {
          teachers.push(tid);
          break;
        }
      }
    }

    classObj.elective_groups.push({
      groupId: `E${electiveIndex++}`, // auto ID
      subjects,
      teachers: [...new Set(teachers)]
    });
  }


  //------------------------------------------------------------
  // Generate teacher/time combos (unchanged)
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

      const eligibleTeachers = classTeach.filter(tid =>
        teacherCanTeach(tid, subjectId)
      );
      
      // Loop through all eligible teachers and create a combo for each
      for (const t of eligibleTeachers) {
        combos.push({
          _id: "C" + comboIndex++,
          faculty_id: t,
          subject_id: subjectId,
          class_ids: [classId],
          hours_per_week: hoursRequired,
          hours_per_class: { [classId]: hoursRequired },
          combo_name: `T${t}_S${subjectId}_C${classId}`
        });
      }
    }
  }

  //------------------------------------------------------------
  // Attach
  //------------------------------------------------------------
  for (const cls of classesOut) {
    cls.assigned_teacher_subject_combos = combos
      .filter(c => c.class_ids.includes(cls._id))
      .map(c => c._id);

    cls.total_class_hours = Object.values(cls.subject_hours)
      .reduce((a, b) => a + b, 0);
  }


  //------------------------------------------------------------
  // Fix subject_hours for elective groups (avoid double-counting)
  //------------------------------------------------------------
  for (const cls of classesOut) {
    let correctedHours = 0;
    const seenSubjects = new Set();

    // If no electives, keep original
    if (!cls.elective_groups || cls.elective_groups.length === 0) {
      cls.total_class_hours = Object.values(cls.subject_hours).reduce((a,b)=>a+b,0);
      continue;
    }

    // Add non-elective subjects normally
    for (const [subId, hrs] of Object.entries(cls.subject_hours)) {
      const isInElective = cls.elective_groups.some(g =>
        (g.subjects || []).map(String).includes(String(subId))
      );
      if (!isInElective) {
        correctedHours += hrs;
        seenSubjects.add(subId);
      }
    }

    // Add each elective group ONLY ONCE
    for (const eg of cls.elective_groups) {
      const subs = eg.subjects || [];
      if (subs.length === 0) continue;

      // All electives in group share same hours — take first
      const rep = subs[0];
      const hrs = cls.subject_hours[rep] || 0;

      correctedHours += hrs;
    }

    cls.total_class_hours = correctedHours;
  }


  //------------------------------------------------------------
  return {
    faculties: teachers.map(t => ({ _id: t._id, name: t.name || "" })),
    subjects: subjectsOut,
    classes: classesOut,
    combos
  };
}

export default { convertNewCollegeInput };
