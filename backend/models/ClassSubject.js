import mongoose from "mongoose";
const { Schema } = mongoose;

const ClassSubjectSchema = new Schema(
  {
    class: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    hoursPerWeek: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { timestamps: true }
);

ClassSubjectSchema.index(
  { class: 1, subject: 1 },
  { unique: true }
);

export default mongoose.model('ClassSubject', ClassSubjectSchema);
