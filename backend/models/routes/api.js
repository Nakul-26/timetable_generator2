import { Router } from 'express';
import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import Faculty from '../Faculty.js';
import Admin from '../Admin.js';
import Subject from '../Subject.js';
import ClassModel from '../Class.js';
import ClassSubject from '../ClassSubject.js';
import TeacherSubjectCombination from '../TeacherSubjectCombination.js';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workers = new Map();
const taskResults = new Map();
let nextTaskId = 1;

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

    // Delete associated teacher-subject combinations
    await TeacherSubjectCombination.deleteMany({ faculty: id });

    // Remove faculty from all classes
    await ClassModel.updateMany({}, { $pull: { faculties: id } });

    console.log("[DELETE /faculties/:id] Deleted faculty and associated data:", deletedFaculty);
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
    const { name, sem, type, combined_classes } = req.body;

    const updatedSubject = await Subject.findOneAndUpdate(
      { _id: id },
      { name, sem, type, combined_classes }, // ✅ include type
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
    const classes = await ClassModel.find().populate('faculties').lean();
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

    // Delete associated class-subject assignments
    await ClassSubject.deleteMany({ class: id });

    res.json({ message: 'Class deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

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


// --- Assign/Unassign Subjects and Faculties to/from Classes ---

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


// Add a faculty to a class
protectedRouter.post('/classes/:classId/faculties', async (req, res) => {
    try {
        const { classId } = req.params;
        const { facultyId } = req.body;

        const updatedClass = await ClassModel.findByIdAndUpdate(
            classId,
            { $addToSet: { faculties: facultyId } },
            { new: true }
        ).populate('faculties');

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
        ).populate('faculties');

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found.' });
        }
        res.json(updatedClass);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});




// --- Timetable ---
protectedRouter.post('/process-new-input', async (req, res) => {
    try {
        console.log("[POST /process-new-input] Starting data processing...");

        // 1. Fetch all necessary data from the database
        const allFaculties = await Faculty.find().lean();
        const allSubjects = await Subject.find().lean();
        const allClasses = await ClassModel.find().lean();
        const allClassSubjects = await ClassSubject.find().lean();
        const allTeacherSubjectCombos = await TeacherSubjectCombination.find().populate('faculty subject').lean();

        // 2. Prepare data for the converter function
        const classSubjectsForConverter = allClassSubjects.map(cs => ({
            classId: cs.class.toString(),
            subjectId: cs.subject.toString(),
            hoursPerWeek: cs.hoursPerWeek
        }));

        const teacherSubjectMap = allTeacherSubjectCombos.map(combo => ({
            teacherId: combo.faculty._id.toString(),
            subjectId: combo.subject._id.toString()
        }));

        const classTeachers = [];
        for (const c of allClasses) {
            if (c.faculties) {
                for (const f of c.faculties) {
                    classTeachers.push({ classId: c._id.toString(), teacherId: f.toString() });
                }
            }
        }
        
        // 3. Call the converter function
        const generatorData = converter.convertNewCollegeInput({
            classes: allClasses,
            subjects: allSubjects,
            teachers: allFaculties,
            classSubjects: classSubjectsForConverter,
            classTeachers: classTeachers,
            teacherSubjectCombos: teacherSubjectMap,
            classElectiveGroups: [] // Assuming no elective groups for now
        });

        const { classes: classesOut, combos: generatedCombos } = generatorData;

        // 4. Create a map of generated combos for easy lookup
        const comboNameToIdMap = {};
        for(const combo of allTeacherSubjectCombos){
            const comboName = `T${combo.faculty._id.toString()}_S${combo.subject._id.toString()}`;
            // This is a simplification, we need a way to link generated combos to real combo IDs.
            // The generatorData.combos are not real database combos.
            // For now, I will proceed with an imperfect mapping.
            // A better approach would be to have the generator return the actual TeacherSubjectCombination IDs.
        }

        // For now, let's find the combo from the database based on teacher and subject
        const findComboId = (teacherId, subjectId) => {
            const found = allTeacherSubjectCombos.find(c => 
                c.faculty._id.toString() === teacherId.toString() && 
                c.subject._id.toString() === subjectId.toString()
            );
            return found ? found._id : null;
        }

        // 5. Update each class in the database
        let updatedCount = 0;
        for (const classData of classesOut) {
            
            const classCombos = generatedCombos.filter(c => c.class_ids.includes(classData._id));
            
            const comboIdsToAssign = classCombos.map(c => findComboId(c.faculty_id, c.subject_id)).filter(id => id !== null);

            // Populate subject_hours
            const subjectHours = {};
            const classSubjectsForThisClass = allClassSubjects.filter(cs => cs.class.toString() === classData._id);
            for (const cs of classSubjectsForThisClass) {
                subjectHours[cs.subject.toString()] = cs.hoursPerWeek;
            }

            await ClassModel.findByIdAndUpdate(classData._id, {
                assigned_teacher_subject_combos: comboIdsToAssign,
                subject_hours: subjectHours
            });
            updatedCount++;
        }

        console.log(`[POST /process-new-input] Successfully updated ${updatedCount} classes.`);
        res.json({ ok: true, message: `Successfully processed inputs and updated ${updatedCount} classes.` });

    } catch (err) {
        console.error("[POST /process-new-input] Error:", err);
        res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
});

protectedRouter.post('/generate', async (req, res) => {
  console.log("[POST /generate] Generating timetable using the new college model.");
  try {
    const taskId = nextTaskId++;
    const { fixedSlots, classElectiveGroups } = req.body;

    const allFaculties = await Faculty.find().lean();
    const allSubjects = await Subject.find().lean();
    const allClasses = await ClassModel.find().populate('faculties').lean();
    const allClassSubjects = await ClassSubject.find().lean();
    const teacherSubjectCombos = await TeacherSubjectCombination.find().lean();



    const classSubjects = allClassSubjects.map(cs => ({
        classId: cs.class,
        subjectId: cs.subject,
        hoursPerWeek: cs.hoursPerWeek
    }));

    const teacherSubjectMap = teacherSubjectCombos.map(combo => ({
      teacherId: combo.faculty._id,
      subjectId: combo.subject._id
    }));

    const classTeachers = [];

    allClasses.forEach(c => {
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
        teacherSubjectCombos: teacherSubjectMap,
        classElectiveGroups
    });
    
    const { faculties, subjects, classes, combos } = generatorData;

    console.log("[POST /generate] Counts:", {
      faculties: faculties.length,
      subjects: subjects.length,
      classes: classes.length,
      combos: combos.length
    });

    const worker = new Worker(path.resolve(__dirname, '..', '..', 'workers', 'worker.js'));
    worker.stdout.pipe(process.stdout);
    worker.stderr.pipe(process.stderr);
    workers.set(taskId, worker);
    taskResults.set(taskId, { status: 'running', progress: 0 });

    worker.postMessage({
      action: 'GENERATE',
      payload: {
        faculties, subjects, classes, combos,
        DAYS_PER_WEEK: 6, HOURS_PER_DAY: 8,
        fixed_slots: fixedSlots,
        taskId
      }
    });

    worker.on('message', (message) => {
      if (message.type === 'PROGRESS') {
        taskResults.set(taskId, { status: 'running', progress: message.progress, partialData: message.partialData });
      } else if (message.type === 'RESULT') {
        taskResults.set(taskId, { status: 'completed', result: message.data });
        workers.delete(taskId);
      } else if (message.type === 'ERROR') {
        taskResults.set(taskId, { status: 'error', error: message.error });
        workers.delete(taskId);
      }
    });

    worker.on('error', (error) => {
      console.error(`Worker error for task #${taskId}:`, error);
      taskResults.set(taskId, { status: 'error', error: error.message });
      workers.delete(taskId);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker for task #${taskId} stopped with exit code ${code}`);
        if (!taskResults.has(taskId) || taskResults.get(taskId).status === 'running') {
          taskResults.set(taskId, { status: 'error', error: `Worker stopped with exit code ${code}` });
        }
      }
      workers.delete(taskId);
    });

    res.json({ taskId });

  } catch (e) {
    console.error("Error during timetable generation setup:", e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

protectedRouter.post('/stop-generator/:taskId', (req, res) => {
    const { taskId } = req.params;
    const worker = workers.get(parseInt(taskId));
    if (worker) {
        worker.postMessage({ action: 'STOP' });
        res.status(200).send({ message: `Stop signal sent to task #${taskId}.` });
    } else {
        res.status(404).send({ message: `Task #${taskId} not found or already completed.` });
    }
});

protectedRouter.get('/generation-status/:taskId', (req, res) => {
    const { taskId } = req.params;
    const result = taskResults.get(parseInt(taskId));
    if (result) {
        res.json(result);
        if (result.status === 'completed' || result.status === 'error') {
            // Clean up old task results after some time
            setTimeout(() => taskResults.delete(parseInt(taskId)), 60000);
        }
    } else {
        res.status(404).send({ message: `Task #${taskId} not found.` });
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

protectedRouter.get('/timetables', async (req, res) => {
    console.log("[GET /timetables] Fetching all saved timetables");
    try {
        const timetables = await TimetableResult.find({ source: 'manual' }).sort({ createdAt: -1 }).lean();
        console.log("[GET /timetables] Found:", timetables.length, "records");
        res.json(timetables);
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

protectedRouter.get('/timetable/:id', async (req, res) => {
    console.log("[GET /timetable/:id] Fetching timetable with id:", req.params.id);
    try {
        const timetable = await TimetableResult.findById(req.params.id).lean();
        if (!timetable) {
            return res.status(404).json({ error: 'Timetable not found.' });
        }
        console.log("[GET /timetable/:id] Found timetable:", timetable.name);
        res.json(timetable);
    } catch (e) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

protectedRouter.post("/result/regenerate", async (req, res) => {
  try {
    const { fixedSlots, classElectiveGroups } = req.body;

    const allFaculties = await Faculty.find().lean();
    const allSubjects = await Subject.find().lean();
    const allClasses = await ClassModel.find().populate('faculties').lean();
    const allClassSubjects = await ClassSubject.find().lean();
    const teacherSubjectCombos = await TeacherSubjectCombination.find().lean();

    const classSubjects = allClassSubjects.map(cs => ({
        classId: cs.class,
        subjectId: cs.subject,
        hoursPerWeek: cs.hoursPerWeek
    }));

    const teacherSubjectMap = teacherSubjectCombos.map(combo => ({
      teacherId: combo.faculty._id,
      subjectId: combo.subject._id
    }));

    const classTeachers = [];

    allClasses.forEach(c => {
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
        teacherSubjectCombos: teacherSubjectMap,
        classElectiveGroups
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
      combos,
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