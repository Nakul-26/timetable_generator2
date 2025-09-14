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

  // --- Maps ---
  const comboByMongoId = new Map(combos.map((c) => [c._id, c]));
  const comboByBizId = new Map(combos.filter((c) => c.id).map((c) => [c.id, c]));
  const facultyById = new Map(faculties.map((f) => [f._id, f]));
  const subjectById = new Map(subjects.map((s) => [s._id, s]));
  const classById = new Map(classes.map((c) => [c._id, c]));

  // --- Timetable structures ---
  const class_timetables = {};
  const faculty_timetables = {};
  const subject_hours_assigned_per_class = {};
  const daily_hours_assigned = {}; // daily_hours_assigned[classId][day] = number

  for (const cls of classes) {
    class_timetables[cls._id] = Array.from({ length: DAYS_PER_WEEK }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
    subject_hours_assigned_per_class[cls._id] = {};
    daily_hours_assigned[cls._id] = Array.from({ length: DAYS_PER_WEEK }, () => 0);
    for (const s of subjects) subject_hours_assigned_per_class[cls._id][s._id] = 0;
  }
  for (const f of faculties) {
    faculty_timetables[f._id] = Array.from({ length: DAYS_PER_WEEK }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
  }

  // --- Helpers ---
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
    return Math.ceil((cls.total_class_hours || 0) / DAYS_PER_WEEK);
  }

  function is_placement_valid(classId, day, hour, combo_id, blockSize = 1) {
    if (BREAK_HOURS.includes(hour)) return false;
    const combo = comboByMongoId.get(String(combo_id));
    if (!combo) return false;
    const subj = subjectById.get(combo.subject_id);
    if (!subj) return false;

    const cls = classById.get(classId);
    const target = daily_target_for_class(classId);
    if (daily_hours_assigned[classId][day] + blockSize > target) {
      return false;
    }

    if (subj.type === "lab") {
      if (!can_place_lab_block(classId, combo.faculty_id, day, hour, blockSize))
        return false;
      if (!check_teacher_gap_constraint(combo.faculty_id, day, hour)) return false;
      if (!check_teacher_gap_constraint(combo.faculty_id, day, hour + blockSize - 1))
        return false;
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
    const availableSlots = DAYS_PER_WEEK * (HOURS_PER_DAY - BREAK_HOURS.length);
    if (cls.total_class_hours > availableSlots) {
      return {
        ok: false,
        error: `Class ${cls.name} has more required hours than available slots.`,
      };
    }
  }

  // Caching visited states
  const visited = new Set();

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
    const cls = classById.get(classId);

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
          subj,
          combo,
        });
    }

    // Smarter sorting
        // --- added helper: count filled slots for a class on a day (not BREAK/EMPTY)
    function countFilledInDay(classId, day) {
      const dayRow = class_timetables[classId][day];
      let cnt = 0;
      for (let i = 0; i < dayRow.length; i++) {
        const v = dayRow[i];
        if (v !== EMPTY_SLOT && v !== BREAK_SLOT) cnt++;
      }
      return cnt;
    }

    // Smarter sorting (keeps your original priorities, but prefer placements that reduce gaps)
    // --- improved candidate sorting ---
    candidates.sort((a, b) => {
      // labs always come first
      if (a.subj.type === "lab" && b.subj.type !== "lab") return -1;
      if (b.subj.type === "lab" && a.subj.type !== "lab") return 1;

      // prefer subjects with more remaining hours
      if (b.rem !== a.rem) return b.rem - a.rem;

      // gap heuristic: prefer placements that minimize projected gaps
      function gapHeuristic(cand) {
        const cid = classId;
        const dayRow = class_timetables[cid][day];
        let first = -1, last = -1, filledCount = 0;

        for (let i = 0; i < dayRow.length; i++) {
          const v = dayRow[i];
          if (v !== EMPTY_SLOT && v !== BREAK_SLOT) {
            if (first === -1) first = i;
            last = i;
            filledCount++;
          }
        }
        const projFirst = first === -1 ? hour : Math.min(first, hour);
        const projLast = last === -1 ? hour : Math.max(last, hour);

        let breakCount = 0;
        for (let i = projFirst; i <= projLast; i++) {
          if (BREAK_HOURS.includes(i)) breakCount++;
        }

        const projFilled = filledCount + ((dayRow[hour] !== EMPTY_SLOT && dayRow[hour] !== BREAK_SLOT) ? 0 : 1);
        const intervalLength = projLast - projFirst + 1;
        return intervalLength - breakCount - projFilled; // lower is better
      }

      const gapA = gapHeuristic(a);
      const gapB = gapHeuristic(b);
      if (gapA !== gapB) return gapA - gapB;

      // daily target bias: prefer candidates that bring us closer to daily goal
      const target = daily_target_for_class(classId);
      const used = daily_hours_assigned[classId][day];
      const diffA = Math.abs((used + 1) - target);
      const diffB = Math.abs((used + 1) - target);
      if (diffA !== diffB) return diffA - diffB;

      // faculty availability fallback
      const freeA = faculty_timetables[a.combo.faculty_id].flat().filter((x) => x === EMPTY_SLOT).length;
      const freeB = faculty_timetables[b.combo.faculty_id].flat().filter((x) => x === EMPTY_SLOT).length;
      return freeA - freeB;
    });

    for (const cand of candidates) {
      const combo_id = String(cand.combo_id);
      const combo = cand.combo;
      const subj = cand.subj;

      if (subj.type === "lab") {
        const blockSize = subj.no_of_hours_per_week;

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

    if (day === DAYS_PER_WEEK) return true;
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

  return {
    ok: true,
    class_timetables: out_class_timetables,
    faculty_timetables: out_faculty_timetables,
  };
}

// Debug Visualization
function printTimetable(classId, timetable, classById) {
  console.log(`\\n📅 Timetable for ${classById.get(classId).name}`);
  timetable.forEach((row, d) => {
    console.log(
      `Day ${d + 1}:`,
      row.map((slot) =>
        slot === -1 ? "—" : slot === "BREAK" ? "B" : slot
      ).join(" | ")
    );
  });
}

// Score timetable (lower is better)
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

// Shuffle helper
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export default { generate, printTimetable, scoreTimetable, shuffle };
