import { Router } from 'express';
import Subject from '../../models/Subject.js';
import TeacherSubjectCombination from '../../models/TeacherSubjectCombination.js';
import ClassSubject from '../../models/ClassSubject.js';
import auth from '../../middleware/auth.js';


const protectedRouter = Router();
protectedRouter.use(auth);

// --- Subjects CRUD ---
// Add a subject
protectedRouter.post('/subjects', async (req, res) => {
  console.log("[POST /subjects] Body:", req.body);
  try {
    const s = new Subject({
      id: req.body.id,
      name: req.body.name,
      sem: req.body.sem,
      type: req.body.type, // ✅ new property
      combined_classes: req.body.combined_classes
    });

    await s.save();
    console.log("[POST /subjects] Saved subject:", s);
    res.json(s);
  } catch (e) {
    res.status(400).json({ error: 'Bad Request' });
  }
});

// Get all subjects
protectedRouter.get('/subjects', async (req, res) => {
  console.log("[GET /subjects] Fetching all subjects");
  try {
    const subjects = await Subject.find().lean();
    console.log("[GET /subjects] Found:", subjects.length, "records");
    res.json(subjects);
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Edit a subject
protectedRouter.put('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sem, type, combined_classes, isElective } = req.body;

    const updatedSubject = await Subject.findOneAndUpdate(
      { _id: id },
      { name, sem, type, combined_classes, isElective },
      { new: true, runValidators: true }
    );

    if (!updatedSubject) {
      return res.status(404).json({ error: "Subject not found." });
    }
    res.json(updatedSubject);
  } catch (e) {
    res.status(400).json({ error: 'Bad Request' });
  }
});

// Delete a subject
protectedRouter.delete('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSubject = await Subject.findByIdAndDelete(id);
    if (!deletedSubject) {
      return res.status(404).json({ error: "Subject not found." });
    }

    // Delete associated teacher-subject combinations
    await TeacherSubjectCombination.deleteMany({ subject: id });

    // Delete associated class-subject assignments
    await ClassSubject.deleteMany({ subject: id });

    res.json({ message: "Subject deleted successfully." });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default protectedRouter;
