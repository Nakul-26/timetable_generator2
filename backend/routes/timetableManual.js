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
  loadState,
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

  const comboIds = classTimetable[classId]?.[day]?.[hour];
  if (!comboIds || !Array.isArray(comboIds) || comboIds.length === 0) return;

  for (const comboId of comboIds) {
    if (!comboId) continue;
    const combo = await TeacherSubjectCombination.findById(comboId).lean();
    if (!combo) continue;

    const facultyId = combo.faculty.toString();
    const subjectId = combo.subject.toString();

    // A teacher can only be in one place at a time, so this check is valid.
    if (teacherTimetable[facultyId]?.[day]?.[hour] === comboId) {
      teacherTimetable[facultyId][day][hour] = null;
    }

    if (subjectHoursAssigned[classId]?.[subjectId] > 0) {
      subjectHoursAssigned[classId][subjectId]--;
    }
  }
  
  classTimetable[classId][day][hour] = [];
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
    config,
    electiveGroups
  } = state;

  const classObj = await ClassModel.findById(classId).lean();
  if (!classObj) throw new Error("Class not found");

  let newState = JSON.parse(JSON.stringify(state));

  // This function no longer handles clearing. It expects a valid comboId.
  if (!comboId) {
      throw new Error("comboId is required for placeCombo.");
  }

  const combosInSlot = newState.classTimetable[classId]?.[day]?.[hour] || [];
  if (combosInSlot.includes(comboId)) {
    return newState;
  }

  const combo = await TeacherSubjectCombination.findById(comboId).populate('subject').lean();
  if (!combo) throw new Error("Combo not found");

  const subjectIdOfNewCombo = combo.subject._id.toString();
  let isReplacement = false;

  if (combosInSlot.length > 0) {
    const combosDetailsInSlot = await TeacherSubjectCombination.find({ _id: { $in: combosInSlot } }).select('subject').lean();
    const subjectIdsInSlot = combosDetailsInSlot.map(c => c.subject.toString());
    const allSubjectIds = [...subjectIdsInSlot, subjectIdOfNewCombo];
    
    const relevantGroup = electiveGroups.find(g => g.classId === classId && g.subjects.includes(subjectIdOfNewCombo));
    const allInGroup = relevantGroup && allSubjectIds.every(s => relevantGroup.subjects.includes(s));

    if (allInGroup && allSubjectIds.length <= relevantGroup.subjects.length) {
      // This is a valid elective addition.
    } else if (combosInSlot.length === 1) {
      // Not a valid elective add, and only one combo is in the slot. Treat as replacement.
      isReplacement = true;
      const tempStateForClearing = JSON.parse(JSON.stringify(newState));
      await clearSlot({ classId, day, hour, state: tempStateForClearing });
      newState = tempStateForClearing; // Use the state after clearing
    } else {
      // This is an invalid placement.
      throw new Error("Cannot add this subject. It either does not belong to the existing elective group or the slot is full.");
    }
  }

  // --- Constraint Checks ---
  const remainingHours = computeRemainingHours(classObj, newState.subjectHoursAssigned);
  
  // The class slot collision check
  if (!isReplacement && combosInSlot.length > 0) {
    // This is an elective add, skip the collision check in checkClassConstraints.
    if (remainingHours[subjectIdOfNewCombo] <= 0) {
      throw new Error("Required hours for this subject are already completed.");
    }
  } else {
    // This is a replacement or an addition to an empty slot, run all checks.
    const c1 = checkClassConstraints(newState.classTimetable, classObj, day, hour, subjectIdOfNewCombo, remainingHours);
    if (!c1.ok) throw new Error(c1.error);
  }

  const c2 = checkTeacherConstraints(newState.teacherTimetable, combo.faculty.toString(), day, hour);
  if (!c2.ok) throw new Error(c2.error);

  // --- Apply Changes ---
  newState.classTimetable[classId][day][hour].push(comboId);

  const facultyId = combo.faculty.toString();
  if (!newState.teacherTimetable[facultyId]) {
    const { days, hours } = config;
    newState.teacherTimetable[facultyId] = Array(days).fill(null).map(() => Array(hours).fill(null));
  }
  newState.teacherTimetable[facultyId][day][hour] = comboId;

  newState.subjectHoursAssigned[classId][subjectIdOfNewCombo] = (newState.subjectHoursAssigned[classId][subjectIdOfNewCombo] || 0) + 1;

  return newState;
}

