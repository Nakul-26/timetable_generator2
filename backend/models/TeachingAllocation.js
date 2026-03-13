import mongoose from "mongoose";

const { Schema } = mongoose;

const TeachingAllocationSchema = new Schema(
  {
    classIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Class",
        required: true,
      },
    ],
    subject: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    teacher: {
      type: Schema.Types.ObjectId,
      ref: "Faculty",
      default: null,
    },
    hoursPerWeek: {
      type: Number,
      required: true,
      min: 1,
    },
    combinedClassGroupId: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

TeachingAllocationSchema.index({ teacher: 1, subject: 1, combinedClassGroupId: 1 });

export default mongoose.model("TeachingAllocation", TeachingAllocationSchema);
