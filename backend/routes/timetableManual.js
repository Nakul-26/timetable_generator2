import express from "express";
import ClassModel from "../models/Class.js";
import TeacherSubjectCombination from "../models/TeacherSubjectCombination.js";
import Faculty from "../models/Faculty.js";
import Subject from "../models/Subject.js";
import TimetableResult from "../models/TimetableResult.js";

import {
  computeAvailableCombos,
  checkClassConstraints,
  checkTeacherConstraints,
  computeRemainingHours,
  autoFillTimetable
} from "../utils/timetableManualUtils.js";

import {
  getState,
  setState,
  initializeState,
  lockSlot,
  unlockSlot,
  deleteState,
  assertState
} from "../state/timetableState.js";

const router = express.Router();

/* ------------------------------------------------------------------ */
/* ------------------------- Helper Functions ------------------------ */
/* ------------------------------------------------------------------ */

async function clearSlot({ classId, day, hour, state }) {
  const {
    classTimetable,
    teacherTimetable,
    subjectHoursAssigned
  } = state;

  const comboId = classTimetable[classId]?.[day]?.[hour];
  if (!comboId) return;

  const combo = await TeacherSubjectCombination.findById(comboId).lean();
  if (!combo) return;

  const facultyId = combo.faculty.toString();
  const subjectId = combo.subject.toString();

  classTimetable[classId][day][hour] = null;

  if (teacherTimetable[facultyId]?.[day]?.[hour] === comboId) {
    teacherTimetable[facultyId][day][hour] = null;
  }

  if (subjectHoursAssigned[classId]?.[subjectId] > 0) {
    subjectHoursAssigned[classId][subjectId]--;
  }
}

async function withTempClearedState(timetableId, classId, day, hour, cb) {
  const state = getState(timetableId);

  const tempState = JSON.parse(JSON.stringify(state));
  await clearSlot({ classId, day, hour, state: tempState });

  return cb(tempState);
}

async function placeCombo({
  timetableId,
  classId,
  day,
  hour,
  comboId
}) {
  const state = getState(timetableId);
  const {
    classTimetable,
    teacherTimetable,
    subjectHoursAssigned,
    config
  } = state;

  const classObj = await ClassModel.findById(classId).lean();
  if (!classObj) throw new Error("Class not found");

  const newState = JSON.parse(JSON.stringify(state));

  await clearSlot({
    classId,
    day,
    hour,
    state: newState
  });

  if (!comboId) return newState;

  const combo = await TeacherSubjectCombination.findById(comboId).lean();
  if (!combo) throw new Error("Combo not found");

  const facultyId = combo.faculty.toString();
  const subjectId = combo.subject.toString();

  const remainingHours = computeRemainingHours(
    classObj,
    newState.subjectHoursAssigned
  );

  const c1 = checkClassConstraints(
    newState.classTimetable,
    classObj,
    day,
    hour,
    subjectId,
    remainingHours
  );
  if (!c1.ok) throw new Error(c1.error);

  const c2 = checkTeacherConstraints(
    newState.teacherTimetable,
    facultyId,
    day,
    hour
  );
  if (!c2.ok) throw new Error(c2.error);

  newState.classTimetable[classId][day][hour] = comboId;

  if (!newState.teacherTimetable[facultyId]) {
    const { days, hours } = config;
    newState.teacherTimetable[facultyId] =
      Array(days).fill(null).map(() => Array(hours).fill(null));
  }

  newState.teacherTimetable[facultyId][day][hour] = comboId;

  newState.subjectHoursAssigned[classId][subjectId] =
    (newState.subjectHoursAssigned[classId][subjectId] || 0) + 1;

  return newState;
}

/* ------------------------------------------------------------------ */
/* ---------------------------- Endpoints ---------------------------- */
/* ------------------------------------------------------------------ */

