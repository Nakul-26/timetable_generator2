// lib/generator.js
// SLOT-DRIVEN BACKTRACKING + HARD CONSTRAINTS + SOFT CONSTRAINTS + MRV + PROGRESS
// Goal: maximize completion rate (practically 100% for feasible inputs)

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
  const EMPTY = -1;
  const BREAK = "BREAK";

  // ---------------- NORMALIZE ----------------
  faculties = faculties.map(f => ({ ...f, _id: String(f._id || f.id) }));
  subjects = subjects.map(s => ({
    ...s,
    _id: String(s._id || s.id),
    type: s.type || "theory"
  }));
  combos = combos.map(c => ({
    ...c,
    _id: String(c._id || c.id),
    subject_id: String(c.subject_id),
    faculty_ids: c.faculty_ids
      ? c.faculty_ids.map(String)
      : c.faculty_id
      ? [String(c.faculty_id)]
      : [],
    class_ids: (c.class_ids || []).map(String)
  }));
  classes = classes.map(c => ({ ...c, _id: String(c._id || c.id) }));

  const comboById = new Map(combos.map(c => [c._id, c]));
  const subjectById = new Map(subjects.map(s => [s._id, s]));
  const classById = new Map(classes.map(c => [c._id, c]));

  // ---------------- STATE ----------------
  const classTT = {};
  const facultyTT = {};
  const subjectHours = {};
  const fixedMap = new Map();

  const MAX_DAYS = Math.max(
    ...classes.map(c => Number(c.days_per_week || DAYS_PER_WEEK))
  );

  for (const cls of classes) {
    const days = Number(cls.days_per_week || DAYS_PER_WEEK);
    classTT[cls._id] = Array.from({ length: days }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK : EMPTY
      )
    );
    subjectHours[cls._id] = {};
  }

  for (const f of faculties) {
    facultyTT[f._id] = Array.from({ length: MAX_DAYS }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK : EMPTY
      )
    );
  }

  // ---------------- REQUIRED HOURS ----------------
  function requiredHours(classId, subjectId) {
    const cls = classById.get(classId);
    if (cls?.subject_hours?.[subjectId] != null) {
      return Number(cls.subject_hours[subjectId]);
    }
    return subjectById.get(subjectId)?.no_of_hours_per_week || 0;
  }

  // ---------------- FIXED SLOTS ----------------
  for (const fs of fixed_slots || []) {
    const { class: classId, day, hour, combo: comboId } = fs;
    const combo = comboById.get(String(comboId));
    if (!combo) continue;
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = combo._id;
      for (const fid of combo.faculty_ids) {
        facultyTT[fid][day][h] = combo._id;
      }
      fixedMap.set(`${classId}|${day}|${h}`, combo._id);
    }
    subjectHours[classId][subj._id] =
      (subjectHours[classId][subj._id] || 0) + block;
  }

  // ---------------- HARD CONSTRAINT HELPERS ----------------
  function teacherContinuous(fid, day, hour, block) {
    let before = 0;
    for (let h = hour - 1; h >= 0; h--) {
      if (facultyTT[fid][day][h] !== EMPTY && facultyTT[fid][day][h] !== BREAK)
        before++;
      else break;
    }
    let after = 0;
    for (let h = hour + block; h < HOURS_PER_DAY; h++) {
      if (facultyTT[fid][day][h] !== EMPTY && facultyTT[fid][day][h] !== BREAK)
        after++;
      else break;
    }
    return before + block + after <= 2;
  }

  function canPlace(classId, day, hour, comboId) {
    if (fixedMap.has(`${classId}|${day}|${hour}`)) return false;

    const combo = comboById.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    if (hour + block > HOURS_PER_DAY) return false;

    for (let h = hour; h < hour + block; h++) {
      if (BREAK_HOURS.includes(h)) return false;
      if (classTT[classId][day][h] !== EMPTY) return false;

      for (const fid of combo.faculty_ids) {
        if (facultyTT[fid][day][h] !== EMPTY) return false;
        if (!teacherContinuous(fid, day, h, block)) return false;
      }
    }

    const used = subjectHours[classId][subj._id] || 0;
    if (used + block > requiredHours(classId, subj._id)) return false;

    return true;
  }

  function place(classId, day, hour, comboId) {
    const combo = comboById.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = comboId;
      for (const fid of combo.faculty_ids) {
        facultyTT[fid][day][h] = comboId;
      }
    }
    subjectHours[classId][subj._id] =
      (subjectHours[classId][subj._id] || 0) + block;
  }

  function unplace(classId, day, hour, comboId) {
    if (fixedMap.has(`${classId}|${day}|${hour}`)) return;

    const combo = comboById.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    const block = subj.type === "lab" ? 2 : 1;

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = EMPTY;
      for (const fid of combo.faculty_ids) {
        facultyTT[fid][day][h] = EMPTY;
      }
    }
    subjectHours[classId][subj._id] -= block;
  }

  function completionRatio() {
    let required = 0;
    let assigned = 0;
  
    for (const cls of classes) {
      for (const subj of subjects) {
        const req = requiredHours(cls._id, subj._id);
        if (req > 0) {
          required += req;
          assigned += Math.min(
            subjectHours[cls._id][subj._id] || 0,
            req
          );
        }
      }
    }
    return required === 0 ? 1 : assigned / required;
  }

  function placeElectivesFirst() {
    const electiveCombos = combos.filter(
      c => Array.isArray(c.class_ids) && c.class_ids.length > 1
    );

    for (const combo of electiveCombos) {
      const subj = subjectById.get(combo.subject_id);
      const block = subj.type === "lab" ? 2 : 1;
      const hoursNeeded = requiredHours(combo.class_ids[0], combo.subject_id);
      let hoursPlaced = 0;

      while (hoursPlaced < hoursNeeded) {
        let placed = false;
        for (let day = 0; day < MAX_DAYS && !placed; day++) {
          for (let hour = 0; hour < HOURS_PER_DAY && !placed; hour++) {
            if (hour + block > HOURS_PER_DAY) continue;

            let ok = true;
            for (let k = 0; k < block; k++) {
              if (BREAK_HOURS.includes(hour + k)) {
                ok = false;
                break;
              }
              for (const classId of combo.class_ids) {
                const cls = classById.get(classId);
                if (day >= (cls.days_per_week || DAYS_PER_WEEK) || classTT[classId][day][hour + k] !== EMPTY) {
                  ok = false;
                  break;
                }
              }
              if (!ok) break;

              for (const fid of combo.faculty_ids) {
                if (facultyTT[fid][day][hour + k] !== EMPTY) {
                  ok = false;
                  break;
                }
              }
              if (!ok) break;
            }

            if (!ok) continue;

            // PLACE ELECTIVE
            for (let k = 0; k < block; k++) {
              for (const classId of combo.class_ids) {
                classTT[classId][day][hour + k] = combo._id;
              }
              for (const fid of combo.faculty_ids) {
                facultyTT[fid][day][hour + k] = combo._id;
              }
            }
            for (const classId of combo.class_ids) {
                subjectHours[classId][combo.subject_id] = (subjectHours[classId][combo.subject_id] || 0) + block;
            }

            placed = true;
            hoursPlaced += block;
            if (block > 1) hour++;
          }
        }

        if (!placed) {
          return false; // infeasible input
        }
      }
    }
    return true;
  }


  // ---------------- REPAIR PHASE FUNCTIONS ----------------
  function repairFillEmptySlots() {
    let repaired = false;

    for (const cls of classes) {
      const classId = cls._id;
      const days = classTT[classId].length;

      for (let d = 0; d < days; d++) {
        for (let h = 0; h < HOURS_PER_DAY; h++) {
          if (BREAK_HOURS.includes(h)) continue;
          if (classTT[classId][d][h] !== EMPTY) continue;

          for (const cbid of cls.assigned_teacher_subject_combos || []) {
            const combo = comboById.get(cbid);
            if (!combo) continue;

            const subj = subjectById.get(combo.subject_id);
            const block = subj.type === "lab" ? 2 : 1;

            if (h + block > HOURS_PER_DAY) continue;

            const used = subjectHours[classId][subj._id] || 0;
            const req = requiredHours(classId, subj._id);
            if (used + block > req) continue;

            let ok = true;
            for (let k = 0; k < block; k++) {
              if (classTT[classId][d][h + k] !== EMPTY) {
                ok = false;
                break;
              }
              for (const fid of combo.faculty_ids) {
                if (facultyTT[fid][d][h + k] !== EMPTY) {
                  ok = false;
                  break;
                }
              }
              if (!ok) break;
            }
            if (!ok) continue;

            // FORCE PLACE
            for (let k = 0; k < block; k++) {
              classTT[classId][d][h + k] = combo._id;
              for (const fid of combo.faculty_ids) {
                facultyTT[fid][d][h + k] = combo._id;
              }
            }
            subjectHours[classId][subj._id] = used + block;
            repaired = true;
            break; 
          }
        }
      }
    }
    return repaired;
  }

  function repairSwap() {
    let repaired = false;

    for (const cls of classes) {
      const classId = cls._id;

      for (const subj of subjects) {
        const need =
          requiredHours(classId, subj._id) -
          (subjectHours[classId][subj._id] || 0);

        if (need <= 0) continue;
        
        const newSubj = subjectById.get(subj._id);
        if (newSubj.type === 'lab') continue; // Only swap theory for now

        // find a slot with an overfilled theory subject
        for (let d = 0; d < classTT[classId].length; d++) {
          for (let h = 0; h < HOURS_PER_DAY; h++) {
            const cid = classTT[classId][d][h];
            if (cid === EMPTY || cid === BREAK) continue;

            const oldCombo = comboById.get(cid);
            if (!oldCombo) continue;
            
            const oldSubj = subjectById.get(oldCombo.subject_id);
            if (oldSubj.type === 'lab') continue;

            if (
              (subjectHours[classId][oldSubj._id] || 0) <=
              requiredHours(classId, oldSubj._id)
            )
              continue;

            // try replacing
            for (const cbid of cls.assigned_teacher_subject_combos || []) {
              const newCombo = comboById.get(cbid);
              if (!newCombo || newCombo.subject_id !== subj._id) continue;

              let ok = true;
              for (const fid of newCombo.faculty_ids) {
                if (
                  facultyTT[fid][d][h] !== EMPTY &&
                  facultyTT[fid][d][h] !== cid
                ) {
                  ok = false;
                  break;
                }
              }
              if (!ok) continue;

              // SWAP
              classTT[classId][d][h] = newCombo._id;
              for (const fid of oldCombo.faculty_ids)
                facultyTT[fid][d][h] = EMPTY;
              for (const fid of newCombo.faculty_ids)
                facultyTT[fid][d][h] = newCombo._id;

              subjectHours[classId][oldSubj._id]--;
              subjectHours[classId][subj._id]++;
              repaired = true;
              break;
            }
            if(repaired) break;
          }
          if(repaired) break;
        }
        if(repaired) break;
      }
      if(repaired) continue;
    }
    return repaired;
  }

  function repairForcePlace() {
    let repaired = false;

    for (const cls of classes) {
      const classId = cls._id;

      for (const subj of subjects) {
        let need =
          requiredHours(classId, subj._id) -
          (subjectHours[classId][subj._id] || 0);

        if (need <= 0) continue;

        const subjectData = subjectById.get(subj._id);
        const block = subjectData.type === 'lab' ? 2 : 1;

        if(need < block) continue;

        for (let d = 0; d < classTT[classId].length && need >= block; d++) {
          for (let h = 0; h < HOURS_PER_DAY && need >= block; h++) {
            if (h + block > HOURS_PER_DAY) continue;
            
            let canPlace = true;
            for(let k=0; k<block; k++){
                if (BREAK_HOURS.includes(h+k) || classTT[classId][d][h+k] !== EMPTY) {
                    canPlace = false;
                    break;
                }
            }

            if(!canPlace) continue;

            for (const cbid of cls.assigned_teacher_subject_combos || []) {
              const combo = comboById.get(cbid);
              if (!combo || combo.subject_id !== subj._id) continue;

              let ok = true;
              for(let k=0; k<block; k++){
                  for (const fid of combo.faculty_ids) {
                    if (facultyTT[fid][d][h+k] !== EMPTY) {
                      ok = false;
                      break;
                    }
                  }
                  if(!ok) break;
              }
              if (!ok) continue;

              for(let k=0; k<block; k++){
                classTT[classId][d][h+k] = combo._id;
                for (const fid of combo.faculty_ids)
                  facultyTT[fid][d][h+k] = combo._id;
              }

              subjectHours[classId][subj._id] = (subjectHours[classId][subj._id] || 0) + block;
              need -= block;
              repaired = true;
              if (block > 1) h++;
              break;
            }
          }
        }
      }
    }
    return repaired;
  }
  // ---------------- END REPAIR PHASE FUNCTIONS ----------------

  function destroyOneSlot(classId) {
    for (let d = classTT[classId].length - 1; d >= 0; d--) {
      for (let h = HOURS_PER_DAY - 1; h >= 0; h--) {
        const cid = classTT[classId][d][h];
        if (cid !== EMPTY && cid !== BREAK && !fixedMap.has(`${classId}|${d}|${h}`)) {
          unplace(classId, d, h, cid);
          return true;
        }
      }
    }
    return false;
  }

  // ---------------- SOFT HEURISTICS ----------------
  function subjectDayCount(classId, day, subjectId) {
    let c = 0;
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const cid = classTT[classId][day][h];
      if (cid !== EMPTY && cid !== BREAK) {
        if (comboById.get(cid)?.subject_id === subjectId) c++;
      }
    }
    return c;
  }

  // ---------------- MRV CLASS ORDER ----------------
  const classIds = classes.map(c => c._id);

  function remainingForClass(classId) {
    let total = 0;
    for (const subj of subjects) {
      const req = requiredHours(classId, subj._id);
      const used = subjectHours[classId][subj._id] || 0;
      if (req > used) total += req - used;
    }
    return total;
  }

  function freeSlotsForClass(classId, day, hour) {
    const table = classTT[classId];
    let free = 0;
    for (let d = day; d < table.length; d++) {
      const hs = d === day ? hour : 0;
      for (let h = hs; h < HOURS_PER_DAY; h++) {
        if (!BREAK_HOURS.includes(h) && table[d][h] === EMPTY) free++;
      }
    }
    return free;
  }

  function classOrder(day, hour) {
    return [...classIds].sort((a, b) => {
      const ra = remainingForClass(a);
      const rb = remainingForClass(b);
      const fa = freeSlotsForClass(a, day, hour);
      const fb = freeSlotsForClass(b, day, hour);
      const da = fa > 0 ? ra / fa : Infinity;
      const db = fb > 0 ? rb / fb : Infinity;
      return db - da;
    });
  }

  // ---------------- PROGRESS ----------------
  const totalSlots = MAX_DAYS * HOURS_PER_DAY;
  let lastProgress = -1;

  function reportProgress(day, hour) {
    if (!progressCallback) return;
    const p = Math.floor(((day * HOURS_PER_DAY + hour) / totalSlots) * 100);
    if (p !== lastProgress) {
      lastProgress = p;
      progressCallback({
        progress: Math.min(p, 99),
        partialData: {
          class_timetables: classTT,
          faculty_timetables: facultyTT,
          subject_hours_assigned_per_class: subjectHours
        }
      });
    }
  }

  // ---------------- SLOT-DRIVEN BACKTRACKING ----------------
  function scheduleSlot(day, hour) {
    if (stopFlag?.is_set) return false;
    reportProgress(day, hour);

    if (day >= MAX_DAYS) return true;
    if (hour >= HOURS_PER_DAY) return scheduleSlot(day + 1, 0);
    if (BREAK_HOURS.includes(hour)) return scheduleSlot(day, hour + 1);

    const order = classOrder(day, hour);
    return tryClass(day, hour, order, 0);
  }

  function tryClass(day, hour, order, idx) {
    if (idx >= order.length) return scheduleSlot(day, hour + 1);

    const classId = order[idx];
    const cls = classById.get(classId);
    if (day >= (cls.days_per_week || DAYS_PER_WEEK)) {
      return tryClass(day, hour, order, idx + 1);
    }
    if (classTT[classId][day][hour] !== EMPTY) {
      return tryClass(day, hour, order, idx + 1);
    }

    const candidates = (cls.assigned_teacher_subject_combos || [])
      .filter(cbid => comboById.has(cbid))
      .sort((a, b) => {
        const sa = comboById.get(a).subject_id;
        const sb = comboById.get(b).subject_id;
        return (
          subjectDayCount(classId, day, sa) -
          subjectDayCount(classId, day, sb)
        );
      });

    for (const cbid of candidates) {
      if (!canPlace(classId, day, hour, cbid)) continue;
      place(classId, day, hour, cbid);
      if (tryClass(day, hour, order, idx + 1)) return true;
      unplace(classId, day, hour, cbid);
    }

    return tryClass(day, hour, order, idx + 1);
  }

  if (!placeElectivesFirst()) {
    return { ok: false, error: "Electives could not be placed feasibly" };
  }

  const solver_ok = scheduleSlot(0, 0);

  // --- REPAIR PHASE ---
  let repairIterations = 0;
  let prevRatio = completionRatio();

  while (repairIterations < 20) { // More iterations for destruction
    let changed = false;

    changed = repairFillEmptySlots() || changed;
    changed = repairSwap() || changed;

    if (completionRatio() >= 0.98) {
      changed = repairForcePlace() || changed;
    }
    
    const newRatio = completionRatio();
    
    if (newRatio <= prevRatio && !changed) {
        // no progress, try destruction
        if (completionRatio() < 1) {
            for (const cls of classes) {
                if (destroyOneSlot(cls._id)) {
                    changed = true;
                    break;
                }
            }
        }
    } else if (newRatio > prevRatio) {
        changed = true;
    }

    progressCallback?.({
        progress: Math.floor(95 + newRatio * 5),
        phase: "repair"
    });

    if (!changed) break;

    prevRatio = newRatio;
    repairIterations++;
  }
  // --- END REPAIR PHASE ---

  // Re-check for completion after repair
  let allSubjectsAssigned = true;
  for (const cls of classes) {
    for (const subj of subjects) {
      if ((subjectHours[cls._id][subj._id] || 0) < requiredHours(cls._id, subj._id)) {
        allSubjectsAssigned = false;
        break;
      }
    }
    if (!allSubjectsAssigned) break;
  }

  if (!allSubjectsAssigned && !solver_ok) {
    return {
      ok: false,
      error: stopFlag ? "Stopped by user" : "Solver could not find a valid solution even after repair.",
      class_timetables: classTT,
      faculty_timetables: facultyTT
    };
  }

  progressCallback?.({ progress: 100 });

  return {
    ok: true,
    class_timetables: classTT,
    faculty_timetables: facultyTT
  };
}

function printTimetable() {}
function scoreTimetable() { return 0; }
function shuffle() {}

export default { generate, printTimetable, scoreTimetable, shuffle };
