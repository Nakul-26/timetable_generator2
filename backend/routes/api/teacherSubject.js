import { Router } from 'express';
import TeacherSubjectCombination from '../../models/TeacherSubjectCombination.js';
import auth from '../../middleware/auth.js';


const protectedRouter = Router();
protectedRouter.use(auth);

// --- Teacher Subject Combination CRUD ---
// Get all teacher-subject combinations
protectedRouter.get('/teacher-subject-combos', async (req, res) => {
  try {
    const combos = await TeacherSubjectCombination.find().populate('faculty').populate('subject').lean();
    res.json(combos);
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Create a new teacher-subject combination
protectedRouter.post('/teacher-subject-combos', async (req, res) => {
  try {
    const { faculty, subject } = req.body;
    const combo = new TeacherSubjectCombination({ faculty, subject });
    await combo.save();
    res.json(combo);
  } catch (e) {
    res.status(400).json({ error: 'Bad Request' });
  }
});

// Delete a teacher-subject combination
protectedRouter.delete('/teacher-subject-combos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCombo = await TeacherSubjectCombination.findByIdAndDelete(id);
    if (!deletedCombo) {
      return res.status(404).json({ error: 'Combination not found.' });
    }
    res.json({ message: 'Combination deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default protectedRouter;
