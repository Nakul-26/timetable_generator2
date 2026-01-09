import Faculty from "../../models/Faculty.js";
import Subject from "../../models/Subject.js";
import ClassModel from "../../models/Class.js";
import ClassSubject from "../../models/ClassSubject.js";
import TeacherSubjectCombination from "../../models/TeacherSubjectCombination.js";
import ElectiveSubjectSetting from "../../models/ElectiveSubjectSetting.js";
import converter from "../../models/lib/convertNewCollegeInputToGeneratorData.js";

export async function prepareGeneratorData() {
  const [
    faculties,
    subjects,
    classes,
    classSubjectsRaw,
    combosRaw,
    electiveSettings
  ] = await Promise.all([
    Faculty.find().lean(),
    Subject.find().lean(),
    ClassModel.find().populate("faculties").lean(),
    ClassSubject.find().lean(),
    TeacherSubjectCombination.find().lean(),
    ElectiveSubjectSetting.find().lean()
  ]);

  const classSubjects = classSubjectsRaw.map(cs => ({
    classId: cs.class,
    subjectId: cs.subject,
    hoursPerWeek: cs.hoursPerWeek
  }));

  const teacherSubjectCombos = combosRaw.map(c => ({
    teacherId: c.faculty,
    subjectId: c.subject
  }));

  const classTeachers = [];
  classes.forEach(c => {
    (c.faculties || []).forEach(f => {
      classTeachers.push({ classId: c._id, teacherId: f._id });
    });
  });

  const classElectiveSubjects = electiveSettings.map(setting => ({
    classId: setting.class.toString(),
    subjectId: setting.subject.toString(),
    teacherCategoryRequirements: setting.teacherCategoryRequirements
  }));

  return converter.convertNewCollegeInput({
    classes,
    subjects,
    teachers: faculties,
    classSubjects,
    classTeachers,
    teacherSubjectCombos,
    classElectiveSubjects
  });
}
