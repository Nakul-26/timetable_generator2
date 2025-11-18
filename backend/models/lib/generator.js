// lib/generator.js
// Updated features:
// - Default: 6 days/week, 8 hours/day (48 slots)
// - BREAK_HOURS default is empty (configurable)
// - Removed strict "2-period gap after every class" constraint
// - Enforced faculty daily max hours (<= 4) and heuristic to aim for 4
// - Max continuous hours for a faculty = 2
// - Combined-classes support via subject.combined_classes (Option A)
//   When a subject has `combined_classes: ['C1','C2']`, those classes
//   will be scheduled for that subject at the same hour with the same combo.
//   Combined slot counts as a single hour of workload for the faculty,
//   but counts toward each class's subject hours.

function generate({
  faculties,
  subjects,
  classes,
  combos,
  DAYS_PER_WEEK = 6,
  HOURS_PER_DAY = 8,
  BREAK_HOURS = [], // configurable
  fixed_slots = [],
}) {
  const EMPTY_SLOT = -1;
  const BREAK_SLOT = "BREAK";

  console.log(
    `🔹 Start: ${classes.length} classes, ${faculties.length} faculties, ${subjects.length} subjects, ${combos.length} combos`
  );

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
  combos = combos.map((c) => ({
    ...c,
    _id: String(c._id || c.id),
    id: c.id != null ? String(c.id) : undefined,
    faculty_id: String(c.faculty_id),
    subject_id: String(c.subject_id),
  }));
  classes = classes.map((c) => ({ ...c, _id: String(c._id || c.id) }));

  // --- Maps ---
  const comboByMongoId = new Map(combos.map((c) => [c._id, c]));
  const comboByBizId = new Map(combos.filter((c) => c.id).map((c) => [c.id, c]));
  const facultyById = new Map(faculties.map((f) => [f._id, f]));
  const subjectById = new Map(subjects.map((s) => [s._id, s]));
  const classById = new Map(classes.map((c) => [c._id, c]));

  // ensure subjects have combined_classes array if present
  for (const s of subjects) {
    if (s.combined_classes && !Array.isArray(s.combined_classes)) {
      s.combined_classes = Array.isArray(s.combined_classes)
        ? s.combined_classes.map(String)
        : [String(s.combined_classes)];
    }
  }

  // --- Timetable structures ---
  const class_timetables = {};
  const faculty_timetables = {};
  const subject_hours_assigned_per_class = {};
  const daily_hours_assigned = {}; // daily_hours_assigned[classId][day] = number

  for (const cls of classes) {
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    class_timetables[cls._id] = Array.from({ length: daysPerWeek }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
    subject_hours_assigned_per_class[cls._id] = {};
    daily_hours_assigned[cls._id] = Array.from({ length: daysPerWeek }, () => 0);
    for (const s of subjects) subject_hours_assigned_per_class[cls._id][s._id] = 0;
  }

  // compute max days across classes (fall back to DAYS_PER_WEEK if no classes)
  const classDays = classes.map((c) => Number(c.days_per_week || DAYS_PER_WEEK));
  const MAX_DAYS = classDays.length ? Math.max(...classDays) : DAYS_PER_WEEK;

  for (const f of faculties) {
    faculty_timetables[f._id] = Array.from({ length: MAX_DAYS }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
  }

  // --- Helpers ---
  function toComboMongoId(value) {
    if (value == null) return null;
    const key = String(value);
    if (comboByMongoId.has(key)) return key;
    const byBiz = comboByBizId.get(key);
    return byBiz ? byBiz._id : null;
  }

  function resolveAssignedCombos(rawList) {
    if (!Array.isArray(rawList)) return [];
    const resolved = [];
    for (const v of rawList) {
      const m = toComboMongoId(v);
      if (m) resolved.push(m);
      else console.warn(`⚠️  Unknown combo reference on class:`, v);
    }
    return resolved;
  }

  // --- Constraints ---
  // note: previous '2-period gap' constraint removed

  function check_subject_same_hour_different_days_constraint(
    classId,
    subject_id,
    day,
    hour
  ) {
    const ct = class_timetables[classId];
    const cls = classById.get(classId);
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    for (let d = 0; d < daysPerWeek; d++) {
      if (d === day) continue;
      const idAt = ct[d][hour];
      if (idAt !== EMPTY_SLOT && idAt !== BREAK_SLOT) {
        const otherCombo = comboByMongoId.get(String(idAt));
        if (otherCombo && otherCombo.subject_id === subject_id) return false;
      }
    }
    return true;
  }

  function check_no_gaps_constraint(classId, day, hour) {
    if (hour > 0 && class_timetables[classId][day][hour - 1] === EMPTY_SLOT)
      return false;
    return true;
  }

  function can_place_lab_block(classId, faculty_id, day, hour, blockSize) {
    if (hour + blockSize > HOURS_PER_DAY) return false;

    for (let h = hour; h < hour + blockSize; h++) {
      if (BREAK_HOURS.includes(h)) return false;
      if (class_timetables[classId][day][h] !== EMPTY_SLOT) return false;
      if (faculty_timetables[faculty_id][day][h] !== EMPTY_SLOT) return false;
    }
    return true;
  }

  function daily_target_for_class(classId) {
    const cls = classById.get(classId);
    if (!cls) return 0;
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    return Math.ceil((cls.total_class_hours || 0) / daysPerWeek);
  }

  // helper: check continuous hours for faculty (max 2 continuous)
  function check_continuous_hours(faculty_id, day, hour, blockSize) {
    const ft = faculty_timetables[faculty_id][day];

    // count continuous before
    let before = 0;
    for (let h = hour - 1; h >= 0; h--) {
      if (ft[h] !== EMPTY_SLOT && ft[h] !== BREAK_SLOT) before++;
      else break;
    }

    // count continuous after
    let after = 0;
    for (let h = hour + blockSize; h < HOURS_PER_DAY; h++) {
      if (ft[h] !== EMPTY_SLOT && ft[h] !== BREAK_SLOT) after++;
      else break;
    }

    return before + blockSize + after <= 2;
  }

  // --- Preprocess classes ---
  for (const cls of classes) {
    if (
      cls.assigned_teacher_subject_combos === undefined ||
      cls.assigned_teacher_subject_combos === null
    ) {
      const auto = combos
        .filter((cb) => {
          const subj = subjectById.get(cb.subject_id);
          return subj && subj.sem === cls.sem;
        })
        .map((cb) => cb._id);
      cls.assigned_teacher_subject_combos = auto;
    } else {
      cls.assigned_teacher_subject_combos = resolveAssignedCombos(
        cls.assigned_teacher_subject_combos
      );
    }

    let tot = 0;
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const cb = comboByMongoId.get(String(cbid));
      if (!cb) continue;
      const subj = subjectById.get(cb.subject_id);
      if (subj && typeof subj.no_of_hours_per_week === "number") {
        tot += subj.no_of_hours_per_week;
      }
    }
    cls.total_class_hours = tot;
    classById.set(cls._id, cls);
  }

  const classIds = classes.filter((c) => c.total_class_hours > 0).map((c) => c._id);

  // Early Fail Check
  for (const cls of classes) {
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    const availableSlots = daysPerWeek * (HOURS_PER_DAY - BREAK_HOURS.length);
    if (cls.total_class_hours > availableSlots) {
      return {
        ok: false,
        error: `Class ${cls.name} has more required hours (${cls.total_class_hours}) than available slots (${availableSlots}).`,
      };
    }
  }

  // --- PREFILL FIXED SLOTS (supports multi-hour block via blockSize) ---
  if (!Array.isArray(fixed_slots)) fixed_slots = [];

  function resolveComboForSubjectAndClass({ classId, subjectId, facultyPref }) {
    const cls = classById.get(classId);
    if (!cls) return null;
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const cb = comboByMongoId.get(String(cbid));
      if (!cb) continue;
      if (cb.subject_id === subjectId) {
        if (facultyPref && String(cb.faculty_id) !== String(facultyPref)) continue;
        return cb._id;
      }
    }
    // fallback: any combo for that subject
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const cb = comboByMongoId.get(String(cbid));
      if (!cb) continue;
      if (cb.subject_id === subjectId) return cb._id;
    }
    return null;
  }

  // fixedMap for marking fixed slots
  const fixedMap = new Map();
  function setFixedSlot(classId, day, hour, comboId) {
    fixedMap.set(`${classId}|${day}|${hour}`, { comboId });
  }
  function getFixedSlot(classId, day, hour) {
    return fixedMap.get(`${classId}|${day}|${hour}`) || null;
  }

  // Apply each fixed slot
  for (const slot of fixed_slots) {
    const classId = String(slot.class);
    const day = Number(slot.day);
    const hour = Number(slot.hour);
    const blockSize = slot.blockSize != null ? Number(slot.blockSize) : 1;

    if (!classById.has(classId)) {
      return { ok: false, error: `Fixed slot references unknown class ${slot.class}` };
    }
    const clsForSlot = classById.get(classId);
    const daysForClass = Number(clsForSlot.days_per_week || DAYS_PER_WEEK);
    if (day < 0 || day >= daysForClass) {
      return { ok: false, error: `Fixed slot day out of range for class ${classId}: ${slot.day}` };
    }
    if (hour < 0 || hour >= HOURS_PER_DAY) {
      return { ok: false, error: `Fixed slot hour out of range: ${slot.hour}` };
    }

    // Resolve combo id
    let comboId = null;
    if (slot.combo) {
      comboId = toComboMongoId(slot.combo);
      if (!comboId) {
        return { ok: false, error: `Fixed slot references unknown combo ${slot.combo}` };
      }
    } else if (slot.subject) {
      const subjId = String(slot.subject);
      if (!subjectById.has(subjId)) {
        return { ok: false, error: `Fixed slot references unknown subject ${slot.subject}` };
      }
      const resolved = resolveComboForSubjectAndClass({
        classId,
        subjectId: subjId,
        facultyPref: slot.faculty,
      });
      if (!resolved) {
        return { ok: false, error: `No combo found in class ${classId} for subject ${subjId}` };
      }
      comboId = resolved;
    } else {
      return { ok: false, error: `Fixed slot must include either combo or subject: ${JSON.stringify(slot)}` };
    }

    // Validate block doesn't hit breaks and that contiguous hours available
    if (hour + blockSize > HOURS_PER_DAY) {
      return { ok: false, error: `Fixed block too large for day/hour: ${JSON.stringify(slot)}` };
    }
    for (let h = hour; h < hour + blockSize; h++) {
      if (BREAK_HOURS.includes(h)) {
        return { ok: false, error: `Fixed block intersects a break hour: ${JSON.stringify(slot)}` };
      }
      if (class_timetables[classId][day][h] !== EMPTY_SLOT) {
        return { ok: false, error: `Fixed block collides with prefilled class slot for ${classId} day ${day} hour ${h}` };
      }
      const facultyId = comboByMongoId.get(comboId).faculty_id;
      if (faculty_timetables[facultyId][day][h] !== EMPTY_SLOT) {
        return { ok: false, error: `Fixed block collides with faculty availability for ${facultyId} at ${day}:${h}` };
      }
    }

    // Place fixed block
    const combo = comboByMongoId.get(comboId);
    const subj = subjectById.get(combo.subject_id);
    for (let h = hour; h < hour + blockSize; h++) {
      class_timetables[classId][day][h] = comboId;
      faculty_timetables[combo.faculty_id][day][h] = comboId;
      subject_hours_assigned_per_class[classId][subj._id] += 1;
      daily_hours_assigned[classId][day] += 1;
      setFixedSlot(classId, day, h, comboId);
    }
  }

  // --- Caching visited states ---
  const visited = new Set();

  function class_assigned_hours(classId) {
    let total = 0;
    for (const s of subjects)
      total += subject_hours_assigned_per_class[classId][s._id] || 0;
    return total;
  }

  // Helper: check whether we can place a combined combo for a subject across its group
  function can_place_combined(combo, subj, group, day, hour, blockSize) {
    // group is array of classIds (strings)
    for (const otherClass of group) {
      // must be a valid class
      if (!classById.has(otherClass)) return false;
      const cls = classById.get(otherClass);
      const daysForClass = Number(cls.days_per_week || DAYS_PER_WEEK);
      if (day >= daysForClass) return false;
      // class slot free
      for (let h = hour; h < hour + blockSize; h++) {
        if (class_timetables[otherClass][day][h] !== EMPTY_SLOT) return false;
        if (BREAK_HOURS.includes(h)) return false;
      }
      // subject hours for class shouldn't exceed subject's weekly limit
      if (
        subject_hours_assigned_per_class[otherClass][subj._id] + blockSize >
        subj.no_of_hours_per_week
      )
        return false;
      // daily hours target for that class
      const target = daily_target_for_class(otherClass);
      if (daily_hours_assigned[otherClass][day] + blockSize > target) return false;
      // the class should have this combo assigned (or at least a combo for the subject)
      const hasCombo = classById.get(otherClass).assigned_teacher_subject_combos.some(
        (cbid) => String(cbid) === String(combo._id)
      );
      if (!hasCombo) return false;
    }

    // faculty availability: faculty_timetables must be free for the block
    const facultyId = combo.faculty_id;
    for (let h = hour; h < hour + blockSize; h++) {
      if (faculty_timetables[facultyId][day][h] !== EMPTY_SLOT) return false;
    }

    // faculty daily hours limit (combined counts as 1)
    const facultyDayHours = faculty_timetables[combo.faculty_id][day].filter(
      (x) => x !== EMPTY_SLOT && x !== BREAK_SLOT
    ).length;
    if (facultyDayHours + 1 > 4) return false; // cannot exceed 4

    // continuous hours check for faculty (blockSize treated as 1 for combined workload)
    if (!check_continuous_hours(combo.faculty_id, day, hour, 1)) return false;

    // subject same-hour-different-days constraint should hold for each class in group
    for (const otherClass of group) {
      if (
        !check_subject_same_hour_different_days_constraint(
          otherClass,
          subj._id,
          day,
          hour
        )
      )
        return false;
    }

    return true;
  }

  function is_placement_valid(classId, day, hour, combo_id, blockSize = 1) {
    if (BREAK_HOURS.includes(hour)) return false;
    const combo = comboByMongoId.get(String(combo_id));
    if (!combo) return false;
    const subj = subjectById.get(combo.subject_id);
    if (!subj) return false;

    // check fixed slots: if any hour in the placement is fixed and fixed combo != this combo -> invalid
    for (let h = hour; h < hour + blockSize; h++) {
      const fixed = getFixedSlot(classId, day, h);
      if (fixed && fixed.comboId !== combo._id) return false;
    }

    const cls = classById.get(classId);
    const target = daily_target_for_class(classId);
    if (daily_hours_assigned[classId][day] + blockSize > target) {
      return false;
    }

    if (subj.type === "lab") {
      if (!can_place_lab_block(classId, combo.faculty_id, day, hour, blockSize))
        return false;
      // teacher continuous check at both ends (blockSize counts as block)
      if (!check_continuous_hours(combo.faculty_id, day, hour, blockSize)) return false;
      if (
        subject_hours_assigned_per_class[classId][subj._id] + blockSize >
        subj.no_of_hours_per_week
      )
        return false;
      return true;
    }

    if (class_timetables[classId][day][hour] !== EMPTY_SLOT) return false;
    if (!facultyById.has(combo.faculty_id)) return false;
    if (faculty_timetables[combo.faculty_id][day][hour] !== EMPTY_SLOT) return false;

    // faculty daily hours (count occupied slots) - combined will be handled specially by caller
    const facultyDayHours = faculty_timetables[combo.faculty_id][day].filter(
      (x) => x !== EMPTY_SLOT && x !== BREAK_SLOT
    ).length;
    if (facultyDayHours + blockSize > 4) return false;

    if (
      !check_subject_same_hour_different_days_constraint(
        classId,
        subj._id,
        day,
        hour
      )
    )
      return false;
    if (!check_no_gaps_constraint(classId, day, hour)) return false;

    if (
      subject_hours_assigned_per_class[classId][subj._id] >=
      subj.no_of_hours_per_week
    )
      return false;

    // continuous hours check for faculty
    if (!check_continuous_hours(combo.faculty_id, day, hour, blockSize)) return false;

    return true;
  }

  // --- Core recursive generator ---
  function generate_schedule_for_slot(day, hour, classIndex) {
    if (day >= MAX_DAYS) return true;

    if (BREAK_HOURS.includes(hour)) {
      if (classIndex === classIds.length) {
        let nextDay = day,
          nextHour = hour + 1;
        if (nextHour === HOURS_PER_DAY) {
          nextHour = 0;
          nextDay++;
        }
        return generate_full_timetable_recursive(nextDay, nextHour);
      }
      return generate_schedule_for_slot(day, hour, classIndex + 1);
    }

    if (classIndex === classIds.length) {
      let nextDay = day,
        nextHour = hour + 1;
      if (nextHour === HOURS_PER_DAY) {
        nextHour = 0;
        nextDay++;
      }
      return generate_full_timetable_recursive(nextDay, nextHour);
    }

    const classId = classIds[classIndex];
    const cls = classById.get(classId);
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);

    if (day >= daysPerWeek) {
      return generate_schedule_for_slot(day, hour, classIndex + 1);
    }

    if (class_assigned_hours(classId) >= cls.total_class_hours) {
      return generate_schedule_for_slot(day, hour, classIndex + 1);
    }

    // If this particular slot is fixed for this class, skip placing anything else here
    const fixed = getFixedSlot(classId, day, hour);
    if (fixed) {
      // slot already occupied by fixed combo; just advance to next class
      return generate_schedule_for_slot(day, hour, classIndex + 1);
    }

    const candidates = [];
    for (const combo_id of cls.assigned_teacher_subject_combos) {
      const combo = comboByMongoId.get(String(combo_id));
      if (!combo) continue;
      const subj = subjectById.get(combo.subject_id);
      if (!subj) continue;
      const rem =
        subj.no_of_hours_per_week -
        (subject_hours_assigned_per_class[classId][subj._id] || 0);
      if (rem > 0)
        candidates.push({
          combo_id: combo._id,
          rem,
          subj,
          combo,
        });
    }

    // Sort candidates: labs first, then higher remaining, then faculty load heuristic
    candidates.sort((a, b) => {
      if (a.subj.type === "lab" && b.subj.type !== "lab") return -1;
      if (b.subj.type === "lab" && a.subj.type !== "lab") return 1;

      if (b.rem !== a.rem) return b.rem - a.rem;

      // prefer combos where faculty currently has fewer hours today (to approach 4)
      const facultyA = faculty_timetables[a.combo.faculty_id][day].filter(
        (x) => x !== EMPTY_SLOT && x !== BREAK_SLOT
      ).length;
      const facultyB = faculty_timetables[b.combo.faculty_id][day].filter(
        (x) => x !== EMPTY_SLOT && x !== BREAK_SLOT
      ).length;
      if (facultyA !== facultyB) return facultyA - facultyB;

      return 0;
    });

    for (const cand of candidates) {
      const combo_id = String(cand.combo_id);
      const combo = cand.combo;
      const subj = cand.subj;

      if (subj.type === "lab") {
        const blockSize = subj.no_of_hours_per_week;

        // skip if any of the block hours are fixed to another combo
        let conflictFixed = false;
        for (let h = hour; h < hour + blockSize; h++) {
          const f = getFixedSlot(classId, day, h);
          if (f && f.comboId !== combo_id) { conflictFixed = true; break; }
        }
        if (conflictFixed) continue;

        if (is_placement_valid(classId, day, hour, combo_id, blockSize)) {
          for (let h = hour; h < hour + blockSize; h++) {
            class_timetables[classId][day][h] = combo_id;
            faculty_timetables[combo.faculty_id][day][h] = combo_id;
            subject_hours_assigned_per_class[classId][subj._id]++;
          }
          daily_hours_assigned[classId][day] += blockSize;

          if (generate_schedule_for_slot(day, hour, classIndex + 1)) return true;

          for (let h = hour; h < hour + blockSize; h++) {
            subject_hours_assigned_per_class[classId][subj._id]--;
            faculty_timetables[combo.faculty_id][day][h] = EMPTY_SLOT;
            class_timetables[classId][day][h] = EMPTY_SLOT;
          }
          daily_hours_assigned[classId][day] -= blockSize;
        }
      } else {
        // possible combined scenario?
        const combinedGroup = (subj.combined_classes || []).map(String);
        const isInCombined = combinedGroup.includes(classId);

        if (isInCombined && combinedGroup.length > 0) {
          // Attempt to place as a combined slot across all classes in the group
          // But first verify that the combo is valid for all classes in the group
          const eligible = combinedGroup.every((cid) => {
            const c = classById.get(cid);
            if (!c) return false;
            return c.assigned_teacher_subject_combos.some((cbid) => String(cbid) === String(combo._id));
          });
          if (!eligible) {
            // cannot combine using this exact combo - fall back to normal placement
          } else {
            // check combined placement feasibility
            if (can_place_combined(combo, subj, combinedGroup, day, hour, 1)) {
              // place into all classes, but mark faculty only once
              for (const otherClass of combinedGroup) {
                class_timetables[otherClass][day][hour] = combo._id;
                subject_hours_assigned_per_class[otherClass][subj._id]++;
                daily_hours_assigned[otherClass][day]++;
                setFixedSlot(otherClass, day, hour, combo._id); // mark as occupied/fixed for this run
              }
              faculty_timetables[combo.faculty_id][day][hour] = combo._id;

              if (generate_schedule_for_slot(day, hour, classIndex + 1)) return true;

              // rollback
              for (const otherClass of combinedGroup) {
                subject_hours_assigned_per_class[otherClass][subj._id]--;
                class_timetables[otherClass][day][hour] = EMPTY_SLOT;
                daily_hours_assigned[otherClass][day]--;
                // remove fixedMap entry set earlier
                fixedMap.delete(`${otherClass}|${day}|${hour}`);
              }
              faculty_timetables[combo.faculty_id][day][hour] = EMPTY_SLOT;
            }
          }
        }

        // non combined single-hour placement
        // check fixed for this single hour
        const fixedHere = getFixedSlot(classId, day, hour);
        if (fixedHere && fixedHere.comboId !== combo_id) continue;

        if (is_placement_valid(classId, day, hour, combo_id, 1)) {
          class_timetables[classId][day][hour] = combo_id;
          faculty_timetables[combo.faculty_id][day][hour] = combo_id;
          subject_hours_assigned_per_class[classId][subj._id]++;
          daily_hours_assigned[classId][day]++;

          if (generate_schedule_for_slot(day, hour, classIndex + 1)) return true;

          subject_hours_assigned_per_class[classId][subj._id]--;
          faculty_timetables[combo.faculty_id][day][hour] = EMPTY_SLOT;
          class_timetables[classId][day][hour] = EMPTY_SLOT;
          daily_hours_assigned[classId][day]--;
        }
      }
    }

    // if we didn't place anything, move to next class
    return generate_schedule_for_slot(day, hour, classIndex + 1);
  }

  function generate_full_timetable_recursive(day, hour) {
    const stateKey = JSON.stringify({
      day,
      hour,
      classHours: classIds.map((cid) => class_assigned_hours(cid)),
    });
    if (visited.has(stateKey)) return false;
    visited.add(stateKey);

    if (day === MAX_DAYS) return true;
    if (hour >= HOURS_PER_DAY) return generate_full_timetable_recursive(day + 1, 0);
    return generate_schedule_for_slot(day, hour, 0);
  }

  const ok = generate_full_timetable_recursive(0, 0);
  if (!ok) {
    console.error("❌ Failed to generate timetable!");
    return {
      ok: false,
      error:
        "Failed to generate timetable. Try relaxing constraints or check input.",
    };
  }

  console.log("🎉 Successfully generated timetable");

  const out_class_timetables = {};
  for (const cls of classes) out_class_timetables[cls._id] = class_timetables[cls._id];
  const out_faculty_timetables = {};
  for (const f of faculties)
    out_faculty_timetables[f._id] = faculty_timetables[f._id];

  // Additionally provide a summary of faculty daily hours (helps verify 'exactly 4' target)
  const faculty_daily_hours = {};
  for (const f of faculties) {
    faculty_daily_hours[f._id] = faculty_timetables[f._id].map((row) =>
      row.filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length
    );
  }

  return {
    ok: true,
    class_timetables: out_class_timetables,
    faculty_timetables: out_faculty_timetables,
    faculty_daily_hours,
  };
}

// export
export default { generate };

// Debug helpers kept below (not duplicated into export)
function printTimetable(classId, timetable, classById) {
  console.log(`\n📅 Timetable for ${classById.get(classId).name}`);
  timetable.forEach((row, d) => {
    console.log(
      `Day ${d + 1}:`,
      row.map((slot) => (slot === -1 ? "—" : slot === "BREAK" ? "B" : slot)).join(" | ")
    );
  });
}

function scoreTimetable(class_timetables, classIds) {
  let score = 0;
  for (const cid of classIds) {
    const timetable = class_timetables[cid];
    for (const day of timetable) {
      const first = day.findIndex((x) => x !== -1 && x !== "BREAK");
      const last = day
        .map((x, i) => ({ x, i }))
        .reverse()
        .find(({ x }) => x !== -1 && x !== "BREAK")?.i;
      if (first !== -1 && last !== undefined) {
        score +=
          last -
          first +
          1 -
          day.filter((x) => x !== -1 && x !== "BREAK").length;
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
