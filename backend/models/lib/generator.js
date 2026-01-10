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

  const electiveComboIds = new Set(
    combos
      .filter(c => c.subject_id.startsWith("VIRTUAL_ELECTIVE_"))
      .map(c => c._id)
  );
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

  function subjectContinuousOK(classId, day, hour, subjectId, block) {
    let before = 0;
    for (let h = hour - 1; h >= 0; h--) {
      const cid = classTT[classId][day][h];
      if (cid !== EMPTY && cid !== BREAK &&
          comboById.get(cid)?.subject_id === subjectId) {
        before++;
      } else break;
    }
  
    let after = 0;
    for (let h = hour + block; h < HOURS_PER_DAY; h++) {
      const cid = classTT[classId][day][h];
      if (cid !== EMPTY && cid !== BREAK &&
          comboById.get(cid)?.subject_id === subjectId) {
        after++;
      } else break;
    }
  
    return before + block + after <= 2;
  }

  function teacherContinuousInIndividual(individual, fid, day, hour, block) {
    const { facultyTT } = individual;
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

  function subjectContinuousOKInIndividual(individual, classId, day, hour, subjectId, block) {
    const { classTT } = individual;
    let before = 0;
    for (let h = hour - 1; h >= 0; h--) {
      const cid = classTT[classId][day][h];
      if (cid !== EMPTY && cid !== BREAK &&
          comboById.get(cid)?.subject_id === subjectId) {
        before++;
      } else break;
    }
  
    let after = 0;
    for (let h = hour + block; h < HOURS_PER_DAY; h++) {
      const cid = classTT[classId][day][h];
      if (cid !== EMPTY && cid !== BREAK &&
          comboById.get(cid)?.subject_id === subjectId) {
        after++;
      } else break;
    }
  
    return before + block + after <= 2;
  }

  function canPlace(classId, day, hour, comboId, softMode = false) {
    if (fixedMap.has(`${classId}|${day}|${hour}`)) return false;

    const combo = comboById.get(comboId);
    if (!combo) return false; // Null safety
    const subj = subjectById.get(combo.subject_id);
    const block = subj?.type === "lab" ? 2 : 1;

    if (hour + block > HOURS_PER_DAY) return false;

    for (let h = hour; h < hour + block; h++) {
      if (BREAK_HOURS.includes(h)) return false;
      if (classTT[classId][day][h] !== EMPTY) return false;

      for (const fid of combo.faculty_ids) {
        if (!teacherContinuous(fid, day, h, block)) return false;

        if (!isTeacherClashAllowed(combo.subject_id) && facultyTT[fid][day][h] !== EMPTY)
            return false;
      }
    }

    // 🔒 NEVER relax this
    if (!subjectContinuousOK(classId, day, hour, combo.subject_id, block))
      return false;

    const used = subjectHours[classId][combo.subject_id] || 0;
    const req = requiredHours(classId, combo.subject_id);

    // ❗ Allow slight overshoot only in final mode
    if (!isFinalRelaxedMode() && used + block > req) return false;

    // Soft preference: languages prefer morning (0-3 = P1-P4)
    if (softMode) { // During normal solving keep strict
      const subjId = combo.subject_id;
      if ((subjId === "KANNADA" || subjId === "ENGLISH") && hour > 3) {
        return Math.random() < 0.35; // ~65% chance to reject late placement (tunable)
      }
    }

    return true;
  }

  function place(classId, day, hour, comboId) {
    const combo = comboById.get(comboId);
    if (!combo) return; // Null safety
    const subj = subjectById.get(combo.subject_id);
    const block = subj?.type === "lab" ? 2 : 1; // Null safe access for subj

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
    if (!combo) return; // Null safety
    const subj = subjectById.get(combo.subject_id);
    const block = subj?.type === "lab" ? 2 : 1; // Null safe access for subj

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = EMPTY;
      for (const fid of combo.faculty_ids) {
        facultyTT[fid][day][h] = EMPTY;
      }
    }
    subjectHours[classId][subj._id] -= block;
  }

  function canPlaceInIndividual(individual, classId, day, hour, comboId) {
    const { classTT, facultyTT, subjectHours } = individual;

    if (fixedMap.has(`${classId}|${day}|${hour}`)) return false;

    const combo = comboById.get(comboId);
    if (!combo) return false; // Null safety
    const subj = subjectById.get(combo.subject_id);
    const block = subj?.type === "lab" ? 2 : 1;

    if (hour + block > HOURS_PER_DAY) return false;

    for (let h = hour; h < hour + block; h++) {
      if (BREAK_HOURS.includes(h)) return false;
      if (classTT[classId][day][h] !== EMPTY) return false;

      for (const fid of combo.faculty_ids) {
        // ALWAYS enforce teacher continuity
        if (!teacherContinuousInIndividual(individual, fid, day, h, block)) return false;
        // Faculty clash allowed based on isTeacherClashAllowed
        if (!isTeacherClashAllowed(combo.subject_id, individual.subjectHours) && facultyTT[fid][day][h] !== EMPTY) {
          return false;
        }
      }
    }

    // ALWAYS enforce subject continuity
    if (!subjectContinuousOKInIndividual(individual, classId, day, hour, combo.subject_id, block)) return false;

    const used = subjectHours[classId][combo.subject_id] || 0;
    const req = requiredHours(classId, combo.subject_id);

    // Allow slight overshoot only in final mode
    if (!isFinalRelaxedMode(individual.subjectHours) && used + block > req) return false;

    return true;
  }

  function placeInIndividual(individual, classId, day, hour, comboId) {
    const { classTT, facultyTT, subjectHours } = individual;

    const combo = comboById.get(comboId);
    if (!combo) return; // Null safety
    const subj = subjectById.get(combo.subject_id);
    const block = subj?.type === "lab" ? 2 : 1; // Null safe access for subj

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = comboId;
      for (const fid of combo.faculty_ids) {
        facultyTT[fid][day][h] = comboId;
      }
    }
    subjectHours[classId][subj._id] = (subjectHours[classId][subj._id] || 0) + block;
  }

  function unplaceInIndividual(individual, classId, day, hour, comboId) {
    const { classTT, facultyTT, subjectHours } = individual;

    if (fixedMap.has(`${classId}|${day}|${hour}`)) return;

    const combo = comboById.get(comboId);
    if (!combo) return; // Null safety
    const subj = subjectById.get(combo.subject_id);
    const block = subj?.type === "lab" ? 2 : 1; // Null safe access for subj

    for (let h = hour; h < hour + block; h++) {
      classTT[classId][day][h] = EMPTY;
      for (const fid of combo.faculty_ids) {
        facultyTT[fid][day][h] = EMPTY;
      }
    }
    subjectHours[classId][subj._id] -= block;
  }










  








  // ---------------- REPAIR PHASE FUNCTIONS ----------------
  function repairFillEmptySlots() {
    let repaired = false;

    for (const cls of classes) {
      const classId = cls._id;
      const days = classTT[classId].length;

      for (let d = 0; d < days; d++) {
        for (let h = 0; h < HOURS_PER_DAY; h++) {
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
            if (electiveComboIds.has(cid)) continue;

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
                            for (const cbid of cls.assigned_teacher_subject_combos || []) {              const newCombo = comboById.get(cbid);
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

            // Try electives first
            for (const cbid of cls.assigned_teacher_subject_combos || []) {
                if (electiveComboIds.has(cbid) || comboById.get(cbid)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_")) {
                    const combo = comboById.get(cbid);
                    if (!combo || combo.subject_id !== subj._id) continue; // Ensure it's for the current subject

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
                    break; // Placed an elective, break from this slot
                }
            }
            if (repaired) continue; // If an elective was placed, move to next slot

            // Then try non-electives
            for (const cbid of cls.assigned_teacher_subject_combos || []) {
                if (!(electiveComboIds.has(cbid) || comboById.get(cbid)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_"))) {
                    const combo = comboById.get(cbid);
                    if (!combo || combo.subject_id !== subj._id) continue; // Ensure it's for the current subject

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
                    break; // Placed a non-elective, break from this slot
                }
            }
          }
        }
      }
    }
    return repaired;
  }

  function removeAllFacultyClashes() {
      let removed = 0;

      for (let day = 0; day < MAX_DAYS; day++) {
          for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
              const teachersInSlot = new Set();

              // Collect all teachers active in this exact slot
              for (const cls of classes) {
                  const comboId = classTT[cls._id][day][hour];
                  if (!comboId || comboId === BREAK || comboId === EMPTY) continue;

                  const combo = comboById.get(comboId);
                  for (const fid of combo.faculty_ids) {
                      if (teachersInSlot.has(fid)) {
                          // Clash found → remove this lesson (the later one)
                          unplace(cls._id, day, hour, comboId);
                          removed++;
                          break;
                      }
                      teachersInSlot.add(fid);
                  }
              }
          }
      }

      console.log(`Removed ${removed} clashing lessons`);
      return removed > 0;
  }

  function repairByMovingBlocks() {
    let moved = false;

    for (const cls of classes) {
      const classId = cls._id;

      // Find under-assigned subjects
      for (const subj of subjects) {
        const need = requiredHours(classId, subj._id) - (subjectHours[classId][subj._id] || 0);
        if (need <= 0) continue;

        // Find existing blocks of other subjects to move
        for (let d = 0; d < classTT[classId].length; d++) {
          for (let h = 0; h < HOURS_PER_DAY; h++) {
            const cid = classTT[classId][d][h];
            if (cid === EMPTY || cid === BREAK || electiveComboIds.has(cid)) continue;

            const oldCombo = comboById.get(cid);
            const oldSubjId = oldCombo.subject_id;
            if (subjectHours[classId][oldSubjId] <= requiredHours(classId, oldSubjId)) continue; // Don't move if not over-assigned

            const block = subjectById.get(oldSubjId).type === 'lab' ? 2 : 1;

            // Find a new slot for this block
            for (let newD = 0; newD < classTT[classId].length; newD++) {
              for (let newH = 0; newH + block <= HOURS_PER_DAY; newH++) {
                if (canPlace(classId, newD, newH, cid)) {
                  // Move: unplace old, place new
                  unplace(classId, d, h, cid);
                  place(classId, newD, newH, cid);
                  moved = true;

                  // Now try to place the needed subject in the freed slot
                  for (const newCbid of cls.assigned_teacher_subject_combos || []) {
                    const newCombo = comboById.get(newCbid);
                    if (newCombo.subject_id === subj._id && canPlace(classId, d, h, newCbid)) {
                      place(classId, d, h, newCbid);
                      break;
                    }
                  }
                  break;
                }
              }
              if (moved) break;
            }
            if (moved) break;
          }
          if (moved) break;
        }
        if (moved) break;
      }
    }
    return moved;
  }
  // ---------------- END REPAIR PHASE FUNCTIONS ----------------
  function finalizeUnassignedSubjects() {
    let progress = false;

    for (const cls of classes) {
      const classId = cls._id;

      for (const subj of subjects) {
        const subjId = subj._id;
        const block = subj.type === "lab" ? 2 : 1;

        let need =
          requiredHours(classId, subjId) -
          (subjectHours[classId][subjId] || 0);

        if (need <= 0) continue;

        // Try every possible slot
        for (let d = 0; d < classTT[classId].length && need >= block; d++) {
          for (let h = 0; h + block <= HOURS_PER_DAY && need >= block; h++) {
            if (fixedMap.has(`${classId}|${d}|${h}`)) continue;

            let ok = true;
            for (let k = 0; k < block; k++) {
              if (
                BREAK_HOURS.includes(h + k) ||
                classTT[classId][d][h + k] !== EMPTY
              ) {
                ok = false;
                break;
              }
            }
            if (!ok) continue;

            // Try electives first
            for (const cbid of cls.assigned_teacher_subject_combos || []) {
              if (electiveComboIds.has(cbid) || comboById.get(cbid)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_")) {
                const combo = comboById.get(cbid);
                if (!combo || combo.subject_id !== subjId) continue;

                let teacherOk = true;
                for (let k = 0; k < block; k++) {
                  for (const fid of combo.faculty_ids) {
                    if (facultyTT[fid][d][h + k] !== EMPTY) {
                      teacherOk = false;
                      break;
                    }
                  }
                  if (!teacherOk) break;
                }
                if (!teacherOk) continue;

                // PLACE (even if ugly)
                for (let k = 0; k < block; k++) {
                  classTT[classId][d][h + k] = combo._id;
                  for (const fid of combo.faculty_ids) {
                    facultyTT[fid][d][h + k] = combo._id;
                  }
                }
                subjectHours[classId][subjId] =
                  (subjectHours[classId][subjId] || 0) + block;
                need -= block;
                progress = true;
                break; // Break from current slot's combo loop
              }
            }
            if (progress) continue; // If an elective was placed, move to next slot

            // Then try non-electives
            for (const cbid of cls.assigned_teacher_subject_combos || []) {
              if (!(electiveComboIds.has(cbid) || comboById.get(cbid)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_"))) {
                const combo = comboById.get(cbid);
                if (!combo || combo.subject_id !== subjId) continue;

                let teacherOk = true;
                for (let k = 0; k < block; k++) {
                  for (const fid of combo.faculty_ids) {
                    if (facultyTT[fid][d][h + k] !== EMPTY) {
                      teacherOk = false;
                      break;
                    }
                  }
                  if (!teacherOk) break;
                }
                if (!teacherOk) continue;

                // PLACE (even if ugly)
                for (let k = 0; k < block; k++) {
                  classTT[classId][d][h + k] = combo._id;
                  for (const fid of combo.faculty_ids) {
                    facultyTT[fid][d][h + k] = combo._id;
                  }
                }
                subjectHours[classId][subjId] =
                  (subjectHours[classId][subjId] || 0) + block;
                need -= block;
                progress = true;
                break; // Break from current slot's combo loop
              }
            }
          }
        }
      }
    }

    return progress;
  }

  function forceCompleteWithContinuity() {
    if (completionRatio() < 1) {
      while (completionRatio() < 1) {
        let progress = false;

        for (const cls of classes) {
          for (let d = 0; d < classTT[cls._id].length; d++) {
            for (let h = 0; h < HOURS_PER_DAY; h++) {
              if (BREAK_HOURS.includes(h)) continue;
              if (classTT[cls._id][d][h] !== EMPTY) continue;

              for (const cbid of cls.assigned_teacher_subject_combos || []) {
                if (canPlace(cls._id, d, h, cbid)) {
                  place(cls._id, d, h, cbid);
                  progress = true;
                  break;
                }
              }
            }
          }
        }

        if (!progress) break; // no legal move left
      }
    }
    return completionRatio() === 1; // Return true if 100% complete, false otherwise
  }


  function finalRelaxedForceFill() {
    let progress = false;

    for (const cls of classes) {
      const classId = cls._id;

      for (const subj of subjects) {
        let need =
          requiredHours(classId, subj._id) -
          (subjectHours[classId][subj._id] || 0);

        if (need <= 0) continue;

        const block = subj.type === "lab" ? 2 : 1;
        if (need < block) continue;

        for (let d = 0; d < classTT[classId].length && need >= block; d++) {
          for (let h = 0; h + block <= HOURS_PER_DAY && need >= block; h++) {



            // Try electives first
            for (const cbid of cls.assigned_teacher_subject_combos || []) {
              if (electiveComboIds.has(cbid) || comboById.get(cbid)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_")) {
                const combo = comboById.get(cbid);
                if (!combo || combo.subject_id !== subj._id) continue;

                if (!canPlace(classId, d, h, cbid, true)) continue;

                place(classId, d, h, cbid);
                need -= block;
                progress = true;
                break; // Break from current slot's combo loop
              }
            }
            if (progress) continue; // If an elective was placed, move to next slot

            // Then try non-electives
            for (const cbid of cls.assigned_teacher_subject_combos || []) {
              if (!(electiveComboIds.has(cbid) || comboById.get(cbid)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_"))) {
                const combo = comboById.get(cbid);
                if (!combo || combo.subject_id !== subj._id) continue;

                if (!canPlace(classId, d, h, cbid, true)) continue;

                place(classId, d, h, cbid);
                need -= block;
                progress = true;
                break; // Break from current slot's combo loop
              }
            }
          }
        }
      }
    }

      return progress;
    }
    
function compactDay(clsId, day) {
  const row = classTT[clsId][day].slice(); // copy
  const newRow = new Array(HOURS_PER_DAY).fill(EMPTY);

  let target = 0; // Where we want to write next lesson

  for (let h = 0; h < HOURS_PER_DAY; h++) {
    if (BREAK_HOURS.includes(h)) {
      newRow[h] = BREAK;
      target = h + 1; // Reset target after each break
      continue;
    }

    // Find next non-empty lesson
    while (target < HOURS_PER_DAY && (row[target] === EMPTY || row[target] === BREAK)) {
      target++;
    }
    if (target >= HOURS_PER_DAY) break;

    // Move it to current position if possible
    if (row[target] !== EMPTY && row[target] !== BREAK) {
      newRow[h] = row[target];

      // Update facultyTT for moved slot
      const comboId = row[target];
      const combo = comboById.get(comboId);
      if (combo) {
        for (const fid of combo.faculty_ids) {
          facultyTT[fid][day][target] = EMPTY;     // clear old
          facultyTT[fid][day][h] = comboId;        // set new
        }
      }
      target++; // move to next source slot
    }
  }

  // Write back
  classTT[clsId][day] = newRow;
}
    
    function compactAllTimetables() {
      for (const cls of classes) {
        for (let d = 0; d < classTT[cls._id].length; d++) {
          compactDay(cls._id, d);
        }
      }
    }

function safeGreedyFill() {
    let placed = 0;

    for (const cls of classes) {
        const clsId = cls._id;

        for (let d = 0; d < classTT[clsId].length; d++) {
            for (let h = 0; h < HOURS_PER_DAY; h++) {
                if (classTT[clsId][d][h] !== EMPTY) continue;

                // Try electives first
                for (const comboId of cls.assigned_teacher_subject_combos || []) {
                    if (electiveComboIds.has(comboId) || comboById.get(comboId)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_")) {
                        if (canPlace(clsId, d, h, comboId, true)) {
                            place(clsId, d, h, comboId);
                            placed++;
                            break;
                        }
                    }
                }
                if (placed > 0) continue; // If an elective was placed, move to next slot

                // Then try non-electives
                for (const comboId of cls.assigned_teacher_subject_combos || []) {
                    if (!(electiveComboIds.has(comboId) || comboById.get(comboId)?.subject_id?.startsWith("VIRTUAL_ELECTIVE_"))) {
                        if (canPlace(clsId, d, h, comboId, true)) {
                            place(clsId, d, h, comboId);
                            placed++;
                            break;
                        }
                    }
                }
            }
        }
    }

    return placed;
}
    
    function destroyOneSlot(classId) {
      for (let d = classTT[classId].length - 1; d >= 0; d--) {
        for (let h = HOURS_PER_DAY - 1; h >= 0; h--) {
          const cid = classTT[classId][d][h];
          if (cid !== EMPTY && cid !== BREAK && !fixedMap.has(`${classId}|${d}|${h}`) && !electiveComboIds.has(cid)) {
            unplace(classId, d, h, cid);
            return true;
          }
        }
      }
      return false;
    }

function repairLanguagesInGaps() {
  let placed = 0;
  for (const cls of classes) {
    const clsId = cls._id;
    for (let d = 0; d < classTT[clsId].length; d++) {
      for (let h = 0; h < HOURS_PER_DAY; h++) {
        if (classTT[clsId][d][h] !== EMPTY) continue;

        // Try only language combos
        for (const cbid of cls.assigned_teacher_subject_combos || []) {
          const subjId = comboById.get(cbid)?.subject_id;
          if (!["KANNADA", "ENGLISH"].includes(subjId)) continue;

          if (canPlace(clsId, d, h, cbid)) {
            place(clsId, d, h, cbid);
            placed++;
            break;
          }
        }
      }
    }
  }
  return placed > 0;
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

  function classDegree(classId) {
    const cls = classById.get(classId);
    const combos = cls.assigned_teacher_subject_combos || [];
    const uniqueTeachers = new Set();
    combos.forEach(cbid => {
      const combo = comboById.get(cbid);
      combo.faculty_ids.forEach(fid => uniqueTeachers.add(fid));
    });
    return combos.length + uniqueTeachers.size; // Rough "constraint density"
  }

  function classOrder(day, hour) {
    const ratio = completionRatio();

    return [...classIds].sort((a, b) => {
      const ra = remainingForClass(a);
      const rb = remainingForClass(b);
      const fa = freeSlotsForClass(a, day, hour);
      const fb = freeSlotsForClass(b, day, hour);
      const da = classDegree(a);
      const db = classDegree(b);

      // Late-stage: fewer free slots first
      if (ratio > 0.9) return fa - fb;

      // Normal: MRV (density-adjusted)
      const mrvA = fa > 0 ? (ra / fa) * (da / 10) : Infinity; // Weight by degree
      const mrvB = fb > 0 ? (rb / fb) * (db / 10) : Infinity;
      return mrvB - mrvA; // Higher MRV first
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
      .map(cbid => {
        const combo = comboById.get(cbid); // Get combo first
        const subjId = combo?.subject_id; // Use optional chaining
        const isElective = electiveComboIds.has(cbid) || (subjId && subjId.startsWith("VIRTUAL_ELECTIVE_")); // Add subjId check
        const req = requiredHours(classId, subjId);
        const used = subjectHours[classId][subjId] || 0;
        const remaining = req - used;
        const dayCount = subjectDayCount(classId, day, subjId);

        let priorityScore = remaining;
        if (isElective) priorityScore *= 2.5;          // ← Boost electives significantly!
        if (remaining > 4) priorityScore *= 1.5;       // Also boost big remaining needs

        return { cbid, priorityScore, dayCount, remaining };
      })
      .filter(({ remaining }) => remaining > 0) // Skip if already complete
      .sort((a, b) => b.priorityScore - a.priorityScore || a.dayCount - b.dayCount)
      .map(({ cbid }) => cbid);

    for (const cbid of candidates) {
      if (!canPlace(classId, day, hour, cbid)) continue;
      place(classId, day, hour, cbid);
      if (tryClass(day, hour, order, idx + 1)) return true;
      unplace(classId, day, hour, cbid);
    }

    return tryClass(day, hour, order, idx + 1);
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

  finalizeUnassignedSubjects();

// New Strategy: Clash Removal -> Compaction -> Safe Greedy Fill + Destruction if Stuck
let changed = true;
let overallAttempts = 0;
while (changed && overallAttempts < 10) { // Outer loop for multiple full cycles
  let clashRemovalAttempts = 0;
  while (changed && clashRemovalAttempts < 5) {
    changed = removeAllFacultyClashes();
    clashRemovalAttempts++;
  }

  compactAllTimetables();

  let safeFillAttempts = 0;
  changed = false;
  while (safeGreedyFill() > 0 && safeFillAttempts++ < 30) {
    compactAllTimetables();
    changed = true;
  }

  // If still not 100%, selective destruction
  if (completionRatio() < 1 && !changed) {
    for (const cls of classes) {
      if (destroyOneSlot(cls._id)) { // Your existing destroy
        changed = true;
        break;
      }
    }
  }

  overallAttempts++;
}

// Call after main safe fill loop:
if (completionRatio() >= 0.97) {
  repairLanguagesInGaps();
  compactAllTimetables();
}

if (completionRatio() >= 0.95) {
  // 🔥 Phase A: destroy all holes
  compactAllTimetables();

  // 🔥 Phase B: brute-force fill
  let guard = 0;
  while (completionRatio() < 1 && guard < 50) {
    const moved = finalRelaxedForceFill();
    if (!moved) break;

    // Re-compact after every pass
    compactAllTimetables();
    guard++;
  }
}

// Call GA after repairs if still not 100%
if (completionRatio() < 1) {
    geneticAlgorithmOptimization();
    compactAllTimetables(); // Re-compact after GA
}

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
      faculty_timetables: facultyTT,
      classes: classes,
    };
  }

  progressCallback?.({ progress: 100 });

  return {
    ok: true,
    class_timetables: classTT,
    faculty_timetables: facultyTT,
    classes: classes,
  };
}

function printTimetable() {}
function shuffle() {}


function completionRatio(currentSubjectHours, currentClasses, currentSubjects, currentRequiredHours) {
    let required = 0;
    let assigned = 0;
  
    for (const cls of currentClasses) {
      for (const subj of currentSubjects) {
        const req = currentRequiredHours(cls._id, subj._id);
        if (req > 0) {
          required += req;
          assigned += Math.min(
            currentSubjectHours[cls._id][subj._id] || 0,
            req
          );
        }
      }
    }
    return required === 0 ? 1 : assigned / required;
}




function cloneTT(sourceTT, currentClassTT, currentFacultyTT, currentSubjectHours) {
    const classTTToClone = sourceTT?.classTT || currentClassTT;
    const facultyTTToClone = sourceTT?.facultyTT || currentFacultyTT;
    const subjectHoursToClone = sourceTT?.subjectHours || currentSubjectHours;

    return {
      classTT: JSON.parse(JSON.stringify(classTTToClone)),
      facultyTT: JSON.parse(JSON.stringify(facultyTTToClone)),
      subjectHours: JSON.parse(JSON.stringify(subjectHoursToClone))
    };
}

function completionRatio(currentSubjectHours, currentClasses, currentSubjects, currentRequiredHours) {
    let required = 0;
    let assigned = 0;
  
    for (const cls of currentClasses) {
      for (const subj of currentSubjects) {
        const req = currentRequiredHours(cls._id, subj._id);
        if (req > 0) {
          required += req;
          assigned += Math.min(
            currentSubjectHours[cls._id][subj._id] || 0,
            req
          );
        }
      }
    }
    return required === 0 ? 1 : assigned / required;
}

function scoreTimetable(
  individualTT,
  currentClasses,
  currentSubjects,
  currentComboById,
  currentSubjectById,
  currentHOURS_PER_DAY,
  currentEMPTY,
  currentBREAK,
  currentRequiredHours,
  globalCompletionRatio
) {
  let score = (globalCompletionRatio(
    individualTT.subjectHours,
    currentClasses,
    currentSubjects,
    currentRequiredHours
  ) || 0) * 1000; // High weight

  // Penalize clumps/gaps
  for (const cls of currentClasses) {
    for (let d = 0; d < individualTT.classTT[cls._id].length; d++) {
      let gaps = 0, clumps = 0;
      for (let h = 0; h < currentHOURS_PER_DAY; h++) {
        const cid = individualTT.classTT[cls._id][d][h];
        if (cid === currentEMPTY) gaps++;
        if (cid !== currentEMPTY && cid !== currentBREAK) {
          const subj = currentComboById.get(cid)?.subject_id;
          if (subj === prevSubj) clumps++; // Penalize >1 consecutive same subj (beyond hard limit)
          prevSubj = subj;
        }
      }
      score -= gaps * 2 + clumps * 3; // Tunable penalties
    }
  }

  // Penalize late languages (hour >4 for lang -5 pts each)
  for (const cls of currentClasses) {
    for (let d = 0; d < individualTT.classTT[cls._id].length; d++) {
      for (let h = 0; h < currentHOURS_PER_DAY; h++) {
        const cid = individualTT.classTT[cls._id][d][h];
        if (cid !== currentEMPTY && cid !== currentBREAK) {
          const subjId = currentComboById.get(cid)?.subject_id;
          if (["KANNADA", "ENGLISH"].includes(subjId) && h > 4) {
            score -= 5;
          }
        }
      }
    }
  }

  return score;
}

function completionRatio(currentSubjectHours, currentClasses, currentSubjects, currentRequiredHours) {
    let required = 0;
    let assigned = 0;
  
    for (const cls of currentClasses) {
      for (const subj of currentSubjects) {
        const req = currentRequiredHours(cls._id, subj._id);
        if (req > 0) {
          required += req;
          assigned += Math.min(
            currentSubjectHours[cls._id][subj._id] || 0,
            req
          );
        }
      }
    }
    return required === 0 ? 1 : assigned / required;
}

function scoreTimetable(
  individualTT,
  currentClasses,
  currentSubjects,
  currentComboById,
  currentSubjectById,
  currentHOURS_PER_DAY,
  currentEMPTY,
  currentBREAK,
  currentRequiredHours,
  globalCompletionRatio
) {
  let score = (globalCompletionRatio(
    individualTT.subjectHours,
    currentClasses,
    currentSubjects,
    currentRequiredHours
  ) || 0) * 1000; // High weight

  // Penalize clumps/gaps
  for (const cls of currentClasses) {
    for (let d = 0; d < individualTT.classTT[cls._id].length; d++) {
      let gaps = 0, clumps = 0;
      for (let h = 0; h < currentHOURS_PER_DAY; h++) {
        const cid = individualTT.classTT[cls._id][d][h];
        if (cid === currentEMPTY) gaps++;
        if (cid !== currentEMPTY && cid !== currentBREAK) {
          const subj = currentComboById.get(cid)?.subject_id;
          if (subj === prevSubj) clumps++; // Penalize >1 consecutive same subj (beyond hard limit)
          prevSubj = subj;
        }
      }
      score -= gaps * 2 + clumps * 3; // Tunable penalties
    }
  }

  // Penalize late languages (hour >4 for lang -5 pts each)
  for (const cls of currentClasses) {
    for (let d = 0; d < individualTT.classTT[cls._id].length; d++) {
      for (let h = 0; h < currentHOURS_PER_DAY; h++) {
        const cid = individualTT.classTT[cls._id][d][h];
        if (cid !== currentEMPTY && cid !== currentBREAK) {
          const subjId = currentComboById.get(cid)?.subject_id;
          if (["KANNADA", "ENGLISH"].includes(subjId) && h > 4) {
            score -= 5;
          }
        }
      }
    }
  }

  return score;
}

function mutate(
  individual,
  currentClasses,
  currentComboById,
  currentSubjectById,
  currentFixedMap,
  currentHOURS_PER_DAY,
  currentEMPTY,
  currentBREAK,
  currentCanPlaceInIndividual,
  currentUnplaceInIndividual,
  currentPlaceInIndividual
) {
    const cls = currentClasses[Math.floor(Math.random() * currentClasses.length)];
    const classId = cls._id;
    for (let d = 0; d < individual.classTT[classId].length; d++) {
      for (let h = 0; h < currentHOURS_PER_DAY; h++) {
        const cid = individual.classTT[classId][d][h];
        if (cid !== currentEMPTY && cid !== currentBREAK && !currentFixedMap.has(`${classId}|${d}|${h}`)) {
          // Try to move to random free slot
          const combo = currentComboById.get(cid); // Get combo first
          if (!combo) continue; // Null safety
          const subj = currentSubjectById.get(combo.subject_id);
          const block = subj?.type === 'lab' ? 2 : 1;
          const newD = Math.floor(Math.random() * individual.classTT[classId].length);
          const newH = Math.floor(Math.random() * (currentHOURS_PER_DAY - block));
          if (currentCanPlaceInIndividual(individual, classId, newD, newH, cid)) { // Adapt canPlace to use individual state
            currentUnplaceInIndividual(individual, classId, d, h, cid);
            currentPlaceInIndividual(individual, classId, newD, newH, cid);
            return true;
          }
        }
      }
    }
    return false;
  }

function crossover(
  parent1,
  parent2,
  currentClasses,
  currentComboById,
  currentSubjectById,
  currentHOURS_PER_DAY,
  currentEMPTY,
  currentBREAK,
  currentRequiredHours,
  currentCloneTT
) {
    const child = currentCloneTT(parent1, null, null, null, currentComboById, currentSubjectById, currentHOURS_PER_DAY, currentEMPTY, currentBREAK, currentRequiredHours); // Pass needed context
    const cls = currentClasses[Math.floor(Math.random() * currentClasses.length)];
    const classId = cls._id;
    const day = Math.floor(Math.random() * (child.classTT[classId]?.length || 0));
    
    // Clear the day in child's facultyTT and subjectHours before copying from parent2
    for (let h = 0; h < currentHOURS_PER_DAY; h++) {
        const comboId = child.classTT[classId][day][h];
        if (comboId !== currentEMPTY && comboId !== currentBREAK) {
            const combo = currentComboById.get(comboId);
            if (!combo) continue; // Null safety
            const subj = currentSubjectById.get(combo.subject_id);
            if (!subj) continue; // Null safety
            child.subjectHours[classId][subj._id] -= (subj.type === "lab" ? 2 : 1);
            for (const fid of combo.faculty_ids) {
                child.facultyTT[fid][day][h] = currentEMPTY; // Use currentEMPTY
            }
        }
    }

    // Swap day for this class
    child.classTT[classId][day] = parent2.classTT[classId][day].slice();

    // Update child's facultyTT and subjectHours based on new day
    for (let h = 0; h < currentHOURS_PER_DAY; h++) {
        const comboId = child.classTT[classId][day][h];
        if (comboId !== currentEMPTY && comboId !== currentBREAK) {
            const combo = currentComboById.get(comboId);
            if (!combo) continue; // Null safety
            const subj = currentSubjectById.get(combo.subject_id);
            if (!subj) continue; // Null safety
            child.subjectHours[classId][subj._id] = (child.subjectHours[classId][subj._id] || 0) + (subj.type === "lab" ? 2 : 1);
            for (const fid of combo.faculty_ids) {
                child.facultyTT[fid][day][h] = comboId;
            }
        }
    }
    
    return child;
  }

export default { generate, printTimetable, scoreTimetable, shuffle };

