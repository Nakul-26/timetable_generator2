import { Router } from 'express';
import ClassSubject from '../../models/ClassSubject.js';
import auth from '../../middleware/auth.js';


const protectedRouter = Router();
protectedRouter.use(auth);

// --- Class Subject Assignments CRUD ---

// Get all class-subject assignments
protectedRouter.get('/class-subjects', async (req, res) => {
    try {
        const assignments = await ClassSubject.find().populate('class').populate('subject').lean();
        res.json(assignments);
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create a new class-subject assignment
protectedRouter.post('/class-subjects', async (req, res) => {
    try {
        const { classId, subjectId, hoursPerWeek } = req.body;
        const assignment = new ClassSubject({ class: classId, subject: subjectId, hoursPerWeek });
        await assignment.save();
        res.json(assignment);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});

// Update a class-subject assignment
protectedRouter.put('/class-subjects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { hoursPerWeek } = req.body;
        const updatedAssignment = await ClassSubject.findByIdAndUpdate(
            id,
            { hoursPerWeek },
            { new: true }
        );
        if (!updatedAssignment) {
            return res.status(404).json({ error: 'Assignment not found.' });
        }
        res.json(updatedAssignment);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});

// Delete a class-subject assignment
protectedRouter.delete('/class-subjects/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedAssignment = await ClassSubject.findByIdAndDelete(id);
        if (!deletedAssignment) {
            return res.status(404).json({ error: 'Assignment not found.' });
        }
        res.json({ message: 'Assignment deleted successfully.' });
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default protectedRouter;
