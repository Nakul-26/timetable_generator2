import { convertNewCollegeInput } from "./convertNewCollegeInputToGeneratorData.js";
import generator from "./generator.js";

const converted = convertNewCollegeInput({
  classes,
  subjects,
  teachers,
  classSubjects,
  classTeachers,
  teacherSubjectMap
});

const result = generator.generate({
  faculties: converted.faculties,
  subjects: converted.subjects,
  classes: converted.classes,
  combos: converted.combos
});
