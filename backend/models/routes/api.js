import { Router } from 'express';
import Faculty from '../Faculty.js';
import Subject from '../Subject.js';
import ClassModel from '../Class.js';
import Combo from '../Combo.js';
import TimetableResult from '../TmietableResult.js';
import generator from '../lib/generator.js';
import runGenerate from '../lib/runGenerator.js';
import mongoose from "mongoose";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import auth from '../../middleware/auth.js';

const router = Router();
const protectedRouter = Router();

protectedRouter.use(auth);

// --- User Authentication ---
router.post('/register', async (req, res) => {
  try {
    const { id, name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new Faculty({ id, name, email, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const faculty = await Faculty.findOne({ email });
        if (!faculty) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, faculty.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: faculty._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
        res.json({ success: true, user: faculty });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token').json({ success: true });
});

protectedRouter.get('/me', (req, res) => {
    res.json(req.user);
});

// --- Faculties CRUD ---
//add faculties
protectedRouter.post('/faculties', async (req, res) => {
  console.log("[POST /faculties] Body:", req.body);
  try {
    const f = new Faculty();
    f.id = req.body.id;
    f.name = req.body.name;
    await f.save();
    console.log("[POST /faculties] Saved faculty:", f);
    res.json(f);
  } catch (e) {
    console.error("[POST /faculties] Error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

//get all faculties
protectedRouter.get('/faculties', async (req, res) => {
  console.log("[GET /faculties] Fetching all faculties");
  try {
    const faculties = await Faculty.find().lean();
    console.log("[GET /faculties] Found:", faculties.length, "records");
    res.json(faculties);
  } catch (e) {
    console.error("[GET /faculties] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Update an existing faculty
protectedRouter.put('/faculties/:id', async (req, res) => {
  console.log("[PUT /faculties/:id] Params:", req.params, "Body:", req.body);
  try {
    const { id } = req.params;
    const { name, id: facultyId } = req.body;
    const updatedFaculty = await Faculty.findOneAndUpdate(
      { _id: id },
      { name: name, id: facultyId },
      { new: true, runValidators: true }
    );
    if (!updatedFaculty) {
      console.warn("[PUT /faculties/:id] Faculty not found for _id:", id);
      return res.status(404).json({ error: 'Faculty not found.' });
    }
    console.log("[PUT /faculties/:id] Updated faculty:", updatedFaculty);
    res.json(updatedFaculty);
  } catch (e) {
    console.error("[PUT /faculties/:id] Error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

// Delete a faculty
protectedRouter.delete('/faculties/:id', async (req, res) => {
  console.log("[DELETE /faculties/:id] Params:", req.params);
  try {
    const { id } = req.params;
    const deletedFaculty = await Faculty.findByIdAndDelete(id);
    if (!deletedFaculty) {
      console.warn("[DELETE /faculties/:id] Faculty not found:", id);
      return res.status(404).json({ error: 'Faculty not found.' });
    }

    const deletedCombos = await Combo.deleteMany({ faculty_id: id });
    console.log(
      `[DELETE /faculties/:id] Deleted ${deletedCombos.deletedCount} combos linked to faculty ${id}`
    );

    console.log("[DELETE /faculties/:id] Deleted faculty:", deletedFaculty);
    res.json({ message: 'Faculty deleted successfully.' });
  } catch (e) {
    console.error("[DELETE /faculties/:id] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Subjects CRUD ---
// Add a subject
protectedRouter.post('/subjects', async (req, res) => {
  console.log("[POST /subjects] Body:", req.body);
  try {
    const s = new Subject({
      id: req.body.id,
      name: req.body.name,
      no_of_hours_per_week: req.body.no_of_hours_per_week,
      sem: req.body.sem,
      type: req.body.type // ✅ new property
    });

    await s.save();
    console.log("[POST /subjects] Saved subject:", s);
    res.json(s);
  } catch (e) {
    console.error("[POST /subjects] Error:", e.message);
    res.status(400).json({ error: e.message });
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
    console.error("[GET /subjects] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Edit a subject
protectedRouter.put('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, no_of_hours_per_week, sem, type } = req.body;

    const updatedSubject = await Subject.findOneAndUpdate(
      { _id: id },
      { name, no_of_hours_per_week, sem, type }, // ✅ include type
      { new: true, runValidators: true }
    );

    if (!updatedSubject) {
      return res.status(404).json({ error: "Subject not found." });
    }
    res.json(updatedSubject);
  } catch (e) {
    console.error("[PUT /subjects/:id] Error:", e.message);
    res.status(400).json({ error: e.message });
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

    const deletedCombos = await Combo.deleteMany({ subject_id: id });
    console.log(
      `[DELETE /faculties/:id] Deleted ${deletedCombos.deletedCount} combos linked to subject ${id}`
    );

    res.json({ message: "Subject deleted successfully." });
  } catch (e) {
    console.error("[DELETE /subjects/:id] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});
  

// --- Classes CRUD ---
//add classes
protectedRouter.post('/classes', async (req, res) => {
  console.log("[POST /classes] Body:", req.body);
  try {
    const c = new ClassModel({
      ...req.body,
      assigned_teacher_subject_combos: req.body.assigned_teacher_subject_combos || [],
      total_class_hours: req.body.total_class_hours || 0
    });
    await c.save();
    console.log("[POST /classes] Saved class:", c);
    res.json(c);
  } catch (e) {
    console.error("[POST /classes] Error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

//get all classes
protectedRouter.get('/classes', async (req, res) => {
  console.log("[GET /classes] Fetching all classes");
  try {
    const classes = await ClassModel.find().lean();
    console.log("[GET /classes] Found:", classes.length, "records");
    res.json(classes);
  } catch (e) {
    console.error("[GET /classes] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Edit a class
protectedRouter.put('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const updatedClass = await ClassModel.findOneAndUpdate(
      { _id: id },
      updateData,
      { new: true, runValidators: true }
    );
    if (!updatedClass) {
      return res.status(404).json({ error: 'Class not found.' });
    }
    res.json(updatedClass);
  } catch (e) {
    console.error("[PUT /classes/:id] Error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

// Delete a class
protectedRouter.delete('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedClass = await ClassModel.findByIdAndDelete(id);
    if (!deletedClass) {
      return res.status(404).json({ error: 'Class not found.' });
    }

    const deletedCombos = await Combo.deleteMany({ class_id: id });
    console.log(
      `[DELETE /faculties/:id] Deleted ${deletedCombos.deletedCount} combos linked to class ${id}`
    );

    res.json({ message: 'Class deleted successfully.' });
  } catch (e) {
    console.error("[DELETE /classes/:id] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Combos ---

protectedRouter.post("/add-and-assign-combo", async (req, res) => {
  console.log("[POST /add-and-assign-combo] Body:", req.body);

  try {
    const { faculty_id, subject_id, combo_name, class_id } = req.body;

    // Validate required fields
    if (!faculty_id || !subject_id || !combo_name || !class_id) {
      console.warn("[POST /add-and-assign-combo] Missing required fields");
      return res.status(400).json({
        error: "faculty_id, subject_id, combo_name, and class_id are required."
      });
    }

    // Create combo with class_id
    const combo = new Combo({ faculty_id, subject_id, combo_name, class_id });
    await combo.save();
    console.log("[POST /add-and-assign-combo] Saved combo:", combo);

    // Assign combo to the class
    await ClassModel.updateOne(
      { _id: class_id },
      { $addToSet: { assigned_teacher_subject_combos: combo._id } }
    );

    // Fetch updated class for response
    const updatedClass = await ClassModel.findById(class_id).lean();

    res.json({ combo, assignedTo: updatedClass });
  } catch (e) {
    console.error("[POST /add-and-assign-combo] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Get all combos with assigned class
protectedRouter.get('/create-and-assign-combos', async (req, res) => {
  try {
    const combos = await Combo.find().lean();
    res.json(combos);
  } catch (e) {
    console.error("[GET /create-and-assign-combos] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

//update a combo and reassign it to a different class if needed
protectedRouter.put('/create-and-assign-combos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { faculty_id, subject_id, combo_name, class_id } = req.body;

    // Find existing combo
    const existingCombo = await Combo.findById(id);
    if (!existingCombo) {
      return res.status(404).json({ error: 'Combo not found.' });
    }

    // Validate subject & class semester match
    if (subject_id && class_id) {
      const [subject, classData] = await Promise.all([
        Subject.findById(subject_id).lean(),
        ClassModel.findById(class_id).lean()
      ]);

      if (!subject) {
        return res.status(404).json({ error: 'Subject not found.' });
      }
      if (!classData) {
        return res.status(404).json({ error: 'Class not found.' });
      }

      if (subject.sem !== classData.sem) {
        return res.status(400).json({ 
          error: `Subject semester (${subject.sem}) does not match Class semester (${classData.sem}).` 
        });
      }
    }

    // Unassign from old class if class_id changed
    if (existingCombo.class_id && existingCombo.class_id.toString() !== class_id) {
      await ClassModel.updateOne(
        { _id: existingCombo.class_id },
        { $pull: { assigned_teacher_subject_combos: existingCombo._id } }
      );
    }

    // Update combo
    existingCombo.faculty_id = faculty_id;
    existingCombo.subject_id = subject_id;
    existingCombo.combo_name = combo_name;
    existingCombo.class_id = class_id;
    await existingCombo.save();

    // Assign to the new class
    if (class_id) {
      await ClassModel.updateOne(
        { _id: class_id },
        { $addToSet: { assigned_teacher_subject_combos: existingCombo._id } }
      );
    }

    // Populate updated combo for response
    const updatedCombo = await Combo.findById(id)
      .populate('faculty_id')
      .populate('subject_id')
      .populate('class_id')
      .lean();

    res.json(updatedCombo);
  } catch (e) {
    console.error("[PUT /create-and-assign-combos/:id] Error:", e.message);
    res.status(400).json({ error: e.message });
  }
});



// Delete a combo and unassign it from its class
protectedRouter.delete('/create-and-assign-combos/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCombo = await Combo.findByIdAndDelete(id);
    if (!deletedCombo) {
      return res.status(404).json({ error: 'Combo not found.' });
    }

    // Unassign from the class
    if (deletedCombo.class_id) {
      await ClassModel.updateOne(
        { _id: deletedCombo.class_id },
        { $pull: { assigned_teacher_subject_combos: deletedCombo._id } }
      );
    }

    res.json({ message: 'Combo deleted and unassigned from class successfully.' });
  } catch (e) {
    console.error("[DELETE /create-and-assign-combos/:id] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Timetable ---
protectedRouter.post('/generate', async (req, res) => {
  console.log("[POST /generate] Generating timetable");
  try {
    const faculties = await Faculty.find().lean();
    const subjects = await Subject.find().lean();
    const classes = await ClassModel.find().lean();
    const combos = await Combo.find().lean();

    console.log("[POST /generate] Counts:", {
      faculties: faculties.length,
      subjects: subjects.length,
      classes: classes.length,
      combos: combos.length
    });

    const { fixedSlots } = req.body;

    const result = generator.generate({
      faculties, subjects, classes, combos,
      DAYS_PER_WEEK: 5, HOURS_PER_DAY: 9,
      fixed_slots: fixedSlots
    });

    if (!result.ok) {
      console.warn("[POST /generate] Generation failed:", result);
      return res.status(400).json(result);
    }

    const rec = new TimetableResult({
      class_timetables: result.class_timetables,
      faculty_timetables: result.faculty_timetables
    });
    await rec.save();
    console.log("[POST /generate] Saved timetable result");
    res.json({ ok: true, result });
  } catch (e) {
    console.error("[POST /generate] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

protectedRouter.get('/result/latest', async (req, res) => {
  console.log("[GET /result/latest] Fetching latest timetable result");
  try {
    const r = await TimetableResult.findOne().sort({ createdAt: -1 }).lean();
    console.log("[GET /result/latest] Found:", r ? "Yes" : "No");
    res.json(r);
  } catch (e) {
    console.error("[GET /result/latest] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

protectedRouter.post("/result/regenerate", async (req, res) => {
  try {
    const faculties = await Faculty.find().lean();
    const subjects = await Subject.find().lean();
    const classes = await ClassModel.find().lean();
    const combos = await Combo.find().lean();

    const { fixedSlots } = req.body;

    const { bestClassTimetables, bestFacultyTimetables, bestScore } = runGenerate({
      faculties,
      subjects,
      classes,
      combos,
      fixedSlots,
    });

    if (!bestClassTimetables) {
      console.warn("[POST /generate] Generation failed: No valid timetable found.");
      return res.status(400).json({ ok: false, error: "Failed to generate timetable." });
    }

    const rec = new TimetableResult({
      class_timetables: bestClassTimetables,
      faculty_timetables: bestFacultyTimetables,
      score: bestScore,
    });

    await rec.save();
    console.log("[POST /generate] Saved timetable result");

    res.json({
      ok: true,
      score: bestScore,
      class_timetables: bestClassTimetables,
      faculty_timetables: bestFacultyTimetables,
    });
  } catch (err) {
    console.error("[POST /generate] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

protectedRouter.delete("/timetables", async (req, res) => {
  try {
    // Delete all timetables
    const result = await TimetableResult.deleteMany({});

    res.status(200).json({
      ok: true,
      deletedCount: result.deletedCount, // tells how many docs were removed
      message: "All timetables deleted successfully"
    });
  } catch (err) {
    console.error("❌ Error deleting timetables:", err);
    res.status(500).json({ ok: false, error: "Failed to delete timetables" });
  }
});

router.use(protectedRouter);

export default router;