// Initialize
router.post("/initialize", async (req, res) => {
  try {
    const { timetableId, classes, faculties, subjects, config } = req.body;
    if (!timetableId) return res.status(400).json({ ok: false, error: "timetableId required" });

    initializeState(timetableId, classes, faculties, subjects, config);
    return res.json({ ok: true, ...getState(timetableId) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Valid options
router.post("/valid-options", async (req, res) => {
  try {
    const { timetableId, classId, day, hour } = req.body;
    assertState(timetableId);

    const classObj = await ClassModel.findById(classId).lean();
    if (!classObj) return res.status(404).json({ ok: false, error: "Class not found" });

    const result = await withTempClearedState(
      timetableId,
      classId,
      day,
      hour,
      async (state) => {
        const combos = await TeacherSubjectCombination.find({
          _id: { $in: classObj.assigned_teacher_subject_combos }
        }).populate("faculty subject").lean();

        return computeAvailableCombos({
          classObj,
          combos,
          classTimetable: state.classTimetable,
          teacherTimetable: state.teacherTimetable,
          subjectHoursAssigned: state.subjectHoursAssigned,
          day,
          hour
        });
      }
    );

    return res.json({
      ok: true,
      validOptions: result.map(c => ({
        comboId: c._id,
        faculty: c.faculty.name,
        subject: c.subject.name
      }))
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Place
router.post("/place", async (req, res) => {
  const { timetableId, classId, day, hour, comboId } = req.body;
  assertState(timetableId);

  const lockKey = `${timetableId}|${classId}|${day}|${hour}`;
  if (!lockSlot(lockKey)) {
    return res.status(409).json({ ok: false, error: "Slot busy" });
  }

  try {
    const newState = await placeCombo({
      timetableId,
      classId,
      day,
      hour,
      comboId
    });

    setState(timetableId, newState);
    return res.json({ ok: true, ...newState });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  } finally {
    unlockSlot(lockKey);
  }
});

// Auto-fill
router.post("/auto-fill", async (req, res) => {
  const { timetableId, classId } = req.body;
  assertState(timetableId);

  const lockKey = `${timetableId}|autofill|${classId}`;
  if (!lockSlot(lockKey)) {
    return res.status(409).json({ ok: false, error: "Auto-fill busy" });
  }

  try {
    const result = await autoFillTimetable(classId, getState(timetableId));
    if (!result.ok) return res.json(result);

    setState(timetableId, result.newState);
    return res.json({ ok: true, ...result.newState });
  } finally {
    unlockSlot(lockKey);
  }
});

// Clear all
router.post("/clear-all", async (req, res) => {
  const { timetableId, config } = req.body;
  assertState(timetableId);

  const [classes, faculties, subjects] = await Promise.all([
    ClassModel.find().lean(),
    Faculty.find().lean(),
    Subject.find().lean()
  ]);

  initializeState(timetableId, classes, faculties, subjects, config);
  return res.json({ ok: true, ...getState(timetableId) });
});

// Save
router.post("/save", async (req, res) => {
    try {
        const { timetableId, name } = req.body;
        if (!name) {
            return res.status(400).json({ ok: false, error: "A name is required to save the timetable." });
        }
        assertState(timetableId);

        const existing = await TimetableResult.findOne({ name });
        if (existing) {
            return res.status(409).json({ ok: false, error: `A timetable with the name "${name}" already exists.` });
        }

        const state = getState(timetableId);

        const newTimetable = new TimetableResult({
            name,
            source: 'manual',
            class_timetables: state.classTimetable,
            teacher_timetables: state.teacherTimetable,
            subject_hours_assigned: state.subjectHoursAssigned,
            config: state.config,
            version: state.version,
        });

        const saved = await newTimetable.save();
        return res.status(201).json({ ok: true, message: "Timetable saved successfully!", id: saved._id });

    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
});

// Get all processed assignments (saved timetables or assignment lists)
router.get("/processed-assignments", async (req, res) => {
    try {
        const results = await TimetableResult.find({}).sort({ createdAt: -1 }).lean();

        // Populate TeacherSubjectCombination details for each result
        const populatedResults = await Promise.all(results.map(async (result) => {
            
            // Helper to populate a list of combo IDs
            const populateCombos = async (comboIds) => {
                if (!comboIds || comboIds.length === 0) return [];
                const uniqueComboIds = [...new Set(comboIds.filter(Boolean))]; // Filter null/undefined and get unique
                return TeacherSubjectCombination.find({ '_id': { $in: uniqueComboIds } })
                    .populate("faculty", "name")
                    .populate("subject", "name")
                    .lean();
            };

            if (result.source === 'assignments' && result.assignments_only) {
                // Handle assignment-only records
                const populatedAssignments = {};
                for (const classId in result.assignments_only) {
                    const comboIds = result.assignments_only[classId];
                    populatedAssignments[classId] = await populateCombos(comboIds);
                }
                result.populated_assignments = populatedAssignments; // Add a new field with populated data

            } else if (result.class_timetables) {
                // Handle full timetable records
                const allComboIds = Object.values(result.class_timetables).flatMap(classSchedule => 
                    Object.values(classSchedule).flatMap(daySchedule => Object.values(daySchedule))
                );
                const populatedCombos = await populateCombos(allComboIds);
                const comboMap = new Map(populatedCombos.map(c => [c._id.toString(), c]));

                const populatedTimetables = {};
                for (const classId in result.class_timetables) {
                    populatedTimetables[classId] = {};
                    for (const day in result.class_timetables[classId]) {
                        populatedTimetables[classId][day] = {};
                        for (const hour in result.class_timetables[classId][day]) {
                            const comboId = result.class_timetables[classId][day][hour];
                            if (comboId && comboMap.has(comboId.toString())) {
                                populatedTimetables[classId][day][hour] = comboMap.get(comboId.toString());
                            } else {
                                populatedTimetables[classId][day][hour] = null;
                            }
                        }
                    }
                }
                result.class_timetables = populatedTimetables; // Replace with populated timetables
            }
            return result;
        }));

        res.json({ ok: true, savedTimetables: populatedResults });

    } catch (error) {
        console.error("Error fetching processed assignments:", error);
        res.status(500).json({ ok: false, error: "Failed to fetch processed assignments." });
    }
});

// Delete
router.post("/delete", async (req, res) => {
  const { timetableId } = req.body;
  assertState(timetableId);

  deleteState(timetableId);
  return res.json({ ok: true });
});

export default router;
