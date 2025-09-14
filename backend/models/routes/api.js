import { Router } from "express";
import Faculty from "../Faculty.js";
import Subject from "../Subject.js";
import ClassModel from "../Class.js";
import Combo from "../Combo.js";
import TimetableResult from "../TmietableResult.js";
import generator from "../lib/generator.js";
import runGenerate from "../lib/runGenerator.js";

const router = Router();

/* -------------------- FACULTIES -------------------- */

// Create faculty
router.post("/faculties", async (req, res) => {
  console.log("[POST /faculties] Body:", req.body);
  try {
    const faculty = new Faculty({
      id: req.body.id,
      name: req.body.name,
    });
    await faculty.save();
    res.json(faculty);
  } catch (err) {
    console.error("[POST /faculties] Error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Get all faculties
router.get("/faculties", async (_req, res) => {
  try {
    const faculties = await Faculty.find().lean();
    res.json(faculties);
  } catch (err) {
    console.error("[GET /faculties] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update faculty
router.put("/faculties/:id", async (req, res) => {
  try {
    const updated = await Faculty.findByIdAndUpdate(
      req.params.id,
      { name: req.body.name, id: req.body.id },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ ok: false, error: "Faculty not found" });
    res.json(updated);
  } catch (err) {
    console.error("[PUT /faculties/:id] Error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Delete faculty (and linked combos)
router.delete("/faculties/:id", async (req, res) => {
  try {
    const deleted = await Faculty.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Faculty not found" });

    const deletedCombos = await Combo.deleteMany({ faculty_id: req.params.id });
    console.log(`[DELETE /faculties/:id] Deleted ${deletedCombos.deletedCount} combos`);

    res.json({ ok: true, message: "Faculty deleted successfully" });
  } catch (err) {
    console.error("[DELETE /faculties/:id] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- SUBJECTS -------------------- */

// Create subject
router.post("/subjects", async (req, res) => {
  console.log("[POST /subjects] Body:", req.body);
  try {
    const subject = new Subject(req.body);
    await subject.save();
    res.json(subject);
  } catch (err) {
    console.error("[POST /subjects] Error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Get all subjects
router.get("/subjects", async (_req, res) => {
  try {
    const subjects = await Subject.find().lean();
    res.json(subjects);
  } catch (err) {
    console.error("[GET /subjects] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update subject
router.put("/subjects/:id", async (req, res) => {
  try {
    const updated = await Subject.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Subject not found" });
    res.json(updated);
  } catch (err) {
    console.error("[PUT /subjects/:id] Error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Delete subject (and linked combos)
router.delete("/subjects/:id", async (req, res) => {
  try {
    const deleted = await Subject.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Subject not found" });

    const deletedCombos = await Combo.deleteMany({ subject_id: req.params.id });
    console.log(`[DELETE /subjects/:id] Deleted ${deletedCombos.deletedCount} combos`);

    res.json({ ok: true, message: "Subject deleted successfully" });
  } catch (err) {
    console.error("[DELETE /subjects/:id] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- CLASSES -------------------- */

// Create class
router.post("/classes", async (req, res) => {
  try {
    const c = new ClassModel({
      ...req.body,
      assigned_teacher_subject_combos: req.body.assigned_teacher_subject_combos || [],
      total_class_hours: req.body.total_class_hours || 0,
    });
    await c.save();
    res.json(c);
  } catch (err) {
    console.error("[POST /classes] Error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Get all classes
router.get("/classes", async (_req, res) => {
  try {
    const classes = await ClassModel.find().lean();
    res.json(classes);
  } catch (err) {
    console.error("[GET /classes] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update class
router.put("/classes/:id", async (req, res) => {
  try {
    const updated = await ClassModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Class not found" });
    res.json(updated);
  } catch (err) {
    console.error("[PUT /classes/:id] Error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Delete class (and linked combos)
router.delete("/classes/:id", async (req, res) => {
  try {
    const deleted = await ClassModel.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Class not found" });

    const deletedCombos = await Combo.deleteMany({ class_id: req.params.id });
    console.log(`[DELETE /classes/:id] Deleted ${deletedCombos.deletedCount} combos`);

    res.json({ ok: true, message: "Class deleted successfully" });
  } catch (err) {
    console.error("[DELETE /classes/:id] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- COMBOS -------------------- */

// Create and assign combo
router.post("/combos", async (req, res) => {
  try {
    const { faculty_id, subject_id, combo_name, class_id } = req.body;
    if (!faculty_id || !subject_id || !combo_name || !class_id) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const combo = new Combo({ faculty_id, subject_id, combo_name, class_id });
    await combo.save();

    await ClassModel.updateOne(
      { _id: class_id },
      { $addToSet: { assigned_teacher_subject_combos: combo._id } }
    );

    const updatedClass = await ClassModel.findById(class_id).lean();
    res.json({ ok: true, combo, assignedTo: updatedClass });
  } catch (err) {
    console.error("[POST /combos] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get all combos
router.get("/combos", async (_req, res) => {
  try {
    const combos = await Combo.find().lean();
    res.json(combos);
  } catch (err) {
    console.error("[GET /combos] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update combo
router.put("/combos/:id", async (req, res) => {
  try {
    const { faculty_id, subject_id, combo_name, class_id } = req.body;
    const combo = await Combo.findById(req.params.id);
    if (!combo) return res.status(404).json({ ok: false, error: "Combo not found" });

    // Unassign if moved to another class
    if (combo.class_id && combo.class_id.toString() !== class_id) {
      await ClassModel.updateOne(
        { _id: combo.class_id },
        { $pull: { assigned_teacher_subject_combos: combo._id } }
      );
    }

    Object.assign(combo, { faculty_id, subject_id, combo_name, class_id });
    await combo.save();

    if (class_id) {
      await ClassModel.updateOne(
        { _id: class_id },
        { $addToSet: { assigned_teacher_subject_combos: combo._id } }
      );
    }

    const updated = await Combo.findById(req.params.id)
      .populate("faculty_id")
      .populate("subject_id")
      .populate("class_id")
      .lean();

    res.json(updated);
  } catch (err) {
    console.error("[PUT /combos/:id] Error:", err.message);
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Delete combo
router.delete("/combos/:id", async (req, res) => {
  try {
    const deleted = await Combo.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, error: "Combo not found" });

    if (deleted.class_id) {
      await ClassModel.updateOne(
        { _id: deleted.class_id },
        { $pull: { assigned_teacher_subject_combos: deleted._id } }
      );
    }

    res.json({ ok: true, message: "Combo deleted successfully" });
  } catch (err) {
    console.error("[DELETE /combos/:id] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* -------------------- TIMETABLE -------------------- */

// Generate timetable
router.post("/timetables/generate", async (_req, res) => {
  try {
    const [faculties, subjects, classes, combos] = await Promise.all([
      Faculty.find().lean(),
      Subject.find().lean(),
      ClassModel.find().lean(),
      Combo.find().lean(),
    ]);

    const result = generator.generate({
      faculties,
      subjects,
      classes,
      combos,
      DAYS_PER_WEEK: 5,
      HOURS_PER_DAY: 9,
    });

    if (!result.ok) return res.status(400).json(result);

    const rec = new TimetableResult({
      class_timetables: result.class_timetables,
      faculty_timetables: result.faculty_timetables,
    });
    await rec.save();

    res.json({ ok: true, result });
  } catch (err) {
    console.error("[POST /timetables/generate] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get latest timetable
router.get("/timetables/latest", async (_req, res) => {
  try {
    const latest = await TimetableResult.findOne().sort({ createdAt: -1 }).lean();
    res.json(latest);
  } catch (err) {
    console.error("[GET /timetables/latest] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Regenerate timetable
router.post("/timetables/regenerate", async (_req, res) => {
  try {
    const [faculties, subjects, classes, combos] = await Promise.all([
      Faculty.find().lean(),
      Subject.find().lean(),
      ClassModel.find().lean(),
      Combo.find().lean(),
    ]);

    const { bestClassTimetables, bestFacultyTimetables, bestScore } = runGenerate({
      faculties,
      subjects,
      classes,
      combos,
    });

    if (!bestClassTimetables) {
      return res.status(400).json({ ok: false, error: "Failed to generate timetable" });
    }

    const rec = new TimetableResult({
      class_timetables: bestClassTimetables,
      faculty_timetables: bestFacultyTimetables,
      score: bestScore,
    });
    await rec.save();

    res.json({ ok: true, score: bestScore, class_timetables: bestClassTimetables, faculty_timetables: bestFacultyTimetables });
  } catch (err) {
    console.error("[POST /timetables/regenerate] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete all timetables
router.delete("/timetables", async (_req, res) => {
  try {
    const result = await TimetableResult.deleteMany({});
    res.json({ ok: true, deletedCount: result.deletedCount, message: "All timetables deleted successfully" });
  } catch (err) {
    console.error("[DELETE /timetables] Error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
