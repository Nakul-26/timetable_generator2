import { Router } from "express";
const router = Router();
import ClassModel from "../models/Class.js";
import TeacherSubjectCombination from "../models/TeacherSubjectCombination.js";
import Faculty from "../models/Faculty.js";
import Subject from "../models/Subject.js";

import {
  clearSlot,
  withTempClearedState,
  placeCombo,
} from "../services/manual-timetable/slot.service.js";

import {
  loadSavedTimetable,
  saveTimetable,
  getProcessedAssignments,
} from "../services/manual-timetable/persistence.service.js";

import { runAutoFill } from "../services/manual-timetable/autofill.service.js";

import {
  computeAvailableCombos,
  computeRemainingHours,
  checkTeacherConstraints,
} from "../utils/timetableManualUtils.js";

import {
  initializeState,
  loadState,
  getState,
  setState,
  lockSlot,
  unlockSlot,
  assertState,
  deleteState,
} from "../state/timetableState.js";

function buildSessionMeta(existingState = {}, overrides = {}) {
  return {
    slotSources: existingState.slotSources || {},
    lockedSlots: existingState.lockedSlots || {},
    sourceTimetableId: existingState.sourceTimetableId || null,
    generatedFromId: existingState.generatedFromId || null,
    parentTimetableId: existingState.parentTimetableId || null,
    lifecycleStatus: existingState.lifecycleStatus || "draft",
    editVersion: existingState.editVersion || 1,
    ...overrides,
  };
}

router.post("/initialize", async (req, res) => {
  try {
    const {
      timetableId,
      classes = [],
      faculties = [],
      subjects = [],
      electiveGroups = [],
      config = {},
      sourceTimetableId = null,
    } = req.body;

    if (!timetableId) {
      return res.status(400).json({ ok: false, error: "timetableId is required" });
    }

    initializeState(timetableId, classes, faculties, subjects, config, electiveGroups);

    const nextState = {
      ...getState(timetableId),
      ...buildSessionMeta(getState(timetableId), {
        sourceTimetableId,
      }),
    };
    loadState(timetableId, nextState);

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

    if (!newState.slotSources[classId]) {
      newState.slotSources[classId] = [];
    }
    if (!newState.slotSources[classId][day]) {
      newState.slotSources[classId][day] = [];
    }
    newState.slotSources[classId][day][hour] = "manual";

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
    const result = await runAutoFill({ timetableId, classId });
    return res.json(result.ok ? { ok: true, ...result } : result);
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
  const current = getState(timetableId);
  loadState(timetableId, {
    ...current,
    ...buildSessionMeta(current, {
      lifecycleStatus: "draft",
    }),
  });
  return res.json({ ok: true, ...getState(timetableId) });
});

// Load a saved timetable
router.post("/load", async (req, res) => {
  try {
    const { timetableId, savedTimetableId } = req.body;
    assertState(timetableId);

    const savedState = await loadSavedTimetable({
      timetableId,
      savedTimetableId,
    });

    const currentState = getState(timetableId);
    loadState(timetableId, {
      ...savedState,
      electiveGroups: currentState.electiveGroups || [],
    });
    res.json({ ok: true, ...getState(timetableId) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Save
router.post("/save", async (req, res) => {
  try {
    const { timetableId, name, savedTimetableId } = req.body;
    assertState(timetableId);

    const state = getState(timetableId);
    const saved = await saveTimetable({
      name,
      state,
      userId: req.user?._id || null,
      savedTimetableId,
    });

    res.json({
      ok: true,
      message: "Timetable saved successfully",
      id: saved._id,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get all processed assignments (saved timetables or assignment lists)
router.get("/processed-assignments", async (req, res) => {
  try {
    const results = await getProcessedAssignments();
    res.json({ ok: true, savedTimetables: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Delete
router.post("/delete", async (req, res) => {
  const { timetableId } = req.body;
  assertState(timetableId);

  deleteState(timetableId);
  return res.json({ ok: true });
});

// Clear a specific slot
router.post("/clear-slot", async (req, res) => {
  const { timetableId, classId, day, hour } = req.body;
  assertState(timetableId);

  try {
    let newState = JSON.parse(JSON.stringify(getState(timetableId)));
    if (newState.lockedSlots?.[classId]?.[day]?.[hour]) {
      return res.status(400).json({ ok: false, error: "This slot is locked." });
    }
    await clearSlot({ classId, day, hour, state: newState });
    if (!newState.slotSources[classId]) {
      newState.slotSources[classId] = [];
    }
    if (!newState.slotSources[classId][day]) {
      newState.slotSources[classId][day] = [];
    }
    newState.slotSources[classId][day][hour] = "manual";
    setState(timetableId, newState);
    return res.json({ ok: true, ...newState });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/toggle-lock", async (req, res) => {
  const { timetableId, classId, day, hour } = req.body;
  assertState(timetableId);

  try {
    const newState = JSON.parse(JSON.stringify(getState(timetableId)));
    if (!newState.lockedSlots[classId]) {
      newState.lockedSlots[classId] = [];
    }
    if (!newState.lockedSlots[classId][day]) {
      newState.lockedSlots[classId][day] = [];
    }

    newState.lockedSlots[classId][day][hour] = !newState.lockedSlots[classId][day][hour];
    setState(timetableId, newState);
    return res.json({ ok: true, ...newState });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
