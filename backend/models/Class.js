
import mongoose from "mongoose";
const { Schema } = mongoose;
const ClassSchema = new Schema({
  id: { type: String, unique: true },
  sem: Number,
  name: String,
  section: String,
  days_per_week: { type: Number, default: 5 },
  total_class_hours: Number,
  subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  faculties: [{ type: Schema.Types.ObjectId, ref: 'Faculty' }],
});
export default mongoose.model('Class', ClassSchema);
