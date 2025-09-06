const express = require('express');
const router = express.Router();
const Faculty = require('../Faculty');
const Subject = require('../Subject');
const ClassModel = require('../Class');
const Combo = require('../Combo');
const TimetableResult = require('../TmietableResult');
const generator = require('../lib/generator');

// CRUD: faculties
router.post('/faculties', async (req, res) => {
  try {
    const f = new Faculty();
    f.id = req.body.id;
    f.name = req.body.name;
    await f.save();
    res.json(f);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/faculties', async (req, res) => {
  res.json(await Faculty.find().lean());
});

// Update an existing faculty
router.put('/faculties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, id: facultyId } = req.body;
    const updatedFaculty = await Faculty.findOneAndUpdate(
      { _id: id },
      { name: name, id: facultyId }, // Use the 'id' field for the facultyId from the body
      { new: true, runValidators: true }
    );
    if (!updatedFaculty) {
      return res.status(404).json({ error: 'Faculty not found.' });
    }
    res.json(updatedFaculty);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete a faculty
router.delete('/faculties/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedFaculty = await Faculty.findByIdAndDelete(id);
    if (!deletedFaculty) {
      return res.status(404).json({ error: 'Faculty not found.' });
    }
    res.json({ message: 'Faculty deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// subjects
router.post('/subjects', async (req, res) => {
  try { const s = new Subject(req.body); await s.save(); res.json(s); }
  catch (e) { res.status(400).json({error: e.message}); }
});
router.get('/subjects', async (req, res) => res.json(await Subject.find().lean()));

// Update an existing subject
router.put('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedSubject = await Subject.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedSubject) {
      return res.status(404).json({ error: 'Subject not found.' });
    }
    res.json(updatedSubject);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete a subject
router.delete('/subjects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedSubject = await Subject.findByIdAndDelete(id);
    if (!deletedSubject) {
      return res.status(404).json({ error: 'Subject not found.' });
    }
    res.json({ message: 'Subject deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// classes
router.post('/classes', async (req, res) => {
  try {
    const c = new ClassModel({...req.body, assigned_teacher_subject_combos: req.body.assigned_teacher_subject_combos || [], total_class_hours: req.body.total_class_hours || 0});
    await c.save(); res.json(c);
  } catch (e) { res.status(400).json({error: e.message}); }
});
router.get('/classes', async (req, res) => res.json(await ClassModel.find().lean()));

// Update an existing class
router.put('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedClass = await ClassModel.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedClass) {
      return res.status(404).json({ error: 'Class not found.' });
    }
    res.json(updatedClass);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete a class
router.delete('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deletedClass = await ClassModel.findByIdAndDelete(id);
    if (!deletedClass) {
      return res.status(404).json({ error: 'Class not found.' });
    }
    res.json({ message: 'Class deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// create combos from subjects (mirrors create_teacher_subject_combinations)

// Create combos from subjects and assign them to classes in a single route
// router.post('/create-and-assign-combos', async (req, res) => {
//   try {
//     const subs = await Subject.find().lean();
//     const faculties = await Faculty.find().lean();
//     const classes = await ClassModel.find().lean();
//     let created = [];
//     let nextId = 1 + (await Combo.countDocuments());

//     // 1. Create missing combos
//     for (const s of subs) {
//       const exists = await Combo.findOne({ subject_id: s.id });
//       if (exists) continue;
//       const fac = faculties.find(f => f.id === s.faculty_id);
//       const combo = new Combo({
//         id: nextId++,
//         faculty_id: s.faculty_id,
//         subject_id: s.id,
//         combo_name: `${fac ? fac.name : 'Unknown'} - ${s.name}`
//       });
//       await combo.save();
//       created.push(combo);
//     }

//     // 2. Assign combos to classes
//     const allCombos = await Combo.find().lean();
//     for (const cls of classes) {
//       const assigned = [];
//       let total = 0;
//       for (const cb of allCombos) {
//         const subj = subs.find(s => s.id === cb.subject_id);
//         if (subj && subj.sem === cls.sem) {
//           assigned.push(cb.id);
//           total += subj.no_of_hours_per_week;
//         }
//       }
//       await ClassModel.updateOne({ _id: cls._id }, { assigned_teacher_subject_combos: assigned, total_class_hours: total });
//     }

//     res.json({ created, assigned: true });
//   } catch (e) {
//     res.status(500).json({ error: e.message });
//   }
// });

// Allow user to add a combo and assign it to classes from frontend
router.post('/add-and-assign-combo', async (req, res) => {
  try {
    const { faculty_id, subject_id, combo_name, class_id } = req.body;
    if (!faculty_id || !subject_id || !combo_name) {
      return res.status(400).json({ error: 'faculty_id, subject_id, and combo_name are required.' });
    }

    // Generate unique numeric ID
    let lastCombo = await Combo.findOne().sort({ id: -1 }).exec();
    let nextId = lastCombo ? lastCombo.id + 1 : 1;

    const combo = new Combo({
      id: nextId,
      faculty_id,
      subject_id,
      combo_name
    });
    await combo.save();

    // Assign to classes if provided
    if (Array.isArray(class_id) && class_id.length > 0) {
      await ClassModel.updateMany(
        { _id: { $in: class_id } },
        { $addToSet: { assigned_teacher_subject_combos: combo.id } }
      );
    }

    res.json({ combo, assignedTo: class_id || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// --- CREATE-AND-ASSIGN-COMBOS RESOURCE ROUTES ---

// Get all combos and their class assignments (summary)
router.get('/create-and-assign-combos', async (req, res) => {
  try {
    const combos = await Combo.find().lean();
    const classes = await ClassModel.find().lean();

    const classAssignments = classes.map(cls => {
      // Map assigned IDs -> full combo objects
      const assignedCombos = (cls.assigned_teacher_subject_combos || [])
        .map(cId => combos.find(c => String(c.id) === String(cId)))
        .filter(Boolean); // remove nulls

      return {
        classId: cls._id,
        className: cls.name,
        assignedCombos,
      };
    });

    res.json({ combos, classAssignments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Edit a combo and its assignment (edit combo, and optionally reassign to classes)
router.put('/create-and-assign-combos/:comboId', async (req, res) => {
  try {
    const { comboId } = req.params;
    const { combo_name, faculty_id, subject_id, class_id } = req.body;
    // Update combo fields
    const updatedCombo = await Combo.findByIdAndUpdate(comboId, { combo_name, faculty_id, subject_id, class_id }, { new: true, runValidators: true });
    if (!updatedCombo) return res.status(404).json({ error: 'Combo not found.' });
    // Optionally reassign combo to classes
    if (Array.isArray(class_id)) {
      // Remove combo from all classes first
      await ClassModel.updateMany(
        { assigned_teacher_subject_combos: comboId },
        { $pull: { assigned_teacher_subject_combos: comboId } }
      );
      // Add combo to specified classes
      await ClassModel.updateMany(
        { _id: { $in: class_id } },
        { $addToSet: { assigned_teacher_subject_combos: comboId } }
      );
    }
    res.json({ updatedCombo });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Delete a combo and remove from all class assignments
router.delete('/create-and-assign-combos/:comboId', async (req, res) => {
  try {
    const { comboId } = req.params;
    // Remove combo from all classes
    await ClassModel.updateMany(
      { assigned_teacher_subject_combos: comboId },
      { $pull: { assigned_teacher_subject_combos: comboId } }
    );
    // Delete combo
    const deletedCombo = await Combo.findByIdAndDelete(comboId);
    if (!deletedCombo) return res.status(404).json({ error: 'Combo not found.' });
    res.json({ message: 'Combo deleted and removed from all classes.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

  // --- COMBO CRUD ROUTES ---

  // // Get all combos
  // router.get('/combos', async (req, res) => {
  //   try {
  //     const combos = await Combo.find().lean();
  //     res.json(combos);
  //   } catch (e) {
  //     res.status(500).json({ error: e.message });
  //   }
  // });

  // // Add a combo
  // router.post('/combos', async (req, res) => {
  //   try {
  //     const combo = new Combo(req.body);
  //     await combo.save();
  //     res.json(combo);
  //   } catch (e) {
  //     res.status(400).json({ error: e.message });
  //   }
  // });

  // // Edit a combo
  // router.put('/combos/:id', async (req, res) => {
  //   try {
  //     const { id } = req.params;
  //     const updatedCombo = await Combo.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  //     if (!updatedCombo) {
  //       return res.status(404).json({ error: 'Combo not found.' });
  //     }
  //     res.json(updatedCombo);
  //   } catch (e) {
  //     res.status(400).json({ error: e.message });
  //   }
  // });

  // // Delete a combo
  // router.delete('/combos/:id', async (req, res) => {
  //   try {
  //     const { id } = req.params;
  //     const deletedCombo = await Combo.findByIdAndDelete(id);
  //     if (!deletedCombo) {
  //       return res.status(404).json({ error: 'Combo not found.' });
  //     }
  //     res.json({ message: 'Combo deleted successfully.' });
  //   } catch (e) {
  //     res.status(500).json({ error: e.message });
  //   }
  // });

  // --- CLASS ASSIGNED COMBOS ROUTES ---

  // Get all combos assigned to a class
  // router.get('/classes/:id/combos', async (req, res) => {
  //   try {
  //     const { id } = req.params;
  //     const cls = await ClassModel.findById(id).lean();
  //     if (!cls) return res.status(404).json({ error: 'Class not found.' });
  //     // assigned_teacher_subject_combos is an array of combo ids
  //     const combos = await Combo.find({ id: { $in: cls.assigned_teacher_subject_combos } }).lean();
  //     res.json(combos);
  //   } catch (e) {
  //     res.status(500).json({ error: e.message });
  //   }
  // });

  // // Edit a combo assigned to a class (update combo by combo _id)
  // router.put('/classes/:classId/combos/:comboId', async (req, res) => {
  //   try {
  //     const { comboId } = req.params;
  //     const updatedCombo = await Combo.findByIdAndUpdate(comboId, req.body, { new: true, runValidators: true });
  //     if (!updatedCombo) {
  //       return res.status(404).json({ error: 'Combo not found.' });
  //     }
  //     res.json(updatedCombo);
  //   } catch (e) {
  //     res.status(400).json({ error: e.message });
  //   }
  // });

  // // Delete a combo assigned to a class (remove combo from class's assigned_teacher_subject_combos)
  // router.delete('/classes/:classId/combos/:comboId', async (req, res) => {
  //   try {
  //     const { classId, comboId } = req.params;
  //     const cls = await ClassModel.findById(classId);
  //     if (!cls) return res.status(404).json({ error: 'Class not found.' });
  //     // Remove comboId from assigned_teacher_subject_combos
  //     cls.assigned_teacher_subject_combos = (cls.assigned_teacher_subject_combos || []).filter(id => String(id) !== String(comboId));
  //     await cls.save();
  //     res.json({ message: 'Combo removed from class.' });
  //   } catch (e) {
  //     res.status(500).json({ error: e.message });
  //   }
  // });

// generate timetable
router.post('/generate', async (req, res) => {
  try {
    const faculties = await Faculty.find().lean();
    const subjects = await Subject.find().lean();
    const classes = await ClassModel.find().lean();
    const combos = await Combo.find().lean();

    // call generator
    const result = generator.generate({
      faculties, subjects, classes, combos,
      DAYS_PER_WEEK: 5, HOURS_PER_DAY: 8
    });

    if (!result.ok) return res.status(400).json(result);

    // save:
    const rec = new TimetableResult({
      class_timetables: result.class_timetables,
      faculty_timetables: result.faculty_timetables
    });
    await rec.save();
    res.json({ ok: true, result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// get last result
router.get('/result/latest', async (req, res) => {
  const r = await TimetableResult.findOne().sort({createdAt:-1}).lean();
  res.json(r);
});

module.exports = router;
