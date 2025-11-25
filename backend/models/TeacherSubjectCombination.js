
import mongoose from "mongoose";
const { Schema } = mongoose;

const TeacherSubjectCombinationSchema = new Schema({
  faculty: { type: Schema.Types.ObjectId, ref: 'Faculty', required: true },
  subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
});

export default mongoose.model('TeacherSubjectCombination', TeacherSubjectCombinationSchema);
