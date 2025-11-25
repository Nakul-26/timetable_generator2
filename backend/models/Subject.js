
import mongoose from "mongoose";
const { Schema } = mongoose;
const SubjectSchema = new Schema({
  id: { type: String, unique: true },
  name: String,
  sem: Number,
  type: { 
    type: String, 
    enum: ["theory", "lab"], 
    required: true 
  },
  combined_classes: {
    type: [String],
    default: []
  }
});
export default mongoose.model('Subject', SubjectSchema);
