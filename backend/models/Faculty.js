const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const FacultySchema = new Schema({
  id: { type: String, unique: true },
  name: String
});
module.exports = mongoose.model('Faculty', FacultySchema);
