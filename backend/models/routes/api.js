import { Router } from 'express';
import Faculty from '../Faculty.js';
import Admin from '../Admin.js';
import Subject from '../Subject.js';
import ClassModel from '../Class.js';
import TimetableResult from '../TmietableResult.js';
import generator from '../lib/generator.js';
import runGenerate from '../lib/runGenerator.js';
import converter from '../lib/convertNewCollegeInputToGeneratorData.js';
import mongoose from "mongoose";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import adminAuth from '../../middleware/adminAuth.js';
import rateLimit from 'express-rate-limit';
import auth from '../../middleware/auth.js';

const router = Router();
const protectedRouter = Router();

// --- Rate Limiter for Login ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login requests per windowMs
  message: 'Too many login attempts from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

protectedRouter.use(auth);

// --- User Authentication ---
router.post('/register', async (req, res) => {
  try {
    const { id, name } = req.body;
    const user = new Faculty({ id, name });
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Bad Request' });
  }
});

protectedRouter.post('/users/create', adminAuth, async (req, res) => {
  try {
    const { id, name } = req.body;
    const user = new Faculty({ id, name });
    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Bad Request' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
    try {
        console.log('Login request body:', req.body);
        const { email, password } = req.body;
        const admin = await Admin.findOne({ email });
        console.log('Attempting login for email:', email);
        console.log('Found admin:', admin);
        if (!admin) {
            console.error('Login failed: Admin not found for email', email);
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        const isMatch = await admin.matchPassword(password);
        console.log('Password match result:', isMatch);
        if (!isMatch) {
            console.error('Login failed: Incorrect password for email', email);
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        const token = admin.generateAuthToken();
        res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'none' });
        res.json({ success: true, user: admin });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
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
    console.log(e);
    res.status(400).json({ error: 'Bad Request' });
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
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update an existing faculty
protectedRouter.put('/faculties/:id', async (req, res) => {
  console.log("[PUT /faculties/:id] Params:", req.params, "Body:", req.body);
  try {
    const { id } = req.params;
    const { name, id: facultyId } = req.body;
    const updateData = { name, id: facultyId };

    const updatedFaculty = await Faculty.findOneAndUpdate(
      { _id: id },
      updateData,
      { new: true, runValidators: true }
    );
    if (!updatedFaculty) {
      console.warn("[PUT /faculties/:id] Faculty not found for _id:", id);
      return res.status(404).json({ error: 'Faculty not found.' });
    }
    console.log("[PUT /faculties/:id] Updated faculty:", updatedFaculty);
    res.json(updatedFaculty);
  } catch (e) {
    res.status(400).json({ error: 'Bad Request' });
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

    console.log("[DELETE /faculties/:id] Deleted faculty:", deletedFaculty);
    res.json({ message: 'Faculty deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
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
    const { name, no_of_hours_per_week, sem, type, combined_classes } = req.body;

    const updatedSubject = await Subject.findOneAndUpdate(
      { _id: id },
      { name, no_of_hours_per_week, sem, type, combined_classes }, // ✅ include type
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

    res.json({ message: "Subject deleted successfully." });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
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
    res.status(400).json({ error: 'Bad Request' });
  }
});

//get all classes
protectedRouter.get('/classes', async (req, res) => {
  console.log("[GET /classes] Fetching all classes");
  try {
    const classes = await ClassModel.find().populate('subjects').populate('faculties').lean();
    console.log("[GET /classes] Found:", classes.length, "records");
    res.json(classes);
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Edit a class
protectedRouter.put('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sem, section } = req.body;
    const updateData = { name, sem, section };

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
    res.status(400).json({ error: 'Bad Request' });
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

    res.json({ message: 'Class deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- Assign/Unassign Subjects and Faculties to/from Classes ---

// Add a subject to a class
protectedRouter.post('/classes/:classId/subjects', async (req, res) => {
    try {
        const { classId } = req.params;
        const { subjectId } = req.body;

        const updatedClass = await ClassModel.findByIdAndUpdate(
            classId,
            { $addToSet: { subjects: subjectId } },
            { new: true }
        ).populate('subjects').populate('faculties');

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found.' });
        }
        res.json(updatedClass);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});

// Remove a subject from a class
protectedRouter.delete('/classes/:classId/subjects/:subjectId', async (req, res) => {
    try {
        const { classId, subjectId } = req.params;

        const updatedClass = await ClassModel.findByIdAndUpdate(
            classId,
            { $pull: { subjects: subjectId } },
            { new: true }
        ).populate('subjects').populate('faculties');

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found.' });
        }
        res.json(updatedClass);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});

// Add a faculty to a class
protectedRouter.post('/classes/:classId/faculties', async (req, res) => {
    try {
        const { classId } = req.params;
        const { facultyId } = req.body;

        const updatedClass = await ClassModel.findByIdAndUpdate(
            classId,
            { $addToSet: { faculties: facultyId } },
            { new: true }
        ).populate('subjects').populate('faculties');

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found.' });
        }
        res.json(updatedClass);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});

// Remove a faculty from a class
protectedRouter.delete('/classes/:classId/faculties/:facultyId', async (req, res) => {
    try {
        const { classId, facultyId } = req.params;

        const updatedClass = await ClassModel.findByIdAndUpdate(
            classId,
            { $pull: { faculties: facultyId } },
            { new: true }
        ).populate('subjects').populate('faculties');

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found.' });
        }
        res.json(updatedClass);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});


// --- Timetable ---
protectedRouter.post('/generate', async (req, res) => {
  console.log("[POST /generate] Generating timetable using the new college model.");
  try {
    const { fixedSlots, teacherSubjectMap } = req.body;

    const allFaculties = await Faculty.find().lean();
    const allSubjects = await Subject.find().lean();
    const allClasses = await ClassModel.find().populate('subjects').populate('faculties').lean();

    const classSubjects = [];
    const classTeachers = [];

    allClasses.forEach(c => {
        if (c.subjects) {
            c.subjects.forEach(s => {
                classSubjects.push({ classId: c._id, subjectId: s._id });
            });
        }
        if (c.faculties) {
            c.faculties.forEach(f => {
                classTeachers.push({ classId: c._id, teacherId: f._id });
            });
        }
    });

    const generatorData = converter.convertNewCollegeInput({
        classes: allClasses,
        subjects: allSubjects,
        teachers: allFaculties,
        classSubjects,
        classTeachers,
        teacherSubjectMap
    });
    
    const { faculties, subjects, classes, combos } = generatorData;

    console.log("[POST /generate] Counts:", {
      faculties: faculties.length,
      subjects: subjects.length,
      classes: classes.length,
      combos: combos.length
    });

    const result = generator.generate({
      faculties, subjects, classes, combos,
      DAYS_PER_WEEK: 6, HOURS_PER_DAY: 8,
      fixed_slots: fixedSlots
    });

    if (!result.ok) {
      console.warn("[POST /generate] Generation failed:", result);
      return res.status(400).json(result);
    }

    const rec = new TimetableResult({
      class_timetables: result.class_timetables,
      faculty_timetables: result.faculty_timetables,
      faculty_daily_hours: result.faculty_daily_hours
    });
    await rec.save();
    console.log("[POST /generate] Saved timetable result");
    res.json({ ok: true, result });
  } catch (e) {
    console.error("Error during timetable generation:", e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

protectedRouter.get('/result/latest', async (req, res) => {
  console.log("[GET /result/latest] Fetching latest timetable result");
  try {
    const r = await TimetableResult.findOne().sort({ createdAt: -1 }).lean();
    console.log("[GET /result/latest] Found:", r ? "Yes" : "No");
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

protectedRouter.post("/result/regenerate", async (req, res) => {
  try {
    const { fixedSlots, teacherSubjectMap } = req.body;

    const allFaculties = await Faculty.find().lean();
    const allSubjects = await Subject.find().lean();
    const allClasses = await ClassModel.find().populate('subjects').populate('faculties').lean();

    const classSubjects = [];
    const classTeachers = [];

    allClasses.forEach(c => {
        if (c.subjects) {
            c.subjects.forEach(s => {
                classSubjects.push({ classId: c._id, subjectId: s._id });
            });
        }
        if (c.faculties) {
            c.faculties.forEach(f => {
                classTeachers.push({ classId: c._id, teacherId: f._id });
            });
        }
    });

    const generatorData = converter.convertNewCollegeInput({
        classes: allClasses,
        subjects: allSubjects,
        teachers: allFaculties,
        classSubjects,
        classTeachers,
        teacherSubjectMap
    });
    
    const { faculties, subjects, classes, combos } = generatorData;

    const { bestClassTimetables, bestFacultyTimetables, bestFacultyDailyHours, bestScore } = runGenerate({
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
      faculty_daily_hours: bestFacultyDailyHours,
      score: bestScore,
    });

    await rec.save();
    console.log("[POST /generate] Saved timetable result");

    res.json({
      ok: true,
      score: bestScore,
      class_timetables: bestClassTimetables,
      faculty_timetables: bestFacultyTimetables,
      faculty_daily_hours: bestFacultyDailyHours,
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
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
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

router.use(protectedRouter);

export default router;

