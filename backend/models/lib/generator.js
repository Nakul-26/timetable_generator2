// lib/generator.js
function generate({
  faculties,
  subjects,
  classes,
  combos,
  DAYS_PER_WEEK = 5,
  HOURS_PER_DAY = 9,
  BREAK_HOURS = [2, 5], // tea break at 3rd hour, lunch break at 6th hour (0-based index)
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

  // --- Combo lookup maps ---
  const comboByMongoId = new Map(combos.map((c) => [c._id, c]));
  const comboByBizId = new Map(
    combos.filter((c) => c.id).map((c) => [c.id, c])
  );

  // --- Other maps ---
  const facultyById = new Map(faculties.map((f) => [f._id, f]));
  const subjectById = new Map(subjects.map((s) => [s._id, s]));

  // --- Timetable structures ---
  const class_timetables = {};
  const faculty_timetables = {};
  const subject_hours_assigned_per_class = {};

  for (const cls of classes) {
    class_timetables[cls._id] = Array.from({ length: DAYS_PER_WEEK }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
    subject_hours_assigned_per_class[cls._id] = {};
    for (const s of subjects)
      subject_hours_assigned_per_class[cls._id][s._id] = 0;
  }
  for (const f of faculties) {
    faculty_timetables[f._id] = Array.from({ length: DAYS_PER_WEEK }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
  }

  // --- Helpers to resolve combo ids ---
  function toComboMongoId(value) {
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
  function check_teacher_gap_constraint(faculty_id, day, hour) {
    const ft = faculty_timetables[faculty_id];
    if (!ft) return false;

    const requiredGap = 2;

    function scanDirection(dir) {
      let nonBreakCount = 0;
      let i = hour + dir;
      while (i >= 0 && i < HOURS_PER_DAY) {
        if (BREAK_HOURS.includes(i)) {
          i += dir;
          continue;
        }
        const cell = ft[day][i];
        if (cell !== EMPTY_SLOT && cell !== BREAK_SLOT) {
          return nonBreakCount >= requiredGap;
        }
        nonBreakCount += 1;
        if (nonBreakCount >= requiredGap) return true;
        i += dir;
      }
      return true;
    }

    return scanDirection(-1) && scanDirection(+1);
  }

  function check_subject_same_hour_different_days_constraint(
    classId,
    subject_id,
    day,
    hour
  ) {
    const ct = class_timetables[classId];
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
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

  function is_placement_valid(classId, day, hour, combo_id) {
    if (BREAK_HOURS.includes(hour)) return false;

    const combo = comboByMongoId.get(String(combo_id));
    if (!combo) return false;
    const subj = subjectById.get(combo.subject_id);
    if (!subj) return false;

    if (class_timetables[classId][day][hour] !== EMPTY_SLOT) return false;
    if (!facultyById.has(combo.faculty_id)) return false;
    if (faculty_timetables[combo.faculty_id][day][hour] !== EMPTY_SLOT)
      return false;
    if (!check_teacher_gap_constraint(combo.faculty_id, day, hour)) return false;
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

    return true;
  }

  function class_assigned_hours(classId) {
    let total = 0;
    for (const s of subjects)
      total += subject_hours_assigned_per_class[classId][s._id] || 0;
    return total;
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
      console.log(
        `ℹ️  Auto-assigned ${auto.length} combos to class ${cls.name} by semester ${cls.sem}`
      );
    } else {
      const originalList = Array.isArray(cls.assigned_teacher_subject_combos)
        ? [...cls.assigned_teacher_subject_combos]
        : cls.assigned_teacher_subject_combos;

      cls.assigned_teacher_subject_combos = resolveAssignedCombos(
        cls.assigned_teacher_subject_combos
      );

      if (
        Array.isArray(originalList) &&
        originalList.length > 0 &&
        cls.assigned_teacher_subject_combos.length === 0
      ) {
        console.warn(
          `⚠️  Class ${cls.name}: provided assigned_teacher_subject_combos (${JSON.stringify(
            originalList
          )}) could not be resolved. No combos will be used for this class.`
        );
      } else {
        console.log(
          `ℹ️  Class ${cls.name} resolved combos:`,
          cls.assigned_teacher_subject_combos
        );
      }
    }

    // Compute total_class_hours
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

    if (tot === 0) {
      console.warn(
        `⚠️  Class ${cls.name} has no valid combos or subjects with hours. It will be skipped in scheduling.`
      );
    } else {
      console.log(`📘 Class ${cls.name}: total_class_hours = ${cls.total_class_hours}`);
    }
  }

  // --- Only include classes that need scheduling ---
  const classIds = classes.filter(c => c.total_class_hours > 0).map(c => c._id);
  console.log(`📊 Scheduling ${classIds.length}/${classes.length} classes (skipped ${classes.length - classIds.length})`);

  // --- Backtracking core ---
  function generate_schedule_for_slot(day, hour, classIndex) {
    if (day >= DAYS_PER_WEEK) return true;

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
    const cls = classes.find((c) => c._id === classId);

    if (class_assigned_hours(classId) >= cls.total_class_hours) {
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
          subj: subj.name,
          comboName: combo.combo_name,
        });
    }

    console.log(
      `➡️ Day ${day}, Hour ${hour}, Class ${cls.name}: candidates =`,
      candidates.map((c) => `${c.comboName}/${c.subj} (rem ${c.rem})`)
    );

    candidates.sort((a, b) => b.rem - a.rem);

    for (const cand of candidates) {
      const combo_id = String(cand.combo_id);
      const combo = comboByMongoId.get(combo_id);
      const subj = subjectById.get(combo.subject_id);

      if (is_placement_valid(classId, day, hour, combo_id)) {
        console.log(
          `✅ Place ${combo.combo_name} [${subj.name}] for ${cls.name} @ D${day} H${hour}`
        );
        class_timetables[classId][day][hour] = combo_id;
        faculty_timetables[combo.faculty_id][day][hour] = combo_id;
        subject_hours_assigned_per_class[classId][subj._id]++;

        if (generate_schedule_for_slot(day, hour, classIndex + 1)) return true;

        console.log(
          `↩️ Backtrack ${combo.combo_name} for ${cls.name} @ D${day} H${hour}`
        );
        subject_hours_assigned_per_class[classId][subj._id]--;
        faculty_timetables[combo.faculty_id][day][hour] = EMPTY_SLOT;
        class_timetables[classId][day][hour] = EMPTY_SLOT;
      }
    }

    return generate_schedule_for_slot(day, hour, classIndex + 1);
  }

  function generate_full_timetable_recursive(day, hour) {
    if (day === DAYS_PER_WEEK) return true;
    if (hour >= HOURS_PER_DAY)
      return generate_full_timetable_recursive(day + 1, 0);
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
  for (const cls of classes)
    out_class_timetables[cls._id] = class_timetables[cls._id];
  const out_faculty_timetables = {};
  for (const f of faculties)
    out_faculty_timetables[f._id] = faculty_timetables[f._id];

  return {
    ok: true,
    class_timetables: out_class_timetables,
    faculty_timetables: out_faculty_timetables,
  };
}

export default { generate };
