// const mongoose = require('mongoose');
// const Schema = mongoose.Schema;
// const ComboSchema = new Schema({
//   id: { type: String, unique: true },
//   faculty_id: Number,
//   subject_id: Number,
//   combo_name: String
// });
// module.exports = mongoose.model('Combo', ComboSchema);


const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ComboSchema = new Schema({
  id: { type: Number, unique: true },  // keep your numeric sequence id if needed
  faculty_id: { type: Schema.Types.ObjectId, ref: "Faculty", required: true },
  subject_id: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
  combo_name: { type: String, required: true }
});

module.exports = mongoose.model('Combo', ComboSchema);
