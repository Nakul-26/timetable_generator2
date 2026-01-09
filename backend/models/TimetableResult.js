import mongoose from "mongoose";
const { Schema } = mongoose;
import TeacherSubjectCombination from './TeacherSubjectCombination.js'; // Import the combo model

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
  { 
    timestamps: true,
    toJSON: { virtuals: true }, // Ensure virtuals are included in toJSON
    toObject: { virtuals: true } // Ensure virtuals are included in toObject
  }
);

// Indexes for fast queries
ResultSchema.index({ createdAt: -1 });
ResultSchema.index({ source: 1, createdAt: -1 });

// Post-find hook to populate assignments when the source is 'assignments'
ResultSchema.post('find', async function(docs, next) {
  // Check if we need to populate.
  const needsPopulation = docs.some(doc => doc.source === 'assignments' && doc.assignments_only);

  if (!needsPopulation) {
    return next();
  }

  try {
    for (const doc of docs) {
      if (doc.source === 'assignments' && doc.assignments_only) {
        const populated_assignments = {};
        const classIds = Object.keys(doc.assignments_only);

        for (const classId of classIds) {
          const comboIds = doc.assignments_only[classId];
          if (Array.isArray(comboIds) && comboIds.length > 0) {
            // CRITICAL FIX: Filter for valid ObjectIds before querying to prevent CastError
            const validMongoIds = comboIds.filter(id => mongoose.Types.ObjectId.isValid(id));
            
            let populatedCombos = [];
            if (validMongoIds.length > 0) {
                populatedCombos = await TeacherSubjectCombination.find({
                    '_id': { $in: validMongoIds }
                }).populate('faculty', 'name').populate('subject', 'name').lean();
            }
            populated_assignments[classId] = populatedCombos;
          } else {
            populated_assignments[classId] = [];
          }
        }
        // Attach the populated data to a virtual field.
        doc.populated_assignments = populated_assignments;
      }
    }
    next();
  } catch (error) {
    console.error("Error during post-find population:", error);
    next(error);
  }
});


export default mongoose.model('TimetableResult', ResultSchema);
