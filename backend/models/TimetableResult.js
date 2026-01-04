import mongoose from "mongoose";
const { Schema } = mongoose;

const ResultSchema = new Schema(
  {
    name: { type: String, required: true },

    source: {
      type: String,
      enum: ['generator', 'manual', 'assignments'],
      default: 'manual'
    },

    // Assignment-only results:
    // { [classId]: [teacherSubjectComboId, ...] }
    assignments_only: { type: Object, default: null },

    // Generator / manual outputs
    class_timetables: Object,
    faculty_timetables: Object,
    faculty_daily_hours: Object,

    // Metadata
    config: Object,        // { days, hours, fixedSlots, ... }
    version: Number,
    score: Number,

    combos: Object,
    allocations_report: Object,
  },
  { timestamps: true }
);

// Indexes for fast queries
ResultSchema.index({ createdAt: -1 });
ResultSchema.index({ source: 1, createdAt: -1 });

export default mongoose.model('TimetableResult', ResultSchema);
