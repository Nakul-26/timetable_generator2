import { Router } from 'express';
import ClassSubject from '../../models/ClassSubject.js';
import auth from '../../middleware/auth.js';

const protectedRouter = Router();
protectedRouter.use(auth);

// --- Class Subject Assignments (read-only) ---
// Writes now happen exclusively via /teaching-allocations (see routes/api/teachingAllocation.js
// and the Class Workspace page). This route stays read-only so legacy consumers of the
// combo-shaped class-subject list (Timetable.jsx, ManualTimetable.jsx, DataContext) keep working
// until they're migrated to AssignmentDTO in Phase 4.

// Get all class-subject assignments
protectedRouter.get('/class-subjects', async (req, res) => {
    try {
        const assignments = await ClassSubject.find({ collegeId: req.collegeId }).populate('class').populate('subject').lean();
        res.json(assignments);
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default protectedRouter;
