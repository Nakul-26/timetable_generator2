import { Router } from 'express';
import { Worker } from 'worker_threads';
import path from 'path';
// import { fileURLTo__dirname } from 'url';
import Faculty from '../../models/Faculty.js';
import Subject from '../../models/Subject.js';
import ClassModel from '../../models/Class.js';
import ClassSubject from '../../models/ClassSubject.js';
import TeacherSubjectCombination from '../../models/TeacherSubjectCombination.js';
import TimetableResult from '../../models/TimetableResult.js';
import generator from '../../models/lib/generator.js';
import runGenerate from '../../models/lib/runGenerator.js';
// Removed: import converter from '../../models/lib/convertNewCollegeInputToGeneratorData.js';
import { prepareGeneratorData } from '../../services/generator/prepareGeneratorData.js';
import {
  startGenerationWorker,
  stopGenerationWorker,
  getGenerationStatus,
} from "../../services/generator/workerManager.service.js";
import auth from '../../middleware/auth.js';


const protectedRouter = Router();
protectedRouter.use(auth);

// --- Timetable ---
protectedRouter.post('/process-new-input', async (req, res) => {
    try {
        console.log("[POST /process-new-input] Starting data processing for assignments...");

        // Use prepareGeneratorData to get all necessary processed data
        // This replaces the direct calls to various models and the converter
        const generatorData = await prepareGeneratorData({});

        const { classes: classesOut, combos: generatedCombos } = generatorData;
        
        // Fetch allTeacherSubjectCombos separately as prepareGeneratorData might not return them in the exact format needed for findComboId
        const allTeacherSubjectCombos = await TeacherSubjectCombination.find().populate('faculty subject').lean();


        const findComboId = (teacherId, subjectId) => {
            const found = allTeacherSubjectCombos.find(c => 
                c.faculty._id.toString() === teacherId.toString() && 
                c.subject._id.toString() === subjectId.toString()
            );
            return found ? found._id : null;
        }

        const assignmentsOnly = {};
        const classAssignmentsForFrontend = [];

        // 4. Process assignments for each class
        for (const classData of classesOut) {
            const classCombos = generatedCombos.filter(c => c.class_ids.includes(classData._id.toString())); // Ensure IDs are strings
            const comboIdsToAssign = classCombos.map(c => findComboId(c.faculty_id, c.subject_id)).filter(id => id !== null);
            
            assignmentsOnly[classData._id.toString()] = comboIdsToAssign; // Ensure classData._id is string

            const assignedCombosDetails = allTeacherSubjectCombos
                .filter(c => comboIdsToAssign.map(id => id.toString()).includes(c._id.toString()))
                .map(c => ({
                    _id: c._id,
                    faculty: { name: c.faculty.name },
                    subject: { name: c.subject.name }
                }));

            classAssignmentsForFrontend.push({
                classId: classData._id.toString(), // Ensure classData._id is string
                className: classData.name,
                combos: assignedCombosDetails
            });
        }

        // 5. Save the generated assignments as a new TimetableResult
        const newAssignmentName = `Processed Assignments - ${new Date().toLocaleString()}`;
        const newAssignmentResult = new TimetableResult({
            name: newAssignmentName,
            source: 'assignments', // Mark as assignment-only
            assignments_only: assignmentsOnly,
            class_timetables: null, // Explicitly null
        });
        await newAssignmentResult.save();
        console.log(`[POST /process-new-input] Successfully saved assignments: ${newAssignmentName}`);
        
        res.json({ 
            ok: true, 
            message: `Successfully processed and saved new assignments: "${newAssignmentName}"`,
            classAssignments: classAssignmentsForFrontend
        });

    } catch (err) {
        console.error("[POST /process-new-input] Error:", err);
        res.status(500).json({ ok: false, error: 'Internal Server Error' });
    }
});

protectedRouter.post('/generate', async (req, res) => {
  try {
    const { fixedSlots, classElectiveGroups } = req.body;

    const generatorData = await prepareGeneratorData({
      classElectiveGroups,
    });

    const taskId = startGenerationWorker({
      payload: {
        ...generatorData,
        fixedSlots,
        DAYS_PER_WEEK: 6,
        HOURS_PER_DAY: 8,
      },
    });

    res.json({ taskId });
  } catch (e) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

protectedRouter.post('/stop-generator/:taskId', (req, res) => {
  const taskId = Number(req.params.taskId);

  const stopped = stopGenerationWorker(taskId);
  if (!stopped) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.json({ ok: true, message: `Stop signal sent to task ${taskId}` });
});

protectedRouter.get('/generation-status/:taskId', (req, res) => {
  const taskId = Number(req.params.taskId);
  const status = getGenerationStatus(taskId);

  if (!status) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.json(status);
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

protectedRouter.get('/processed-assignments', async (req, res) => {
    console.log("[GET /processed-assignments] Fetching all saved assignment-only results");
    try {
        // The post-find hook on TimetableResult will populate 'populated_assignments'
        const timetables = await TimetableResult.find({ source: 'assignments' }).sort({ createdAt: -1 });
        console.log("[GET /processed-assignments] Found:", timetables.length, "records");
        res.json({ savedTimetables: timetables });
    } catch (e) {
        console.error("[GET /processed-assignments] Error:", e);
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

    const generatorData = await prepareGeneratorData({ classElectiveGroups });
    
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

// Save a new timetable
protectedRouter.post("/timetables", async (req, res) => {
  try {
    const { name, timetableData } = req.body;
    if (!name || !timetableData) {
      return res.status(400).json({ error: "Missing name or timetable data." });
    }

    const newTimetable = new TimetableResult({
      name,
      source: 'generator', // Mark as from the generator
      class_timetables: timetableData.class_timetables,
      faculty_timetables: timetableData.faculty_timetables,
      faculty_daily_hours: timetableData.faculty_daily_hours,
      score: timetableData.score,
      combos: timetableData.combos,
      allocations_report: timetableData.allocations_report,
      config: timetableData.config,
    });

    const saved = await newTimetable.save();
    res.status(201).json(saved);

  } catch (err) {
    console.error("Error saving timetable:", err);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

export default protectedRouter;
