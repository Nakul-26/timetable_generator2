import { Router } from "express";
import auth from "../../middleware/auth.js";
import ClassModel from "../../models/Class.js";
import Subject from "../../models/Subject.js";
import Faculty from "../../models/Faculty.js";
import ClassSubject from "../../models/ClassSubject.js";
import TeacherSubjectCombination from "../../models/TeacherSubjectCombination.js";

const protectedRouter = Router();
protectedRouter.use(auth);

const toId = (value) => String(value || "").trim();

protectedRouter.get("/teaching-allocations", async (req, res) => {
  try {
    const [classes, combos, classSubjects] = await Promise.all([
      ClassModel.find()
        .populate("faculties", "name id")
        .lean(),
      TeacherSubjectCombination.find()
        .populate("faculty", "name id")
        .populate("subject", "name id type")
        .lean(),
      ClassSubject.find().lean(),
    ]);

    const comboById = new Map(combos.map((c) => [toId(c._id), c]));
    const classSubjectHours = new Map(
      classSubjects.map((cs) => [`${toId(cs.class)}|${toId(cs.subject)}`, cs.hoursPerWeek])
    );

    const allocations = [];
    for (const cls of classes) {
      const classId = toId(cls._id);
      for (const comboIdRaw of cls.assigned_teacher_subject_combos || []) {
        const comboId = toId(comboIdRaw);
        const combo = comboById.get(comboId);
        if (!combo) continue;

        const subjectId = toId(combo.subject?._id || combo.subject);
        const teacherId = toId(combo.faculty?._id || combo.faculty);
        const hoursPerWeek = classSubjectHours.get(`${classId}|${subjectId}`) ?? 0;

        allocations.push({
          id: `${classId}|${subjectId}|${teacherId}`,
          class: {
            _id: cls._id,
            id: cls.id,
            name: cls.name,
            sem: cls.sem,
            section: cls.section,
          },
          subject: combo.subject,
          teacher: combo.faculty,
          comboId: combo._id,
          hoursPerWeek,
          isLab: String(combo.subject?.type || "").toLowerCase() === "lab",
          status: "active",
        });
      }
    }

    res.json(allocations);
  } catch (e) {
    console.error("[GET /teaching-allocations] Error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

protectedRouter.post("/teaching-allocations", async (req, res) => {
  try {
    const classId = toId(req.body.classId);
    const subjectId = toId(req.body.subjectId);
    const teacherId = toId(req.body.teacherId);
    const hoursPerWeek = Number(req.body.hoursPerWeek);

    if (!classId || !subjectId || !teacherId || !Number.isFinite(hoursPerWeek) || hoursPerWeek < 1) {
      return res.status(400).json({ error: "classId, subjectId, teacherId and valid hoursPerWeek are required." });
    }

    const [klass, subject, teacher] = await Promise.all([
      ClassModel.findById(classId),
      Subject.findById(subjectId),
      Faculty.findById(teacherId),
    ]);

    if (!klass || !subject || !teacher) {
      return res.status(404).json({ error: "Class, subject, or teacher not found." });
    }

    const combo = await TeacherSubjectCombination.findOneAndUpdate(
      { faculty: teacherId, subject: subjectId },
      { $setOnInsert: { faculty: teacherId, subject: subjectId } },
      { new: true, upsert: true }
    );

    await ClassSubject.findOneAndUpdate(
      { class: classId, subject: subjectId },
      { $set: { hoursPerWeek } },
      { new: true, upsert: true }
    );

    await ClassModel.findByIdAndUpdate(classId, {
      $addToSet: {
        faculties: teacherId,
        assigned_teacher_subject_combos: combo._id,
      },
    });

    const populatedCombo = await TeacherSubjectCombination.findById(combo._id)
      .populate("faculty", "name id")
      .populate("subject", "name id type")
      .lean();

    res.status(201).json({
      ok: true,
      message: "Teaching allocation saved.",
      allocation: {
        classId,
        subjectId,
        teacherId,
        hoursPerWeek,
        comboId: combo._id,
        className: klass.name,
        subjectName: populatedCombo?.subject?.name || "",
        teacherName: populatedCombo?.faculty?.name || "",
      },
    });
  } catch (e) {
    console.error("[POST /teaching-allocations] Error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

protectedRouter.post("/teaching-allocations/calculate", async (req, res) => {
  try {
    const [classes, classSubjects, combos] = await Promise.all([
      ClassModel.find().select("_id name faculties").lean(),
      ClassSubject.find().select("class subject").lean(),
      TeacherSubjectCombination.find().select("_id faculty subject").lean(),
    ]);

    const subjectIdsByClassId = new Map();
    for (const row of classSubjects) {
      const classId = toId(row.class);
      const subjectId = toId(row.subject);
      if (!classId || !subjectId) continue;
      if (!subjectIdsByClassId.has(classId)) {
        subjectIdsByClassId.set(classId, new Set());
      }
      subjectIdsByClassId.get(classId).add(subjectId);
    }

    const comboIdByTeacherSubject = new Map();
    for (const combo of combos) {
      const teacherId = toId(combo.faculty);
      const subjectId = toId(combo.subject);
      if (!teacherId || !subjectId) continue;
      comboIdByTeacherSubject.set(`${teacherId}|${subjectId}`, toId(combo._id));
    }

    const summary = [];
    const bulkOps = [];
    let totalCombos = 0;

    for (const klass of classes) {
      const classId = toId(klass._id);
      const teacherIds = (klass.faculties || []).map((id) => toId(id)).filter(Boolean);
      const subjectIds = Array.from(subjectIdsByClassId.get(classId) || []);
      const derivedComboIds = new Set();

      for (const teacherId of teacherIds) {
        for (const subjectId of subjectIds) {
          const comboId = comboIdByTeacherSubject.get(`${teacherId}|${subjectId}`);
          if (comboId) derivedComboIds.add(comboId);
        }
      }

      const finalComboIds = Array.from(derivedComboIds);
      totalCombos += finalComboIds.length;
      bulkOps.push({
        updateOne: {
          filter: { _id: klass._id },
          update: { $set: { assigned_teacher_subject_combos: finalComboIds } },
        },
      });

      summary.push({
        classId,
        className: klass.name,
        teachersInClass: teacherIds.length,
        classSubjects: subjectIds.length,
        generatedCombos: finalComboIds.length,
      });
    }

    if (bulkOps.length > 0) {
      await ClassModel.bulkWrite(bulkOps);
    }

    res.json({
      ok: true,
      message: `Calculated combos for ${classes.length} classes.`,
      classesProcessed: classes.length,
      totalGeneratedCombos: totalCombos,
      summary,
    });
  } catch (e) {
    console.error("[POST /teaching-allocations/calculate] Error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

protectedRouter.delete("/teaching-allocations", async (req, res) => {
  try {
    const classId = toId(req.body.classId);
    const subjectId = toId(req.body.subjectId);
    const teacherId = toId(req.body.teacherId);

    if (!classId || !subjectId || !teacherId) {
      return res.status(400).json({ error: "classId, subjectId and teacherId are required." });
    }

    const combo = await TeacherSubjectCombination.findOne({
      faculty: teacherId,
      subject: subjectId,
    }).lean();

    if (combo) {
      await ClassModel.findByIdAndUpdate(classId, {
        $pull: { assigned_teacher_subject_combos: combo._id },
      });
    }

    const currentClass = await ClassModel.findById(classId).lean();
    const remainingComboIds = (currentClass?.assigned_teacher_subject_combos || []).map((id) => toId(id));

    if (remainingComboIds.length === 0) {
      await ClassSubject.deleteMany({ class: classId });
      await ClassModel.findByIdAndUpdate(classId, { $set: { faculties: [] } });
      return res.json({ ok: true, message: "Allocation deleted." });
    }

    const remainingCombos = await TeacherSubjectCombination.find({
      _id: { $in: remainingComboIds },
    }).lean();

    const subjectStillAssigned = remainingCombos.some((c) => toId(c.subject) === subjectId);
    if (!subjectStillAssigned) {
      await ClassSubject.deleteOne({ class: classId, subject: subjectId });
    }

    const teacherStillAssigned = remainingCombos.some((c) => toId(c.faculty) === teacherId);
    if (!teacherStillAssigned) {
      await ClassModel.findByIdAndUpdate(classId, { $pull: { faculties: teacherId } });
    }

    res.json({ ok: true, message: "Allocation deleted." });
  } catch (e) {
    console.error("[DELETE /teaching-allocations] Error:", e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default protectedRouter;
