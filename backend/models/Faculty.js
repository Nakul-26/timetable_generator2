import mongoose from "mongoose";
const { Schema } = mongoose;
const FacultySchema = new Schema({
  id: { type: String, unique: true },
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'faculty'], default: 'faculty' }
});
export default mongoose.model('Faculty', FacultySchema);
