const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const ClassSchema = new Schema({
  id: { type: String, unique: true },
  sem: Number,
  name: String,
  section: String,
  assigned_teacher_subject_combos: [String], // combo ids
  total_class_hours: Number
});
module.exports = mongoose.model('Class', ClassSchema);
