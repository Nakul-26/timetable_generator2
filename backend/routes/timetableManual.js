import express from "express";
import ClassModel from "../models/Class.js";
import TeacherSubjectCombination from "../models/TeacherSubjectCombination.js";
import Faculty from "../models/Faculty.js";
import {
  computeAvailableCombos,
  checkClassConstraints,
  checkTeacherConstraints,
  computeRemainingHours
} from "../utils/timetableManualUtils.js";

const router = express.Router();

// API #1 — Get Valid Options for a Slot
router.post("/valid-options", async (req, res) => {
  try {
    const { classId, day, hour, classTimetable, teacherTimetable, subjectHoursAssigned } = req.body;

    const classObj = await ClassModel.findById(classId).lean();
    if (!classObj) return res.status(404).json({ ok: false, error: "Class not found" });

    // --- Temporarily Clear Slot for accurate validation ---
    const tempClassTimetable = JSON.parse(JSON.stringify(classTimetable));
    const tempTeacherTimetable = JSON.parse(JSON.stringify(teacherTimetable));
    const tempSubjectHours = { ...subjectHoursAssigned };

    const previouslyPlacedComboId = tempClassTimetable[classId]?.[day]?.[hour];
    if (previouslyPlacedComboId) {
        // Clear the class slot
        tempClassTimetable[classId][day][hour] = null;
        
        // Find the teacher for the old combo and clear their slot
        const oldCombo = await TeacherSubjectCombination.findById(previouslyPlacedComboId).lean();
        if (oldCombo) {
            const oldFacultyId = oldCombo.faculty.toString();
            const oldSubjectId = oldCombo.subject.toString();
            
            if (tempTeacherTimetable[oldFacultyId]?.[day]?.[hour] === previouslyPlacedComboId) {
                tempTeacherTimetable[oldFacultyId][day][hour] = null;
            }
            // Decrement the hours for the subject that was there
            tempSubjectHours[oldSubjectId] = (tempSubjectHours[oldSubjectId] || 1) - 1;
        }
    }
    // --- End of Temporary Clear ---

    // Fetch all combos that are assigned to this class
    const combos = await TeacherSubjectCombination.find({
      '_id': { $in: classObj.assigned_teacher_subject_combos }
    }).populate('faculty subject').lean();
    
    const validCombos = computeAvailableCombos({
      classObj,
      combos,
      classTimetable: tempClassTimetable,
      teacherTimetable: tempTeacherTimetable,
      day,
      hour,
      subjectHoursAssigned: tempSubjectHours
    });

    const validOptions = validCombos.map(combo => ({
        comboId: combo._id,
        faculty: combo.faculty.name,
        subject: combo.subject.name
    }));

    return res.json({ ok: true, validOptions });
  } catch (error) {
    console.error("Valid Options Error:", error);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// API #2 — Validate a Potential Placement
router.post("/validate", async (req, res) => {
  try {
    const { classId, day, hour, comboId, classTimetable, teacherTimetable, subjectHoursAssigned } = req.body;

    const classObj = await ClassModel.findById(classId).lean();
    const combo = await TeacherSubjectCombination.findById(comboId).lean();

    const remainingHours = computeRemainingHours(classObj, subjectHoursAssigned);

    const classCheck = checkClassConstraints(
      classTimetable,
      classObj,
      day,
      hour,
      combo.subject.toString(),
      remainingHours
    );
    if (!classCheck.ok) return res.json(classCheck);

    const teacherCheck = checkTeacherConstraints(
      teacherTimetable,
      combo.faculty.toString(),
      day,
      hour
    );
    if (!teacherCheck.ok) return res.json(teacherCheck);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Validate Error:", error);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

// API #3 — Place a Combo into a Slot
router.post("/place", async (req, res) => {
  try {
    const { classId, day, hour, comboId, classTimetable, teacherTimetable, subjectHoursAssigned } = req.body;

    const classObj = await ClassModel.findById(classId).lean();
    const comboToPlace = await TeacherSubjectCombination.findById(comboId).lean();
    
    if (!comboToPlace) {
        return res.status(404).json({ ok: false, error: "Combo to place not found" });
    }

    // --- Temporarily Clear Slot for accurate validation ---
    const tempClassTimetable = JSON.parse(JSON.stringify(classTimetable));
    const tempTeacherTimetable = JSON.parse(JSON.stringify(teacherTimetable));
    const tempSubjectHours = { ...subjectHoursAssigned };

    const previouslyPlacedComboId = tempClassTimetable[classId]?.[day]?.[hour];
    if (previouslyPlacedComboId) {
        tempClassTimetable[classId][day][hour] = null;
        const oldCombo = await TeacherSubjectCombination.findById(previouslyPlacedComboId).lean();
        if (oldCombo) {
            const oldFacultyId = oldCombo.faculty.toString();
            const oldSubjectId = oldCombo.subject.toString();
            if (tempTeacherTimetable[oldFacultyId]?.[day]?.[hour] === previouslyPlacedComboId) {
                tempTeacherTimetable[oldFacultyId][day][hour] = null;
            }
            tempSubjectHours[oldSubjectId] = (tempSubjectHours[oldSubjectId] || 1) - 1;
        }
    }
    // --- End of Temporary Clear ---

    // Validation is now performed on the temporary, cleared state
    const remainingHours = computeRemainingHours(classObj, tempSubjectHours);
    const c1 = checkClassConstraints(tempClassTimetable, classObj, day, hour, comboToPlace.subject.toString(), remainingHours);
    if (!c1.ok) return res.json(c1);

    const c2 = checkTeacherConstraints(tempTeacherTimetable, comboToPlace.faculty.toString(), day, hour);
    if (!c2.ok) return res.json(c2);
    
    // --- If validation passes, apply changes to the original state objects ---
    // Note: We use the original objects passed in the request, not the temp ones.
    const newClassTimetable = JSON.parse(JSON.stringify(classTimetable));
    const newTeacherTimetable = JSON.parse(JSON.stringify(teacherTimetable));
    const newSubjectHoursAssigned = { ...subjectHoursAssigned };

    // Clear old data from original state
    const originalOldComboId = newClassTimetable[classId]?.[day]?.[hour];
    if (originalOldComboId) {
        const oldCombo = await TeacherSubjectCombination.findById(originalOldComboId).lean();
        if (oldCombo) {
            newSubjectHoursAssigned[oldCombo.subject.toString()] = (newSubjectHoursAssigned[oldCombo.subject.toString()] || 1) - 1;
        }
    }

    // Add new data to original state
    newClassTimetable[classId][day][hour] = comboId;
    
    const facultyId = comboToPlace.faculty.toString();
    if (!newTeacherTimetable[facultyId]) newTeacherTimetable[facultyId] = [];
    if (!newTeacherTimetable[facultyId][day]) newTeacherTimetable[facultyId][day] = [];
    newTeacherTimetable[facultyId][day][hour] = comboId;

    const subjectId = comboToPlace.subject.toString();
    newSubjectHoursAssigned[subjectId] = (newSubjectHoursAssigned[subjectId] || 0) + 1;

    return res.json({
      ok: true,
      classTimetable: newClassTimetable,
      teacherTimetable: newTeacherTimetable,
      subjectHoursAssigned: newSubjectHoursAssigned
    });
  } catch (error) {
    console.error("Place Error:", error);
    return res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
