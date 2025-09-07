const express = require('express');
const router = express.Router();
const Faculty = require('../Faculty');
const Subject = require('../Subject');
const ClassModel = require('../Class');
const Combo = require('../Combo');
const TimetableResult = require('../TmietableResult');
const generator = require('../lib/generator');

// --- Faculties CRUD ---
router.post('/faculties', async (req, res) => {
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

router.get('/faculties', async (req, res) => {
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
router.put('/faculties/:id', async (req, res) => {
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
router.delete('/faculties/:id', async (req, res) => {
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
    console.error("[DELETE /faculties/:id] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Subjects CRUD ---
router.post('/subjects', async (req, res) => {
  console.log("[POST /subjects] Body:", req.body);
  try {
    const s = new Subject(req.body);
    await s.save();
    console.log("[POST /subjects] Saved subject:", s);
    res.json(s);
  } catch (e) {
    console.error("[POST /subjects] Error:", e.message);
    res.status(400).json({ error: e.message });
  }
});

router.get('/subjects', async (req, res) => {
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

// --- Classes CRUD ---
router.post('/classes', async (req, res) => {
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

router.get('/classes', async (req, res) => {
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

// --- Combos ---
router.post('/add-and-assign-combo', async (req, res) => {
  console.log("[POST /add-and-assign-combo] Body:", req.body);
  try {
    const { faculty_id, subject_id, combo_name, class_id } = req.body;
    if (!faculty_id || !subject_id || !combo_name) {
      console.warn("[POST /add-and-assign-combo] Missing required fields");
      return res.status(400).json({ error: 'faculty_id, subject_id, and combo_name are required.' });
    }

    let lastCombo = await Combo.findOne().sort({ id: -1 }).exec();
    let nextId = lastCombo ? lastCombo.id + 1 : 1;
    console.log("[POST /add-and-assign-combo] Next combo id:", nextId);

    const combo = new Combo({ id: nextId, faculty_id, subject_id, combo_name });
    await combo.save();
    console.log("[POST /add-and-assign-combo] Saved combo:", combo);

    if (Array.isArray(class_id) && class_id.length > 0) {
      console.log("[POST /add-and-assign-combo] Assigning combo to classes:", class_id);
      await ClassModel.updateMany(
        { _id: { $in: class_id } },
        { $addToSet: { assigned_teacher_subject_combos: combo.id } }
      );
    }

    res.json({ combo, assignedTo: class_id || [] });
  } catch (e) {
    console.error("[POST /add-and-assign-combo] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Timetable ---
router.post('/generate', async (req, res) => {
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

    const result = generator.generate({
      faculties, subjects, classes, combos,
      DAYS_PER_WEEK: 5, HOURS_PER_DAY: 8
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

router.get('/result/latest', async (req, res) => {
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

module.exports = router;
