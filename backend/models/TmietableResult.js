import mongoose from "mongoose";
const { Schema } = mongoose;

const ResultSchema = new Schema({
  name: { type: String, required: true }, // A name for the saved timetable
  source: { type: String, enum: ['generator', 'manual'], default: 'manual' }, // To distinguish saved types
  createdAt: { type: Date, default: Date.now },
  class_timetables: Object, // Corresponds to classTimetable
  teacher_timetables: Object, // Corresponds to teacherTimetable
  subject_hours_assigned: Object, // Corresponds to subjectHoursAssigned
  config: Object, // Stores configuration like { days, hours }
  version: Number, // The version number from the in-memory state
});

export default mongoose.model('TimetableResult', ResultSchema);
