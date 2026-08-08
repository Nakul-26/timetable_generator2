import { Router } from 'express';
import ClassModel from '../../models/Class.js';
import ClassSubject from '../../models/ClassSubject.js';
import Faculty from '../../models/Faculty.js';
import Subject from '../../models/Subject.js';
import TeacherSubjectCombination from '../../models/TeacherSubjectCombination.js';
import TeachingAllocation from '../../models/TeachingAllocation.js';
import auth from '../../middleware/auth.js';
import { validateOwnership, validateOwnershipMany } from '../../utils/validateTenantRefs.js';
import { unassignTeacherFromAllocations } from '../../services/domain/teachingAllocation.service.js';
import { getClassAssignmentsForEdit } from '../../services/manual-timetable/assignmentResolver.service.js';


const protectedRouter = Router();
protectedRouter.use(auth);

// --- Classes CRUD ---
//add classes
protectedRouter.post('/classes', async (req, res) => {
  try {
    const comboIds = Array.isArray(req.body.assigned_teacher_subject_combos)
      ? req.body.assigned_teacher_subject_combos
      : [];
    const facultyIds = Array.isArray(req.body.faculties)
      ? req.body.faculties
      : [];

    if (comboIds.length > 0) {
      await validateOwnershipMany(
        TeacherSubjectCombination,
        comboIds,
        req.collegeId,
        "assigned_teacher_subject_combos"
      );
    }
    if (facultyIds.length > 0) {
      await validateOwnershipMany(Faculty, facultyIds, req.collegeId, "faculties");
    }

    const c = new ClassModel({
      ...req.body,
      collegeId: req.collegeId,
      assigned_teacher_subject_combos: req.body.assigned_teacher_subject_combos || [],
      total_class_hours: req.body.total_class_hours || 0
    });
    await c.save();
    res.json(c);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || 'Bad Request' });
  }
});

//get all classes
protectedRouter.get('/classes', async (req, res) => {
  try {
    const classes = await ClassModel.find({ collegeId: req.collegeId }).populate('faculties').lean();
    res.json(classes);
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Edit a class
protectedRouter.put('/classes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sem, section, id: classId, days_per_week } = req.body;
    const updateData = { name, sem, section, id: classId, days_per_week };

    const updatedClass = await ClassModel.findOneAndUpdate(
      { _id: id, collegeId: req.collegeId },
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
    const deletedClass = await ClassModel.findOneAndDelete({ _id: id, collegeId: req.collegeId });
    if (!deletedClass) {
      return res.status(404).json({ error: 'Class not found.' });
    }

    // Delete associated class-subject assignments
    await ClassSubject.deleteMany({ class: id, collegeId: req.collegeId });

    // Handle TeachingAllocations
    // 1. Delete allocations where this is the only class
    await TeachingAllocation.deleteMany({
      collegeId: req.collegeId,
      classIds: { $size: 1, $all: [id] }
    });

    // 2. Pull this class from allocations with multiple classes (combined classes)
    await TeachingAllocation.updateMany(
      { collegeId: req.collegeId, classIds: id },
      { $pull: { classIds: id } }
    );

    res.json({ message: 'Class deleted successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Class-centric workspace: everything one class needs in a single call
protectedRouter.get('/classes/:id/workspace', async (req, res) => {
  try {
    const { id } = req.params;

    const classDoc = await ClassModel.findOne({ _id: id, collegeId: req.collegeId })
      .populate('faculties', 'name id')
      .populate('classTeacherId', 'name id')
      .lean();
    if (!classDoc) {
      return res.status(404).json({ error: 'Class not found.' });
    }

    const [assignments, availableSubjects, availableTeachers] = await Promise.all([
      getClassAssignmentsForEdit(req.collegeId, id, null),
      Subject.find({ collegeId: req.collegeId }).select('name id type classesPerWeek').lean(),
      Faculty.find({ collegeId: req.collegeId }).select('name id').lean(),
    ]);

    const { classTeacherId, ...classRest } = classDoc;

    res.json({
      class: classRest,
      classTeacher: classTeacherId || null,
      assignments,
      availableSubjects,
      availableTeachers,
    });
  } catch (e) {
    console.error('[GET /classes/:id/workspace] Error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Set or clear a class's class teacher
protectedRouter.put('/classes/:id/class-teacher', async (req, res) => {
  try {
    const { id } = req.params;
    const facultyId = req.body.facultyId ? String(req.body.facultyId).trim() : null;

    if (facultyId) {
      await validateOwnership(Faculty, facultyId, req.collegeId, 'Faculty');
    }

    const updatedClass = await ClassModel.findOneAndUpdate(
      { _id: id, collegeId: req.collegeId },
      { classTeacherId: facultyId || null },
      { new: true }
    ).populate('classTeacherId', 'name id');
    if (!updatedClass) {
      return res.status(404).json({ error: 'Class not found.' });
    }
    res.json(updatedClass);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || 'Bad Request' });
  }
});

// Add a faculty to a class
protectedRouter.post('/classes/:classId/faculties', async (req, res) => {
    try {
        const { classId } = req.params;
        const { facultyId } = req.body;
        await validateOwnership(Faculty, facultyId, req.collegeId, "Faculty");

        const updatedClass = await ClassModel.findOneAndUpdate(
            { _id: classId, collegeId: req.collegeId },
            { $addToSet: { faculties: facultyId } },
            { new: true }
        ).populate('faculties');

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found.' });
        }
        res.json(updatedClass);
    } catch (e) {
        res.status(e.status || 400).json({ error: e.message || 'Bad Request' });
    }
});

// Remove a faculty from a class
protectedRouter.delete('/classes/:classId/faculties/:facultyId', async (req, res) => {
    try {
        const { classId, facultyId } = req.params;

        const updatedClass = await ClassModel.findOneAndUpdate(
            { _id: classId, collegeId: req.collegeId },
            { $pull: { faculties: facultyId } },
            { new: true }
        ).populate('faculties');

        if (!updatedClass) {
            return res.status(404).json({ error: 'Class not found.' });
        }

        // Handle TeachingAllocations
        await unassignTeacherFromAllocations(req.collegeId, facultyId, { classId });

        res.json(updatedClass);
    } catch (e) {
        res.status(400).json({ error: 'Bad Request' });
    }
});

export default protectedRouter;
