import mongoose from "mongoose";
const { Schema } = mongoose;
const ResultSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  class_timetables: Object,   // { classId: [[slot,...], ...], ... }
  faculty_timetables: Object,  // { facultyId: [[...], ...], ... }
});
export default mongoose.model('TimetableResult', ResultSchema);
