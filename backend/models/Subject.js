const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const SubjectSchema = new Schema({
  id: { type: String, unique: true },
  name: String,
  no_of_hours_per_week: Number,
  sem: Number,
  faculty: [{ type: Schema.Types.ObjectId, ref: 'Faculty' }]
});
module.exports = mongoose.model('Subject', SubjectSchema);
