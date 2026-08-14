import { Router } from 'express';
import auth from '../../middleware/auth.js';
import Subject from '../../models/Subject.js';
import Faculty from '../../models/Faculty.js';
import { prepareGeneratorData } from '../../services/generator/prepareGeneratorData.js';
import { normalizeCombo } from '../../utils/comboNormalizer.js';

// --- AssignmentDTO views (Phase 4 replacement for /teacher-subject-combos + /class-subjects) ---
// Both routes read through prepareGeneratorData's canonical TeachingAllocation expansion
// (the same EXPLICIT-mode pipeline GET /fixed-slot-combos already uses) instead of querying
// the legacy TeacherSubjectCombination/ClassSubject collections directly, so the frontend
// no longer needs those two read-only bridge routes.

const protectedRouter = Router();
protectedRouter.use(auth);

protectedRouter.get('/assignment-combos', async (req, res) => {
  try {
    const generatorData = await prepareGeneratorData(req.collegeId, 'EXPLICIT');
    const [subjectDocs, facultyDocs] = await Promise.all([
      Subject.find({ collegeId: req.collegeId }).select('name type').lean(),
      Faculty.find({ collegeId: req.collegeId }).select('name').lean(),
    ]);
    const subjectMap = new Map(subjectDocs.map((s) => [String(s._id), s]));
    const facultyMap = new Map(facultyDocs.map((f) => [String(f._id), f.name]));

    const combos = (generatorData.combos || [])
      .map((rawCombo) => {
        const canonical = normalizeCombo(rawCombo);
        if (!canonical) return null;
        const subjectDoc = subjectMap.get(canonical.subjectId);
        return {
          id: canonical._id,
          _id: canonical._id,
          subjectId: canonical.subjectId,
          subjectName: canonical.subjectName || subjectDoc?.name || null,
          teacherIds: canonical.facultyIds,
          teacherNames: canonical.facultyIds.map((id) => facultyMap.get(id) || null).filter(Boolean),
          classIds: canonical.classIds,
          mode: canonical.type,
        };
      })
      .filter(Boolean);

    res.json(combos);
  } catch (e) {
    console.error('[GET /assignment-combos] Error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

protectedRouter.get('/assignment-class-subject-hours', async (req, res) => {
  try {
    const generatorData = await prepareGeneratorData(req.collegeId, 'EXPLICIT');
    const rows = (generatorData.classSubjects || []).map((item) => ({
      class: String(item.classId),
      subject: String(item.subjectId),
      hoursPerWeek: Number(item.hoursPerWeek || 0),
    }));
    res.json(rows);
  } catch (e) {
    console.error('[GET /assignment-class-subject-hours] Error:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default protectedRouter;
