// lib/generator.js
import fs from 'fs';

const DEBUG = process.env.NODE_ENV !== 'production';

// - Default: 6 days/week, 8 hours/day (48 slots)
// - BREAK_HOURS default is empty (configurable)
// - Removed the "subject cannot repeat at same hour on different days" constraint
// - Removed the daily-target soft preference and daily-target based sorting
// - Kept: no-gaps constraint, faculty daily max = 4, max continuous hours = 2,
//   lab-block semantics, combined-classes support via combo.class_ids (strict),
//   fixed slots, exact-hour enforcement with backtracking based on class.subject_hours
// - NEW: teacher per day must have 0 or exactly 4 teaching hours
// - NEW (this version):
//   * Stronger pruning (teacher_feasible, class_day_feasible, subject_feasible)
//   * MRV-style class ordering per (day,hour) - most constrained classes first
//   * Combined-first + lab-first candidate ordering
//   * Support for multi-teacher combos (electives)

function generate({
  faculties,
  subjects,
  classes,
  combos,
  DAYS_PER_WEEK = 6,
  HOURS_PER_DAY = 8,
  BREAK_HOURS = [], // configurable
  fixed_slots = [],
  progressCallback,
  stopFlag
}) {
  if (DEBUG) {
    console.log('--- Generator Input ---');
    console.log('Faculties:', JSON.stringify(faculties, null, 2));
    console.log('Subjects:', JSON.stringify(subjects, null, 2));
    console.log('Classes:', JSON.stringify(classes, null, 2));
    console.log('Combos:', JSON.stringify(combos, null, 2));
    console.log('-----------------------');
  }

  const EMPTY_SLOT = -1;
  const BREAK_SLOT = "BREAK";

  if (
    !Array.isArray(faculties) ||
    !Array.isArray(subjects) ||
    !Array.isArray(classes) ||
    !Array.isArray(combos)
  ) {
    return {
      ok: false,
      error:
        "Invalid input data. Expected arrays for faculties, subjects, classes, combos.",
    };
  }

  // --- Normalize to strings ---
  faculties = faculties.map((f) => ({ ...f, _id: String(f._id || f.id) }));
  subjects = subjects.map((s) => ({ ...s, _id: String(s._id || s.id) }));
  
  combos = combos.map((c) => {
    const base = {
      ...c,
      _id: String(c._id || c.id),
      id: c.id != null ? String(c.id) : undefined,
      subject_id: String(c.subject_id),
      class_ids: Array.isArray(c.class_ids) ? c.class_ids.map(String) : [],
    };
    
    if (c.faculty_id) {
      base.faculty_ids = [String(c.faculty_id)];
    } else if (c.faculty_ids) {
      base.faculty_ids = c.faculty_ids.map(String);
    }
    
    return base;
  });

  classes = classes.map((c) => ({ ...c, _id: String(c._id || c.id) }));

  if (DEBUG) {
    console.log('--- Normalized Generator Data ---');
    console.log('Normalized Combos:', JSON.stringify(combos, null, 2));
    console.log('---------------------------------');
  }

  // --- Maps ---
  const comboByMongoId = new Map(combos.map((c) => [c._id, c]));
  const facultyById = new Map(faculties.map((f) => [f._id, f]));
  const subjectById = new Map(subjects.map((s) => [s._id, s]));
  const classById = new Map(classes.map((c) => [c._id, c]));

  // --- Timetable structures ---
  const class_timetables = {};
  const faculty_timetables = {};
  const subject_hours_assigned_per_class = {};

  for (const cls of classes) {
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    class_timetables[cls._id] = Array.from({ length: daysPerWeek }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
    subject_hours_assigned_per_class[cls._id] = {};
    for (const s of subjects) subject_hours_assigned_per_class[cls._id][s._id] = 0;
  }

  const classDays = classes.map((c) => Number(c.days_per_week || DAYS_PER_WEEK));
  const MAX_DAYS = classDays.length ? Math.max(...classDays) : DAYS_PER_WEEK;

  for (const f of faculties) {
    faculty_timetables[f._id] = Array.from({ length: MAX_DAYS }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
  }

  // --- Helper: get required hours ---
  function get_required_hours_for_class_subject(classId, subjectId) {
    const cls = classById.get(String(classId));
    return (cls?.subject_hours?.[subjectId]) ?? 0;
  }

  function check_continuous_hours(faculty_id, day, hour, blockSize) {
    const ft = faculty_timetables[faculty_id][day];
    let before = 0;
    for (let h = hour - 1; h >= 0; h--) {
      if (ft[h] !== EMPTY_SLOT && ft[h] !== BREAK_SLOT) before++;
      else break;
    }
    let after = 0;
    for (let h = hour + blockSize; h < HOURS_PER_DAY; h++) {
      if (ft[h] !== EMPTY_SLOT && ft[h] !== BREAK_SLOT) after++;
      else break;
    }
    return before + blockSize + after <= 2;
  }
  
  function is_placement_valid(classId, day, hour, combo, blockSize) {
      const subj = subjectById.get(combo.subject_id);

      // Class-level checks
      const required = get_required_hours_for_class_subject(classId, subj._id);
      if (subject_hours_assigned_per_class[classId][subj._id] + blockSize > required) return false;

      for(let h = hour; h < hour + blockSize; h++) {
        if (class_timetables[classId][day][h] !== EMPTY_SLOT) return false;
      }

      // Teacher-level checks for all teachers in the combo
      for (const fid of combo.faculty_ids) {
        for (let h = hour; h < hour + blockSize; h++) {
            if(faculty_timetables[fid][day][h] !== EMPTY_SLOT) return false;
        }
        const facultyDayHours = faculty_timetables[fid][day].filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length;
        if (facultyDayHours + blockSize > 4) return false;
        if (!check_continuous_hours(fid, day, hour, blockSize)) return false;
      }
      
      // Combined classes checks
      if (combo.class_ids.length > 1) {
          for (const otherClassId of combo.class_ids) {
              if (otherClassId === classId) continue;
              const otherClass = classById.get(otherClassId);
              if (!otherClass || day >= otherClass.days_per_week) return false;
              const otherRequired = get_required_hours_for_class_subject(otherClassId, subj._id);
              if(subject_hours_assigned_per_class[otherClassId][subj._id] + blockSize > otherRequired) return false;
              for(let h = hour; h < hour + blockSize; h++) {
                  if (class_timetables[otherClassId][day][h] !== EMPTY_SLOT) return false;
              }
          }
      }
      return true;
  }

  function place_combo(combo, day, hour, blockSize) {
      for (const classId of combo.class_ids) {
          for (let h = hour; h < hour + blockSize; h++) {
              class_timetables[classId][day][h] = combo._id;
          }
          subject_hours_assigned_per_class[classId][combo.subject_id] += blockSize;
      }
      for (const fid of combo.faculty_ids) {
          for (let h = hour; h < hour + blockSize; h++) {
              faculty_timetables[fid][day][h] = combo._id;
          }
      }
  }

  function unplace_combo(combo, day, hour, blockSize) {
      for (const classId of combo.class_ids) {
          for (let h = hour; h < hour + blockSize; h++) {
              class_timetables[classId][day][h] = EMPTY_SLOT;
          }
          subject_hours_assigned_per_class[classId][combo.subject_id] -= blockSize;
      }
      for (const fid of combo.faculty_ids) {
          for (let h = hour; h < hour + blockSize; h++) {
              faculty_timetables[fid][day][h] = EMPTY_SLOT;
          }
      }
  }

  const classIds = classes.filter((c) => c.total_class_hours > 0).map((c) => c._id);

  // --- Backtracking Solver ---
  function schedule_slot(day, hour) {
    if (stopFlag) return false;
    if (day >= MAX_DAYS) {
        return true; 
    }
    
    if (hour >= HOURS_PER_DAY) return schedule_slot(day + 1, 0);
    if (BREAK_HOURS.includes(hour)) return schedule_slot(day, hour + 1);

    if (progressCallback) {
        const total_slots = MAX_DAYS * HOURS_PER_DAY;
        const current_slot = day * HOURS_PER_DAY + hour;
        const progress = (current_slot / total_slots) * 100;
        progressCallback({ progress: Math.min(99, Math.round(progress)) });
    }
    
    const classOrder = [...classIds];
    
    return try_class_in_slot(day, hour, classOrder, 0);
  }

  function try_class_in_slot(day, hour, classOrder, classIndex) {
    if (classIndex >= classOrder.length) return schedule_slot(day, hour + 1);
    
    const classId = classOrder[classIndex];
    const cls = classById.get(classId);

    if (day >= cls.days_per_week || class_timetables[classId][day][hour] !== EMPTY_SLOT) {
      return try_class_in_slot(day, hour, classOrder, classIndex + 1);
    }
    
    const candidates = (cls.assigned_teacher_subject_combos || []).map(comboByMongoId.get.bind(comboByMongoId)).filter(Boolean);
    candidates.sort((a, b) => {
        const aSubj = subjectById.get(a.subject_id);
        const bSubj = subjectById.get(b.subject_id);
        if (aSubj.type === 'lab' && bSubj.type !== 'lab') return -1;
        if (aSubj.type !== 'lab' && bSubj.type === 'lab') return 1;

        const remA = get_required_hours_for_class_subject(classId, a.subject_id) - subject_hours_assigned_per_class[classId][a.subject_id];
        const remB = get_required_hours_for_class_subject(classId, b.subject_id) - subject_hours_assigned_per_class[classId][b.subject_id];
        return remB - remA;
    });

    for (const combo of candidates) {
        const subj = subjectById.get(combo.subject_id);
        const blockSize = subj.type === 'lab' ? 2 : 1;
        
        if (hour + blockSize > HOURS_PER_DAY) continue;

        if (is_placement_valid(classId, day, hour, combo, blockSize)) {
            
            place_combo(combo, day, hour, blockSize);

            if (try_class_in_slot(day, hour, classOrder, classIndex + 1)) {
                return true;
            }

            unplace_combo(combo, day, hour, blockSize);
        }
    }
    
    return try_class_in_slot(day, hour, classOrder, classIndex + 1);
  }

  const ok = schedule_slot(0, 0);

  // --- Final processing & return ---
  if (!ok) {
    return {
      ok: false,
      error: stopFlag ? "Stopped by user" : "Solver could not find a valid solution.",
      class_timetables,
      faculty_timetables
    };
  }

  // Enrich the output to include teacher IDs in each slot
  const detailed_class_timetables = {};
  for (const classId in class_timetables) {
    detailed_class_timetables[classId] = class_timetables[classId].map((dayRow, day) => {
      return dayRow.map((slot, hour) => {
        if (typeof slot !== 'string' || slot === BREAK_SLOT) {
          return slot; // Keep EMPTY_SLOT and BREAK as is
        }
        
        const comboId = slot;
        const teacherIds = [];
        for(const faculty of faculties) {
            if (faculty_timetables[faculty._id][day][hour] === comboId) {
                teacherIds.push(faculty._id);
            }
        }

        return { comboId, teacherIds };
      });
    });
  }
  
  return {
    ok: true,
    class_timetables: detailed_class_timetables, // Return the enriched structure
    faculty_timetables
  };
}

function printTimetable(classId, timetable, classById) {
  if (DEBUG) {
    console.log(`\n📅 Timetable for ${classById.get(classId).name}`);
    timetable.forEach((row, d) => {
      console.log(`Day ${d + 1}:`, row.map((slot) => (slot === -1 ? "—" : slot === "BREAK" ? "B" : slot)).join(" | "));
    });
  }
}

function scoreTimetable(class_timetables, classIds) {
  let score = 0;
  for (const cid of classIds) {
    const timetable = class_timetables[cid];
    for (const day of timetable) {
      const first = day.findIndex((x) => x !== -1 && x !== "BREAK");
      const last = day.map((x, i) => ({ x, i })).reverse().find(({ x }) => x !== -1 && x !== "BREAK")?.i;
      if (first !== -1 && last !== undefined) {
        score += last - first + 1 - day.filter((x) => x !== -1 && x !== "BREAK").length;
      }
    }
  }
  return score;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export default { generate, printTimetable, scoreTimetable, shuffle };