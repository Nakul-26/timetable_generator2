const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ResultSchema = new Schema({
  createdAt: { type: Date, default: Date.now },
  class_timetables: Object,   // { classId: [[slot,...], ...], ... }
  faculty_timetables: Object,  // { facultyId: [[...], ...], ... }
});
module.exports = mongoose.model('TimetableResult', ResultSchema);
