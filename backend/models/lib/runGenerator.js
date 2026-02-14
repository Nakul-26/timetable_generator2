// runGenerator.js
import Generator from "./generator.js";

function buildGreedyPartial({
  classes,
  combos,
  faculties,
  fixedSlots = [],
  DAYS_PER_WEEK = 6,
  HOURS_PER_DAY = 8,
}) {
  const EMPTY = -1;

  const class_timetables = {};
  const maxDays = Math.max(
    1,
    ...classes.map((c) => Number(c.days_per_week || DAYS_PER_WEEK))
  );
  const faculty_timetables = {};
  const comboById = new Map((combos || []).map((c) => [String(c._id), c]));
  const subjectHoursByClass = new Map(
    (classes || []).map((c) => [String(c._id), c.subject_hours || {}])
  );

  for (const cls of classes || []) {
    const classId = String(cls._id);
    const days = Number(cls.days_per_week || DAYS_PER_WEEK);
    class_timetables[classId] = Array.from({ length: days }, () =>
      Array(HOURS_PER_DAY).fill(EMPTY)
    );
  }

  for (const f of faculties || []) {
    const fid = String(f._id);
    faculty_timetables[fid] = Array.from({ length: maxDays }, () =>
      Array(HOURS_PER_DAY).fill(EMPTY)
    );
  }

  const canPlace = (classId, combo, day, hour) => {
    if (!class_timetables[classId] || !class_timetables[classId][day]) return false;
    if (class_timetables[classId][day][hour] !== EMPTY) return false;
    for (const fid of combo.faculty_ids || []) {
      if (!faculty_timetables[fid] || !faculty_timetables[fid][day]) return false;
      if (faculty_timetables[fid][day][hour] !== EMPTY) return false;
    }
    return true;
  };

  const place = (classId, comboId, day, hour) => {
    const combo = comboById.get(String(comboId));
    if (!combo) return false;
    if (!canPlace(classId, combo, day, hour)) return false;
    class_timetables[classId][day][hour] = comboId;
    for (const fid of combo.faculty_ids || []) {
      faculty_timetables[fid][day][hour] = comboId;
    }
    return true;
  };

  // Place fixed slots first when valid.
  for (const fs of fixedSlots || []) {
    const classId = String(fs.class);
    const day = Number(fs.day);
    const hour = Number(fs.hour);
    const comboId = String(fs.combo);
    place(classId, comboId, day, hour);
  }

  const unmet_requirements = [];

  for (const cls of classes || []) {
    const classId = String(cls._id);
    const days = Number(cls.days_per_week || DAYS_PER_WEEK);
    const assignedSet = new Set((cls.assigned_teacher_subject_combos || []).map(String));
    const classCombos = (combos || []).filter((cb) => {
      const cidList = (cb.class_ids || []).map(String);
      return assignedSet.has(String(cb._id)) || cidList.includes(classId);
    });

    const comboBySubject = new Map();
    for (const cb of classCombos) {
      const sid = String(cb.subject_id);
      if (!comboBySubject.has(sid)) comboBySubject.set(sid, []);
      comboBySubject.get(sid).push(cb);
    }

    const subjectHours = subjectHoursByClass.get(classId) || {};
    for (const [subjectId, required] of Object.entries(subjectHours)) {
      let remaining = Number(required || 0);
      if (remaining <= 0) continue;
      const candidates = comboBySubject.get(String(subjectId)) || [];
      if (candidates.length === 0) {
        unmet_requirements.push({
          class_id: classId,
          subject_id: String(subjectId),
          required_hours: remaining,
          scheduled_hours: 0,
          reason: "no_eligible_combos_or_slots",
        });
        continue;
      }

      let scheduled = 0;
      outer: for (let day = 0; day < days; day++) {
        for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
          for (const cb of candidates) {
            if (place(classId, cb._id, day, hour)) {
              scheduled += 1;
              remaining -= 1;
              break;
            }
          }
          if (remaining <= 0) break outer;
        }
      }

      if (remaining > 0) {
        unmet_requirements.push({
          class_id: classId,
          subject_id: String(subjectId),
          required_hours: Number(required || 0),
          scheduled_hours: scheduled,
          reason: "infeasible_under_current_constraints",
        });
      }
    }
  }

  return { class_timetables, faculty_timetables, unmet_requirements };
}

