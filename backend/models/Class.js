
import mongoose from "mongoose";
const { Schema } = mongoose;
const ClassSchema = new Schema({
  id: { type: String, unique: true },
  sem: Number,
  name: String,
  section: String,
  days_per_week: { type: Number, default: 5 },
  total_class_hours: Number,
  faculties: [{ type: Schema.Types.ObjectId, ref: 'Faculty' }],
  assigned_teacher_subject_combos: [{ type: Schema.Types.ObjectId, ref: 'TeacherSubjectCombination' }],
  subject_hours: {
    type: Map,
    of: Number
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  }

});
export default mongoose.model('Class', ClassSchema);
