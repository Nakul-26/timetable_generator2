
import mongoose from "mongoose";
const { Schema } = mongoose;
const FacultySchema = new Schema({
  id: { type: String, unique: true },
  name: String
});
export default mongoose.model('Faculty', FacultySchema);
