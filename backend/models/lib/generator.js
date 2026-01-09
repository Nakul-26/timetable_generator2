// lib/generator.js
import fs from 'fs';

const DEBUG = false;

function generate({
  faculties,
  subjects,
  classes,
  combos,
  DAYS_PER_WEEK = 6,
  HOURS_PER_DAY = 8,
  BREAK_HOURS = [],
  fixed_slots = [],
  progressCallback,
  stopFlag
}) {
  
  const EMPTY_SLOT = -1;
  const BREAK_SLOT = "BREAK";
  const MAX_ATTEMPTS = 5;

  // --- Data Normalization & Maps ---
  faculties = faculties.map((f) => ({ ...f, _id: String(f._id || f.id) }));
  subjects = subjects.map((s) => ({ ...s, _id: String(s._id || s.id), type: s.type || 'theory' }));
  combos = combos.map((c) => ({
    ...c,
    _id: String(c._id || c.id),
    subject_id: String(c.subject_id),
    class_ids: Array.isArray(c.class_ids) ? c.class_ids.map(String) : [],
    faculty_ids: Array.isArray(c.faculty_ids) ? c.faculty_ids.map(String) : (c.faculty_id ? [String(c.faculty_id)] : []),
  }));
  classes = classes.map((c) => ({ ...c, _id: String(c._id || c.id) }));

  const comboByMongoId = new Map(combos.map((c) => [c._id, c]));
  const facultyById = new Map(faculties.map((f) => [f._id, f]));
  const subjectById = new Map(subjects.map((s) => [s._id, s]));
  const classById = new Map(classes.map((c) => [c._id, c]));
  const fixedMap = new Map();

  // --- Solver State ---
  let class_timetables, faculty_timetables, subject_hours_assigned_per_class, daily_hours_assigned;
  let last_stuck_point = null;

  const MAX_DAYS = Math.max(...classes.map(c => Number(c.days_per_week || DAYS_PER_WEEK)), DAYS_PER_WEEK);
  
  for (const cls of classes) {
    let tot = 0;
    const subjectIds = new Set();
    (cls.assigned_teacher_subject_combos || []).forEach(cbid => {
      const combo = comboByMongoId.get(String(cbid));
      if(combo) subjectIds.add(combo.subject_id);
    });
    for (const subjId of subjectIds) {
      if(subjId) tot += get_required_hours_for_class_subject(cls._id, subjId);
    }
    cls.total_class_hours = tot;
    classById.set(cls._id, cls);
  }
  const classIds = classes.filter((c) => c.total_class_hours > 0).map((c) => c._id);

  console.log("Classes to schedule:", classIds.length);
  console.log("Fixed slots to apply:", fixed_slots.length);

  // --- HELPER FUNCTIONS ---
  
  function get_required_hours_for_class_subject(classId, subjectId) {
    const cls = classById.get(String(classId));
    if (cls && cls.subject_hours && cls.subject_hours[subjectId] != null) return Number(cls.subject_hours[subjectId]) || 0;
    const subj = subjectById.get(String(subjectId));
    return (subj && typeof subj.no_of_hours_per_week === "number") ? subj.no_of_hours_per_week : 0;
  }

  function getFixedSlot(classId, day, hour) {
    return fixedMap.get(`${classId}|${day}|${hour}`) || null;
  }
  
  function check_continuous_hours(faculty_ids, day, hour, blockSize, target_class_id) {
    for (const fid of faculty_ids) {
        const ft = faculty_timetables[fid][day];
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
        if (before + blockSize + after > 2) return false;
    }
    return true;
  }

  function get_class_allocation_report_data(classId) {
    const cls = classById.get(classId);
    if (!cls || !cls.total_class_hours || cls.total_class_hours <= 0) return null;
    const class_report = { className: cls.name, classId: cls._id, subjects: [] };
    const subjectIdsForClass = (cls.assigned_teacher_subject_combos || []).map(cbid => {
      const combo = comboByMongoId.get(String(cbid));
      return combo ? combo.subject_id : null;
    }).filter(id => id);
    for (const subjId of new Set(subjectIdsForClass)) {
      const subj = subjectById.get(subjId);
      if (!subj) continue;
      const required = get_required_hours_for_class_subject(cls._id, subjId);
      const assigned = subject_hours_assigned_per_class[cls._id]?.[subjId] || 0;
      class_report.subjects.push({
        subjectName: subj.name,
        subjectId: subjId,
        requiredHours: required,
        allocatedHours: assigned,
        status: required === assigned ? '✅' : `❌ (needs ${required - assigned > 0 ? '+' : ''}${required - assigned}h)`
      });
    }
    return class_report;
  }

  function all_subjects_exactly_assigned() {
    for (const cls of classes) {
      const classId = cls._id;
      const subjSet = new Set();
      for (const cbid of cls.assigned_teacher_subject_combos || []) {
        const combo = comboByMongoId.get(String(cbid));
        if (!combo) continue;
        const subjId = combo.subject_id;
        if (subjSet.has(subjId)) continue;
        subjSet.add(subjId);
        const required = get_required_hours_for_class_subject(classId, subjId);
        const assigned = subject_hours_assigned_per_class[classId]?.[subjId] || 0;
        if (Math.abs(required - assigned) > 1) { // Allowing +/- 1 hour deviation
          if (DEBUG) console.log(`Exactness ±1 failed for class ${classId}, subject ${subjId}: required ${required}, assigned ${assigned}`);
          return false;
        }
      }
    }
    // Faculty daily hours constraint
    for (const f of faculties) {
        const ft = faculty_timetables[f._id];
        for (let d = 0; d < ft.length; d++) {
            const hours = ft[d].filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length;
            if (hours > 0 && hours !== 4) { // Teachers must have 0 or exactly 4 hours (This is a simplified example, usually there are max/min hours)
                if (DEBUG) console.log(`❌ Faculty ${f.name} (ID: ${f._id}) has ${hours} hours on Day ${d + 1}. Expected 0 or 4.`);
                return false;
            }
        }
    }
    return true;
  }

  function get_candidates_for_class(classId) {
    const cls = classById.get(classId);
    const list = [];
    if (!cls || !cls.assigned_teacher_subject_combos) return list;
  
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const combo = comboByMongoId.get(String(cbid));
      if (!combo) continue;
      const subj = subjectById.get(combo.subject_id);
      if (!subj) continue;
      const required = get_required_hours_for_class_subject(classId, subj._id);
      const assigned = subject_hours_assigned_per_class[classId]?.[subj._id] || 0;
      if(assigned >= required) continue;
      const blockSize = subj.type === 'lab' ? 2 : 1;
      list.push({ combo, subj, blockSize });
    }
    
    list.sort((a, b) => {
        const remA = get_required_hours_for_class_subject(classId, a.subj._id) - (subject_hours_assigned_per_class[classId][a.subj._id] || 0);
        const remB = get_required_hours_for_class_subject(classId, b.subj._id) - (subject_hours_assigned_per_class[classId][b.subj._id] || 0);
        return remA - remB;
    });
    return list;
  }

  function is_placement_valid(classId, day, hour, combo_id, blockSize = 1) {
    const combo = comboByMongoId.get(String(combo_id));
    if (!combo) return false;
    
    const fixed = getFixedSlot(classId, day, hour);
    if (fixed && fixed.comboId !== combo_id) return false;

    for (let h = hour; h < hour + blockSize; h++) {
        // Check if hour is within day bounds and not a BREAK_HOUR
        if (h >= HOURS_PER_DAY || BREAK_HOURS.includes(h)) return false;
        // Check if class slot is already taken by a non-fixed slot
        if (class_timetables[classId][day]?.[h] !== EMPTY_SLOT && !getFixedSlot(classId, day, h)) return false;
        // Check faculty availability
        for (const facultyId of combo.faculty_ids) {
            if (!faculty_timetables[facultyId] || (faculty_timetables[facultyId][day]?.[h] !== EMPTY_SLOT && !getFixedSlot(classId, day, h))) return false;
        }
    }
    
    // Check subject hours
    const required = get_required_hours_for_class_subject(classId, combo.subject_id);
    const assigned = subject_hours_assigned_per_class[classId]?.[combo.subject_id] || 0;
    if (assigned + blockSize > required) return false;

    // Additional constraints (re-integrated from old solver)
    if (!check_continuous_hours(combo.faculty_ids, day, hour, blockSize, classId)) return false;
    
    return true;
  }
  
  function apply_slot(classId, day, hour, combo_id, blockSize = 1) {
    const combo = comboByMongoId.get(combo_id);
    const subj = subjectById.get(combo.subject_id);
    for(let h = hour; h < hour + blockSize; h++) {
      class_timetables[classId][day][h] = combo_id;
      if(!subject_hours_assigned_per_class[classId][subj._id]) subject_hours_assigned_per_class[classId][subj._id] = 0;
      subject_hours_assigned_per_class[classId][subj._id]++;
      daily_hours_assigned[classId][day]++;
      for (const facultyId of combo.faculty_ids) {
        if(faculty_timetables[facultyId]) faculty_timetables[facultyId][day][h] = combo_id;
      }
    }
  }

  function undo_slot(classId, day, hour, combo_id, blockSize = 1) { // combo_id and blockSize needed for correct undo
    if (getFixedSlot(classId, day, hour)) return; // Never undo a fixed slot

    const combo = comboByMongoId.get(combo_id);
    if(!combo) return;
    const subj = subjectById.get(combo.subject_id);
    if(!subj) return;
    
    let startHour = hour;
    while(startHour > 0 && class_timetables[classId][day][startHour - 1] === combo_id) startHour--;

    for (let h = startHour; h < startHour + blockSize; h++) {
        if(h >= HOURS_PER_DAY || class_timetables[classId][day][h] !== combo_id) continue;
        class_timetables[classId][day][h] = EMPTY_SLOT;
        subject_hours_assigned_per_class[classId][subj._id]--;
        daily_hours_assigned[classId][day]--;
        for (const facultyId of combo.faculty_ids) {
            if(faculty_timetables[facultyId]) faculty_timetables[facultyId][day][h] = EMPTY_SLOT;
        }
    }
  }
  
  function apply_fixed_slots() {
    fixedMap.clear();
    (fixed_slots || []).forEach(slot => {
      const { class: classId, day, hour, combo: comboId } = slot;
      const combo = comboByMongoId.get(String(comboId));
      if (!combo || !class_timetables[classId]) return;
      const subj = subjectById.get(combo.subject_id);
      const blockSize = subj.type === 'lab' ? 2 : 1;
      
      if (hour + blockSize > HOURS_PER_DAY) {
        console.error(`Invalid fixed slot for class ${classId} day ${day} hour ${hour}: block exceeds day length.`);
        return;
      }
      
      // Fixed slots are applied without validation
      apply_slot(classId, day, hour, comboId, blockSize);
      for (let h = hour; h < hour + blockSize; h++) {
        fixedMap.set(`${classId}|${day}|${h}`, { comboId });
      }
    });
  }

  function reset_solver_state() {
    class_timetables = {}; faculty_timetables = {};
    subject_hours_assigned_per_class = {}; daily_hours_assigned = {};
    last_stuck_point = null;
  
    for (const cls of classes) {
      const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
      class_timetables[cls._id] = Array.from({ length: daysPerWeek }, () => Array.from({ length: HOURS_PER_DAY }, (_, h) => BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT));
      subject_hours_assigned_per_class[cls._id] = {};
      daily_hours_assigned[cls._id] = Array.from({ length: daysPerWeek }, () => 0);
      for (const s of subjects) {
        subject_hours_assigned_per_class[cls._id][s._id] = 0;
      }
    }
    for (const f of faculties) {
      faculty_timetables[f._id] = Array.from({ length: MAX_DAYS }, () => Array.from({ length: HOURS_PER_DAY }, (_, h) => BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT));
    }
    apply_fixed_slots(); // Enabled by default now
  }
  
  function total_remaining_required_hours() {
    let total = 0;
    for (const classId of classIds) {
      total += total_remaining_required_hours_for_class(classId);
    }
    return total;
  }
  
  function get_class_order_for_slot(day, hour) {
    return classIds.slice().sort((a, b) => {
        const remA = total_remaining_required_hours_for_class(a);
        const remB = total_remaining_required_hours_for_class(b);
        return remB - remA; // More remaining hours first
    });
  }

  function total_remaining_required_hours_for_class(classId){
    let total = 0;
    const cls = classById.get(classId);
    if(!cls) return 0;
    const assigned_combos_for_class = cls.assigned_teacher_subject_combos || [];
    const subjects_in_class = new Set(assigned_combos_for_class.map(cbid => comboByMongoId.get(String(cbid))?.subject_id).filter(Boolean));

    for(const subjId of subjects_in_class) {
        const required = get_required_hours_for_class_subject(classId, subjId);
        const assigned = subject_hours_assigned_per_class[classId]?.[subjId] || 0;
        if (required > assigned) total += required - assigned;
    }
    return total;
  }
  
  function iterative_schedule() {
    if (classIds.length === 0) return true;

    const stack = [];
    
    // Initial Frame
    let day = 0, hour = 0;
    while(day < MAX_DAYS) {
      if (!BREAK_HOURS.includes(hour) && !getFixedSlot(classIds[0], day, hour)) {
        const classOrder = get_class_order_for_slot(day, hour);
        if(classOrder.length > 0) {
          const classId = classOrder[0];
          stack.push({
              day, hour, classId, classOrder, classIndex: 0,
              candidates: get_candidates_for_class(classId), candidateIndex: -1
          });
          break;
        }
      }
      hour++;
      if(hour >= HOURS_PER_DAY) {
          hour = 0;
          day++;
      }
    }

    if (stack.length === 0) return total_remaining_required_hours() === 0;

    while (stack.length > 0) {
      if (stopFlag && stopFlag.is_set) return false;

      let frame = stack[stack.length - 1];
      
      // Backtrack
      if (frame.candidateIndex > -1) {
        const last_candidate = frame.candidates[frame.candidateIndex];
        undo_slot(frame.classId, frame.day, frame.hour);
      }

      // Find next valid candidate
      let found_move = false;
      for (let i = frame.candidateIndex + 1; i < frame.candidates.length; i++) {
        const candidate = frame.candidates[i];
        if (is_placement_valid(frame.classId, frame.day, frame.hour, candidate.combo._id, candidate.blockSize)) {
          apply_slot(frame.classId, frame.day, frame.hour, candidate.combo._id, candidate.blockSize);
          frame.candidateIndex = i;
          found_move = true;
          break;
        }
      }

      if (found_move) {
        // Move to next state
        let nextDay = frame.day, nextHour = frame.hour;
        let nextFramePushed = false;
        while(nextDay < MAX_DAYS) {
          nextHour++;
          if (nextHour >= HOURS_PER_DAY) {
            nextHour = 0;
            nextDay++;
          }
          if (nextDay >= MAX_DAYS) break;

          if (!BREAK_HOURS.includes(nextHour) && !getFixedSlot(classIds[0], nextDay, nextHour)) {
            const nextClassOrder = get_class_order_for_slot(nextDay, nextHour);
            if(nextClassOrder.length > 0) {
              const nextClassId = nextClassOrder[0];
              stack.push({
                  day: nextDay, hour: nextHour, classId: nextClassId, classOrder: nextClassOrder, classIndex: 0,
                  candidates: get_candidates_for_class(nextClassId), candidateIndex: -1
              });
              nextFramePushed = true;
              break;
            }
          }
        }
        if (!nextFramePushed) return all_subjects_exactly_assigned();
      } else {
        last_stuck_point = { day: frame.day, hour: frame.hour, classId: frame.classId };
        stack.pop();
      }
    }
    
    return total_remaining_required_hours() === 0;
  }
  
  // Main Execution Loop
  let attempts = 0;
  while(attempts < MAX_ATTEMPTS) {
    reset_solver_state();
    const ok = iterative_schedule();
    if (ok) {
        const allocations_report = {};
        for (const cls of classes) {
            if (cls.total_class_hours > 0) {
                const report = get_class_allocation_report_data(cls._id);
                if (report) allocations_report[cls._id] = report;
            }
        }
        const faculty_daily_hours = {};
        for (const f of faculties) {
            faculty_daily_hours[f._id] = faculty_timetables[f._id].map((row) =>
                row.filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length
            );
        }

        return {
            ok: true,
            class_timetables,
            faculty_timetables,
            combos,
            allocations_report,
            faculty_daily_hours,
        };
    }
    console.log(`--- Attempt ${attempts + 1} failed. Last stuck point:`, last_stuck_point);
    attempts++;
    if(stopFlag && stopFlag.is_set) break;
  }
  
  return { ok: false, error: "Failed to generate timetable after multiple attempts." };
}

function printTimetable(classId, timetable, classById) {}
function scoreTimetable(class_timetables, classIds) { return 0; }
function shuffle(array) {}

export default { generate, printTimetable, scoreTimetable, shuffle };