async function runGenerate({
  faculties,
  subjects,
  classes,
  combos,
  fixedSlots,
  onProgress,
  attempts = 3,
}) {
  let best_class_timetables = null;
  let best_faculty_timetables = null;
  let best_faculty_daily_hours = null;
  let best_classes = null;
  let bestScore = Infinity;
  let result_combos = null;
  let result_allocations = null;
  let result_unmet_requirements = null;
  let result_warnings = null;
  let lastError = null;
  let bestPartial = null;
  let bestPartialFilled = -1;

  const countFilledSlots = (classTimetables) => {
    if (!classTimetables || typeof classTimetables !== "object") return 0;
    let filled = 0;
    for (const rows of Object.values(classTimetables)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const slot of row) {
          if (slot !== -1 && slot !== "BREAK" && slot !== null && slot !== undefined) {
            filled += 1;
          }
        }
      }
    }
    return filled;
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffledClasses = [...classes];
    const shuffledCombos = [...combos];
    const shuffledFaculties = [...faculties];
    const shuffledSubjects = [...subjects];

    const result = await Generator.generate({
      faculties: shuffledFaculties,
      subjects: shuffledSubjects,
      classes: shuffledClasses,
      combos: shuffledCombos,
      fixed_slots: fixedSlots,
      random_seed: attempt + 1,
      progressCallback: onProgress,
    });

    if (!result.ok) {
      lastError = result.error || "Unknown generator failure";
      const partialFilled = countFilledSlots(result.class_timetables);
      if (partialFilled > bestPartialFilled) {
        bestPartialFilled = partialFilled;
        bestPartial = {
          class_timetables: result.class_timetables || {},
          faculty_timetables: result.faculty_timetables || {},
          classes: result.classes || shuffledClasses,
          combos: shuffledCombos,
          unmet_requirements: result.unmet_requirements || [],
          warnings: result.warnings || [],
        };
      }
      if (process.env.NODE_ENV !== "production") {
        console.log(`Attempt ${attempt + 1}: Failed to generate - ${lastError}`);
      }
      continue;
    }

    const score = Generator.scoreTimetable(
      result.class_timetables,
      classes.map((c) => c._id)
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(`Attempt ${attempt + 1}: Score = ${score}`);
    }

    if (score < bestScore) {
      bestScore = score;
      best_class_timetables = result.class_timetables;
      best_faculty_timetables = result.faculty_timetables;
      best_faculty_daily_hours = result.faculty_daily_hours;
      best_classes = result.classes;
      result_combos = shuffledCombos;
      result_allocations = result.allocations_report;
      result_unmet_requirements = result.unmet_requirements || [];
      result_warnings = result.warnings || [];
    }
  }

  if (process.env.NODE_ENV !== "production") {
    if (best_class_timetables) {
    console.log("Best timetable found. Score:", bestScore);
  } else {
      console.error("Could not generate a valid timetable.", lastError ? `Last error: ${lastError}` : "");
  }
  }

  if (!best_class_timetables && (!bestPartial || bestPartialFilled <= 0)) {
    const fallback = buildGreedyPartial({
      classes,
      combos,
      faculties,
      fixedSlots,
    });
    bestPartial = {
      class_timetables: fallback.class_timetables,
      faculty_timetables: fallback.faculty_timetables,
      classes,
      combos,
      unmet_requirements: fallback.unmet_requirements,
      warnings: [],
    };
  }

  return {
    ok: Boolean(best_class_timetables),
    error: best_class_timetables ? null : (lastError || "Failed to generate timetable"),
    score: best_class_timetables ? bestScore : null,
    class_timetables: best_class_timetables || bestPartial?.class_timetables || null,
    faculty_timetables: best_faculty_timetables || bestPartial?.faculty_timetables || null,
    faculty_daily_hours: best_faculty_daily_hours,
    classes: best_classes || bestPartial?.classes || null,
    combos: result_combos || bestPartial?.combos || null,
    allocations_report: result_allocations,
    unmet_requirements: result_unmet_requirements || bestPartial?.unmet_requirements || [],
    warnings: result_warnings || bestPartial?.warnings || [],
    attemptsTried: attempts,
    // Legacy aliases used in some routes
    bestClassTimetables: best_class_timetables,
    bestFacultyTimetables: best_faculty_timetables,
    bestFacultyDailyHours: best_faculty_daily_hours,
    bestScore: bestScore,
  };
}

export default runGenerate;
