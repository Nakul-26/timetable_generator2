
import mongoose from "mongoose";
const { Schema } = mongoose;
const ClassSchema = new Schema({
  id: { type: String, unique: true },
  sem: Number,
  name: String,
  section: String,
  days_per_week: { type: Number, default: 5 },
  assigned_teacher_subject_combos: [{ type: Schema.Types.ObjectId, ref: 'Combo' }],
  total_class_hours: Number
});
export default mongoose.model('Class', ClassSchema);
