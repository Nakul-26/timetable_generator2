
import mongoose from "mongoose";
const { Schema } = mongoose;
const ComboSchema = new Schema({
  faculty_id: { type: Schema.Types.ObjectId, ref: "Faculty", required: true },
  subject_id: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
  class_id: { type: Schema.Types.ObjectId, ref: "Class", required: true },
  combo_name: { type: String, required: true }
});
export default mongoose.model('Combo', ComboSchema);