/* ------------------------------------------------------------------ */
/* ---------------------------- Endpoints ---------------------------- */
/* ------------------------------------------------------------------ */

// Initialize
router.post("/initialize", async (req, res) => {
  try {
    const { timetableId, classes, faculties, subjects, config, electiveGroups } = req.body;
    if (!timetableId) return res.status(400).json({ ok: false, error: "timetableId required" });

    initializeState(timetableId, classes, faculties, subjects, config, electiveGroups);
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

    const state = getState(timetableId);
    const { classTimetable, teacherTimetable, subjectHoursAssigned, electiveGroups } = state;

    const classObj = await ClassModel.findById(classId).lean();
    if (!classObj) return res.status(404).json({ ok: false, error: "Class not found" });

    const combos = await TeacherSubjectCombination.find({
      _id: { $in: classObj.assigned_teacher_subject_combos }
    }).populate("faculty subject").lean();

    const combosInSlot = classTimetable[classId]?.[day]?.[hour] || [];
    let validCombos = [];

    if (combosInSlot.length > 1) {
      // Slot has multiple electives; find other valid electives from the same group.
      const combosDetailsInSlot = await TeacherSubjectCombination.find({ _id: { $in: combosInSlot } }).select('subject').lean();
      const subjectIdsInSlot = combosDetailsInSlot.map(c => c.subject.toString());

      const relevantGroup = electiveGroups.find(g => g.classId === classId && g.subjects.includes(subjectIdsInSlot[0]));

      if (relevantGroup) {
        const potentialSubjectIds = relevantGroup.subjects.filter(s => !subjectIdsInSlot.includes(s));
        const remainingHours = computeRemainingHours(classObj, subjectHoursAssigned);
        
        for (const combo of combos) {
          const subjId = combo.subject._id.toString();
          if (!potentialSubjectIds.includes(subjId)) continue;

          // Check teacher and remaining hours
          const teacherCheck = checkTeacherConstraints(teacherTimetable, combo.faculty._id.toString(), day, hour);
          if (teacherCheck.ok && remainingHours[subjId] > 0) {
            validCombos.push(combo);
          }
        }
      }
    } else {
      // Slot has 0 or 1 items. In either case, the user should see all possible options
      // as they can either place, replace, or add the first co-elective.
      const result = await withTempClearedState(
        timetableId,
        classId,
        day,
        hour,
        (tempState) => {
          return computeAvailableCombos({
            classObj,
            combos,
            classTimetable: tempState.classTimetable,
            teacherTimetable: tempState.teacherTimetable,
            subjectHoursAssigned: tempState.subjectHoursAssigned,
            day,
            hour
          });
        }
      );
      validCombos = result;
    }

    return res.json({
      ok: true,
      validOptions: validCombos.map(c => ({
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

    // Populate details for the newly placed combos to send to the frontend
    const placedCombosDetails = await TeacherSubjectCombination.find({
        '_id': { $in: result.placedComboIds }
    }).populate('faculty', 'name').populate('subject', 'name').lean();

    const comboIdToDetails = {};
    placedCombosDetails.forEach(c => {
        comboIdToDetails[c._id.toString()] = {
            subject: c.subject.name,
            faculty: c.faculty.name,
        };
    });

    return res.json({ ok: true, ...result.newState, comboIdToDetails });
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

// Load a saved timetable
router.post("/load", async (req, res) => {
    try {
        const { timetableId, savedTimetableId } = req.body;
        if (!timetableId || !savedTimetableId) {
            return res.status(400).json({ ok: false, error: "Both timetableId and savedTimetableId are required." });
        }

        const savedTimetable = await TimetableResult.findById(savedTimetableId).lean();
        if (!savedTimetable) {
            return res.status(404).json({ ok: false, error: "Saved timetable not found." });
        }

        // --- Data Normalization Step ---
        // Ensure the loaded timetable conforms to the new array-based slot structure.
        if (savedTimetable.class_timetables) {
            for (const classId in savedTimetable.class_timetables) {
                for (const day in savedTimetable.class_timetables[classId]) {
                    for (const hour in savedTimetable.class_timetables[classId][day]) {
                        const slotContent = savedTimetable.class_timetables[classId][day][hour];
                        if (!Array.isArray(slotContent)) {
                            // Convert legacy format (null or string) to modern array format
                            savedTimetable.class_timetables[classId][day][hour] = slotContent ? [slotContent] : [];
                        }
                    }
                }
            }
        }
        // --- End Normalization ---


        // Prepare the state object from the saved data
        const savedState = {
            classTimetable: savedTimetable.class_timetables,
            teacherTimetable: savedTimetable.teacher_timetables,
            subjectHoursAssigned: savedTimetable.subject_hours_assigned,
            config: savedTimetable.config,
            version: savedTimetable.version,
            createdAt: savedTimetable.createdAt,
        };

        loadState(timetableId, savedState);

        return res.json({ ok: true, ...getState(timetableId) });
    } catch (e) {
        return res.status(500).json({ ok: false, error: e.message });
    }
});

// Save
router.post("/save", async (req, res) => {
    try {
        const { timetableId, name, savedTimetableId } = req.body;
        if (!name) {
            return res.status(400).json({ ok: false, error: "A name is required to save the timetable." });
        }
        assertState(timetableId);

        const state = getState(timetableId);

        if (savedTimetableId) {
            // Update existing timetable
            const updatedTimetable = await TimetableResult.findByIdAndUpdate(
                savedTimetableId,
                {
                    name,
                    source: 'manual',
                    class_timetables: state.classTimetable,
                    teacher_timetables: state.teacherTimetable,
                    subject_hours_assigned: state.subjectHoursAssigned,
                    config: state.config,
                    version: state.version,
                },
                { new: true } // Return the updated document
            );

            if (!updatedTimetable) {
                return res.status(404).json({ ok: false, error: "Timetable to update not found." });
            }

            return res.status(200).json({ ok: true, message: "Timetable updated successfully!", id: updatedTimetable._id });
        } else {
            // Create new timetable
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
        }
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
                    Object.values(classSchedule).flatMap(daySchedule => Object.values(daySchedule).flat())
                ).filter(Boolean);

                const populatedCombos = await populateCombos(allComboIds);
                const comboMap = new Map(populatedCombos.map(c => [c._id.toString(), c]));

                const populatedTimetables = {};
                for (const classId in result.class_timetables) {
                    populatedTimetables[classId] = {};
                    for (const day in result.class_timetables[classId]) {
                        populatedTimetables[classId][day] = {};
                        for (const hour in result.class_timetables[classId][day]) {
                            const comboIdOrIds = result.class_timetables[classId][day][hour];
                            
                            if (Array.isArray(comboIdOrIds)) {
                                populatedTimetables[classId][day][hour] = comboIdOrIds
                                    .map(id => comboMap.get(id.toString()))
                                    .filter(Boolean);
                            } else if (comboIdOrIds) { // Handle legacy single-ID format
                                const combo = comboMap.get(comboIdOrIds.toString());
                                populatedTimetables[classId][day][hour] = combo ? [combo] : [];
                            } else {
                                populatedTimetables[classId][day][hour] = []; // Ensure empty slots are arrays
                            }
                        }
                    }
                }
                result.class_timetables = populatedTimetables;
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

// Clear a specific slot
router.post("/clear-slot", async (req, res) => {
  const { timetableId, classId, day, hour } = req.body;
  assertState(timetableId);

  try {
    let newState = JSON.parse(JSON.stringify(getState(timetableId)));
    await clearSlot({ classId, day, hour, state: newState });
    setState(timetableId, newState);
    return res.json({ ok: true, ...newState });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});
