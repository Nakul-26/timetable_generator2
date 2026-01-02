import mongoose from "mongoose";
const { Schema } = mongoose;

const ResultSchema = new Schema({
  name: { type: String, required: true }, // A name for the saved timetable/assignment
  source: { type: String, enum: ['generator', 'manual', 'assignments'], default: 'manual' }, // To distinguish saved types
  createdAt: { type: Date, default: Date.now },
  assignments_only: { type: Object, default: null }, // To store { classId: [comboId1, comboId2] }
  class_timetables: Object, // Corresponds to classTimetable
  teacher_timetables: Object, // Corresponds to teacherTimetable
  subject_hours_assigned: Object, // Corresponds to subjectHoursAssigned
  config: Object, // Stores configuration like { days, hours }
  version: Number, // The version number from the in-memory state
  score: Number,
  combos: Object,
  allocations_report: Object,
});

export default mongoose.model('TimetableResult', ResultSchema);
