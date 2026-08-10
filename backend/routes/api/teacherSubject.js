import { Router } from 'express';
import TeacherSubjectCombination from '../../models/TeacherSubjectCombination.js';
import auth from '../../middleware/auth.js';

const protectedRouter = Router();
protectedRouter.use(auth);

// --- Teacher Subject Combinations (read-only) ---
// Writes now happen exclusively via /teaching-allocations (see routes/api/teachingAllocation.js
// and the Class Workspace page). This route stays read-only so legacy consumers of the
// combo-shaped teacher-subject list (Timetable.jsx, ManualTimetable.jsx, ViewTimetable.jsx,
// DataContext) keep working until they're migrated to AssignmentDTO in Phase 4.

// Get all teacher-subject combinations
protectedRouter.get('/teacher-subject-combos', async (req, res) => {
  try {
    const combos = await TeacherSubjectCombination.find({ collegeId: req.collegeId }).populate('faculty').populate('subject').lean();
    res.json(combos);
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default protectedRouter;
