import mongoose from "mongoose";
const { Schema } = mongoose;

const SubjectSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    sem: {
      type: Number,
      required: true,
      min: 1,
    },
    type: {
      type: String,
      enum: ["theory", "lab"],
      required: true,
    },
    combined_classes: {
      type: [String], // keep as String if you are using class codes
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('Subject', SubjectSchema);
