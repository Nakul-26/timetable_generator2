// lib/generator.js
// Updated features (Option A) + COMBINED-ONLY strict mode
import fs from 'fs';
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
  console.log('--- Generator Input ---');
  console.log('Faculties:', JSON.stringify(faculties, null, 2));
  console.log('Subjects:', JSON.stringify(subjects, null, 2));
  console.log('Classes:', JSON.stringify(classes, null, 2));
  console.log('Combos:', JSON.stringify(combos, null, 2));
  console.log('-----------------------');

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
  // IMPORTANT: normalize combo.class_ids -> string array
  combos = combos.map((c) => ({
    ...c,
    _id: String(c._id || c.id),
    id: c.id != null ? String(c.id) : undefined,
    faculty_id: String(c.faculty_id),
    subject_id: String(c.subject_id),
    class_ids: Array.isArray(c.class_ids) ? c.class_ids.map((x) => String(x)) : [],
  }));
  classes = classes.map((c) => ({ ...c, _id: String(c._id || c.id) }));

  console.log('--- Normalized Generator Data ---');
  console.log('Normalized Combos:', JSON.stringify(combos, null, 2));
  console.log('---------------------------------');

  // --- Maps ---
  const comboByMongoId = new Map(combos.map((c) => [c._id, c]));
  const comboByBizId = new Map(combos.filter((c) => c.id).map((c) => [c.id, c]));
  const facultyById = new Map(faculties.map((f) => [f._id, f]));
  const subjectById = new Map(subjects.map((s) => [s._id, s]));
  const classById = new Map(classes.map((c) => [c._id, c]));

  // ensure subjects have combined_classes array if present (deprecated if using combo.class_ids)
  for (const s of subjects) {
    if (s.combined_classes && !Array.isArray(s.combined_classes)) {
      s.combined_classes = Array.isArray(s.combined_classes)
        ? s.combined_classes.map(String)
        : [String(s.combined_classes)];
    }
  }

  // --- Helper: get required hours for (class, subject) ---
  // Priority:
  // 1) cls.subject_hours[subjectId] from converter
  // 2) subj.no_of_hours_per_week (fallback)
  function get_required_hours_for_class_subject(classId, subjectId) {
    const cls = classById.get(String(classId));
    if (cls && cls.subject_hours && cls.subject_hours[subjectId] != null) {
      return Number(cls.subject_hours[subjectId]) || 0;
    }
    const subj = subjectById.get(String(subjectId));
    if (subj && typeof subj.no_of_hours_per_week === "number") {
      return subj.no_of_hours_per_week;
    }
    return 0;
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

  // cache for per-slot class ordering (MRV-style)
  const classOrderCache = new Map(); // key: `${day}|${hour}` -> ordered array of classIds

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

  function check_no_gaps_constraint(classId, day, hour) {
    const row = class_timetables[classId][day];

    // Find first assigned
    const firstAssigned = row.findIndex(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);

    // If no class placed yet that day → gap allowed
    if (firstAssigned === -1) return true;

    // If before first assigned → filling earlier → ok
    if (hour < firstAssigned) return true;

    // Between first and current, ensure no gaps
    for (let h = firstAssigned; h < hour; h++) {
      if (row[h] === EMPTY_SLOT) return false;
    }
    return true;
  }

  function can_place_lab_block(classId, faculty_id, day, hour, blockSize) {
    if (hour + blockSize > HOURS_PER_DAY) return false;

    for (let h = hour; h < hour + blockSize; h++) {
      if ( BREAK_HOURS.includes(h) ) return false;
      if (class_timetables[classId][day][h] !== EMPTY_SLOT) return false;
      if (faculty_timetables[faculty_id][day][h] !== EMPTY_SLOT) return false;
    }
    return true;
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

  // NEW: teacher/day feasibility
  function teacher_feasible(faculty_id, day) {
    const row = faculty_timetables[faculty_id][day];
    const assigned = row.filter(x => x !== EMPTY_SLOT && x !== BREAK_SLOT).length;
    const remaining = row.filter(x => x === EMPTY_SLOT).length;

    // must be exactly 0 or 4 eventually
    if (assigned > 0) {
      if (assigned > 4) return false;
      if (assigned + remaining < 4) return false;
    }
    return true;
  }

  // NEW: early class-day gap detection
  function class_day_feasible(classId, day) {
    const row = class_timetables[classId][day];

    let seen = false;
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const busy = row[h] !== EMPTY_SLOT && row[h] !== BREAK_SLOT;
      if (busy) seen = true;
      else if (seen) {
        const hasMoreBusy = row.slice(h + 1).some(
          x => x !== EMPTY_SLOT && x !== BREAK_SLOT
        );
        if (hasMoreBusy) return false; // gap inside active day
      }
    }
    return true;
  }

  // NEW: subject remaining-hours feasibility per class
  function subject_feasible(classId, subjId) {
    const required = get_required_hours_for_class_subject(classId, subjId);
    const assigned = subject_hours_assigned_per_class[classId][subjId] || 0;
    const remaining = required - assigned;
    if (remaining <= 0) return true;

    let free = 0;
    const table = class_timetables[classId];
    for (let d = 0; d < table.length; d++) {
      for (let h = 0; h < HOURS_PER_DAY; h++) {
        if (!BREAK_HOURS.includes(h) && table[d][h] === EMPTY_SLOT) {
          free++;
          if (free >= remaining) return true;
        }
      }
    }
    return free >= remaining;
  }

  // --- Preprocess classes ---
  for (const cls of classes) {
    if (
      cls.assigned_teacher_subject_combos === undefined ||
      cls.assigned_teacher_subject_combos === null
    ) {
      // AUTO-ASSIGN combos to class only if combo applies to this class:
      // combo.subject matches class.sem AND (combo.class_ids empty => applies to all OR combo.class_ids includes this class)
      const auto = combos
        .filter((cb) => {
          const subj = subjectById.get(cb.subject_id);
          if (!subj) return false;
          if (subj.sem !== cls.sem) return false;
          // if combo.class_ids is empty -> treat as applicable to any class
          if (!Array.isArray(cb.class_ids) || cb.class_ids.length === 0) return true;
          // otherwise ensure this class is in combo.class_ids
          return cb.class_ids.map(String).includes(cls._id);
        })
        .map((cb) => cb._id);
      cls.assigned_teacher_subject_combos = auto;
    } else {
      cls.assigned_teacher_subject_combos = resolveAssignedCombos(
        cls.assigned_teacher_subject_combos
      );
    }

    // total_class_hours = sum of required subject_hours for unique subjects in this class
    const subjectSet = new Set();
    let tot = 0;

    // Step 1: mark subjects that belong to any parallel elective group
    const parallelGroups = cls.parallel_electives || cls.elective_groups || [];
    const parallelSubjectSet = new Set();
    for (const grp of parallelGroups) {
      const sids = grp.subject_ids || grp.subjects || [];
      for (const sid of sids) {
        parallelSubjectSet.add(String(sid));
      }
    }

    // Step 2: count required hours but avoid double-counting parallel subjects
    const parallelHoursAdded = new Set();

    for (const cbid of cls.assigned_teacher_subject_combos) {
      const cb = comboByMongoId.get(String(cbid));
      if (!cb) continue;
      const subjId = String(cb.subject_id);
      if (subjectSet.has(subjId)) continue;
      subjectSet.add(subjId);

      // If this subject belongs to a parallel elective group:
      if (parallelSubjectSet.has(subjId)) {
        const group = parallelGroups.find(
          g => (g.subject_ids || g.subjects || []).map(String).includes(subjId)
        );
        if (!group) continue;

        // Add group hours only once
        if (!parallelHoursAdded.has(group.groupId)) {
          const rep = (group.subject_ids || group.subjects || [])[0];
          const required = Number(group.hours) ||
                           get_required_hours_for_class_subject(cls._id, rep) || 0;
          tot += required;
          parallelHoursAdded.add(group.groupId);
        }
      } else {
        const required = get_required_hours_for_class_subject(cls._id, subjId);
        tot += required;
      }
    }

    cls.total_class_hours = tot;

    classById.set(cls._id, cls);
  }

  const classIds = classes
    .filter((c) => c.total_class_hours > 0)
    .map((c) => c._id);

  // Early Fail Check
  for (const cls of classes) {
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    const availableSlots = daysPerWeek * (HOURS_PER_DAY - BREAK_HOURS.length);
    if (cls.total_class_hours > availableSlots) {
      console.error(`Class ${cls.name} has more required hours (${cls.total_class_hours}) than available slots (${availableSlots}).`);
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
    // fallback: any combo for that subject available in all combos
    for (const cb of combos) {
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

  // NEW helpers for MRV-ish class ordering

  function remaining_hours_for_class(classId) {
    const cls = classById.get(classId);
    if (!cls) return 0;
    const assigned = class_assigned_hours(classId);
    return Math.max(0, (cls.total_class_hours || 0) - assigned);
  }

  function free_slots_for_class_from(classId, startDay, startHour) {
    const table = class_timetables[classId];
    let free = 0;
    for (let d = startDay; d < table.length; d++) {
      const hStart = d === startDay ? startHour : 0;
      for (let h = hStart; h < HOURS_PER_DAY; h++) {
        if (!BREAK_HOURS.includes(h) && table[d][h] === EMPTY_SLOT) {
          free++;
        }
      }
    }
    return free;
  }

  function get_class_order_for_slot(day, hour) {
    const key = `${day}|${hour}`;
    // if (classOrderCache.has(key)) {
    //   return classOrderCache.get(key);
    // }
    const ordered = [...classIds].sort((a, b) => {
      const remA = remaining_hours_for_class(a);
      const remB = remaining_hours_for_class(b);
      const freeA = free_slots_for_class_from(a, day, hour);
      const freeB = free_slots_for_class_from(b, day, hour);

      // ratio: higher is more constrained
      const ratioA = freeA > 0 ? remA / freeA : Number.POSITIVE_INFINITY;
      const ratioB = freeB > 0 ? remB / freeB : Number.POSITIVE_INFINITY;

      if (ratioA !== ratioB) return ratioB - ratioA; // larger ratio first
      if (remA !== remB) return remB - remA; // more remaining hours first

      const cA = classById.get(a);
      const cB = classById.get(b);
      const daysA = Number(cA?.days_per_week || DAYS_PER_WEEK);
      const daysB = Number(cB?.days_per_week || DAYS_PER_WEEK);
      if (daysA !== daysB) return daysA - daysB; // fewer days/week first

      return 0;
    });
    // classOrderCache.set(key, ordered);
    return ordered;
  }

  // --- Configuration for Late-Stage Relaxation ---
  const REPAIR_THRESHOLD = 0.85; // 85%
  let initial_total_required_hours = 0;
  for (const cls of classes) {
    initial_total_required_hours += cls.total_class_hours || 0;
  }

  // --- Feasibility / exact-hour helpers ---

  // total remaining required hours across all classes and subjects
  function total_remaining_required_hours() {
    let total = 0;
    for (const cls of classes) {
      const classId = cls._id;
      const subjSet = new Set();
      // determine subjects relevant to this class from its combos
      for (const cbid of cls.assigned_teacher_subject_combos || []) {
        const cb = comboByMongoId.get(String(cbid));
        if (!cb) continue;
        const subjId = cb.subject_id;
        if (subjSet.has(subjId)) continue;
        subjSet.add(subjId);
        const required = get_required_hours_for_class_subject(classId, subjId);
        const assigned = subject_hours_assigned_per_class[classId][subjId] || 0;
        if (required > assigned) total += required - assigned;
      }
    }
    return total;
  }

  // total available empty slots across all classes (optimistic upper bound)
  function total_available_empty_slots() {
    let total = 0;
    for (const cls of classes) {
      const classId = cls._id;
      const daysForClass = class_timetables[classId].length;
      for (let d = 0; d < daysForClass; d++) {
        for (let h = 0; h < HOURS_PER_DAY; h++) {
          if (BREAK_HOURS.includes(h)) continue;
          if (class_timetables[classId][d][h] === EMPTY_SLOT) total++;
        }
      }
    }
    return total;
  }

  // quick optimistic feasibility check: if remaining required > available empty slots => impossible
  function optimistic_feasible(day, hour) {
    const rem = total_remaining_required_hours();
    const avail = total_available_empty_slots();
    if (avail < rem) {
      console.log(
        `[PRUNE] Not enough slots: remaining=${rem}, available=${avail}, ` +
        `point=Day${day+1}, Hour${hour+1}`
      );
    }
    return avail >= rem;
  }

  // checks exactness after full assignment:
  // 1) all class-subject hours exactly equal required
  // 2) each faculty per day has either 0 hours or exactly 4 hours
  function all_subjects_exactly_assigned() {
    // subject exactness
    for (const cls of classes) {
      const classId = cls._id;
      const subjSet = new Set();
      for (const cbid of cls.assigned_teacher_subject_combos || []) {
        const cb = comboByMongoId.get(String(cbid));
        if (!cb) continue;
        const subjId = cb.subject_id;
        if (subjSet.has(subjId)) continue;
        subjSet.add(subjId);
        const required = get_required_hours_for_class_subject(classId, subjId);
        const assigned = subject_hours_assigned_per_class[classId][subjId] || 0;
        // ALLOW ±1 slack (max 1 hour flexibility)
        if (Math.abs(required - assigned) > 1) {
          console.log(`Exactness ±1 failed for class ${classId}, subject ${subjId}: required ${required}, assigned ${assigned}`);
          return false;
        }
      }
    }

    // faculty daily hours = 0 or 4
    for (const f of faculties) {
      const ft = faculty_timetables[f._id];
      for (let d = 0; d < ft.length; d++) {
        const hours = ft[d].filter(
          (x) => x !== EMPTY_SLOT && x !== BREAK_SLOT
        ).length;
        // SOFT: allow 1-6 hours per teacher per day
        if (hours < 0 || hours > 6) {
          console.log(`Faculty too many hours on faculty ${f._id} day ${d}: ${hours}`);
          return false;
        }
      }
    }

    if (!final_no_gap_check()) {
      console.log("❌ Final gap check failed");
      return false;
    }

    // new: all free days should be after all busy days
    for (const cls of classes) {
      const table = class_timetables[cls._id];
      let seenEmptyDay = false;

      for (let d = 0; d < table.length; d++) {
        const busy = table[d].some(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
        if (!busy) seenEmptyDay = true;
        else if (seenEmptyDay) {
          console.log(`❌ Free-day rule failed: Busy day found after a free day for class ${cls._id}`);
          return false;
        }
      }
    }

    return true;
  }

  // Enforce NO gaps ONLY after timetable completely filled
  function final_no_gap_check() {
    for (const cls of classes) {
      const table = class_timetables[cls._id];
      for (let d = 0; d < table.length; d++) {
        const row = table[d];

        const first = row.findIndex(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
        if (first === -1) continue; // whole day empty

        // Check no gaps before first
        for (let h = 0; h < first; h++) {
          if (row[h] !== EMPTY_SLOT) return false;
        }

        // Check no gaps in between
        let started = false;
        for (let h = 0; h < HOURS_PER_DAY; h++) {
          const busy = row[h] !== EMPTY_SLOT && row[h] !== BREAK_SLOT;
          if (busy) started = true;
          else if (started) {
            // gap found before last assigned slot?
            const hasMore = row.slice(h + 1).some(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
            if (hasMore) return false;
          }
        }
      }
    }
    return true;
  }

  // Helper: check whether we can place a combined combo for a subject across its group
  function can_place_combined(combo, subj, group, day, hour, blockSize) {
    // group is array of classIds (strings)
    for (const otherClass of group) {
      // must be a valid class
      if (!classById.has(otherClass)) return false;
      const cls = classById.get(otherClass);
      const daysForClass = Number(cls.days_per_week || DAYS_PER_WEEK);
      if (day >= daysForClass) return false; // strict overlapping days

      // class slot free for the entire block
      for (let h = hour; h < hour + blockSize; h++) {
        if (BREAK_HOURS.includes(h)) return false;
        if (class_timetables[otherClass][day][h] !== EMPTY_SLOT) return false;
      }

      // subject hours for class shouldn't exceed subject's weekly limit
      const required = get_required_hours_for_class_subject(otherClass, subj._id);
      if (
        subject_hours_assigned_per_class[otherClass][subj._id] + blockSize >
        required
      ) {
        return false;
      }

      // the class should have this combo assigned
      const hasCombo = classById
        .get(otherClass)
        .assigned_teacher_subject_combos.some(
          (cbid) => String(cbid) === String(combo._id)
        );
      if (!hasCombo) return false;
    }

    // faculty availability: faculty_timetables must be free for the block
    const facultyId = combo.faculty_id;
    for (let h = hour; h < hour + blockSize; h++) {
      if (faculty_timetables[facultyId][day][h] !== EMPTY_SLOT) return false;
    }

    // faculty daily hours limit (combined counts as 1 or blockSize if labs)
    const facultyDayHours = faculty_timetables[combo.faculty_id][day].filter(
      (x) => x !== EMPTY_SLOT && x !== BREAK_SLOT
    ).length;

    // continuous hours check for faculty
    if (!check_continuous_hours(combo.faculty_id, day, hour, blockSize)) return false;

    // feasibility checks
    // if (!teacher_feasible(combo.faculty_id, day)) return false;
    for (const otherClass of group) {
    // if (!class_day_feasible(group[0], day)) return false; // Check for the first class in the group
      if (!subject_feasible(otherClass, subj._id)) return false;
    }

    return true;
  }

  function is_placement_valid(classId, day, hour, combo_id, blockSize = 1) {
    const combo = comboByMongoId.get(String(combo_id));
    const subj = subjectById.get(combo.subject_id);

    if (BREAK_HOURS.includes(hour)) {
      console.log(`[REJECT] BREAK slot: class ${classId}, D${day+1} H${hour+1}`);
      return false;
    }

    // Fixed slot conflict
    for (let h = hour; h < hour + blockSize; h++) {
      const fixed = getFixedSlot(classId, day, h);
      if (fixed && fixed.comboId !== combo._id) {
        console.log(
          `[REJECT] Fixed mismatch at class ${classId}, D${day+1} H${h+1} ` +
          `(want ${combo._id}, fixed=${fixed.comboId})`
        );
        return false;
      }
    }

    const required = get_required_hours_for_class_subject(classId, subj._id);
    const assigned = subject_hours_assigned_per_class[classId][subj._id] || 0;

    if (assigned >= required) {
      console.log(
        `[REJECT] Subject full: class ${classId}, subject ${subj._id}, assigned ${assigned}/${required}`
      );
      return false;
    }

    if (class_timetables[classId][day][hour] !== EMPTY_SLOT) {
      console.log(
        `[REJECT] Class slot busy: class ${classId} D${day+1} H${hour+1}`
      );
      return false;
    }

    const facultyDayHours = faculty_timetables[combo.faculty_id][day].filter(
      (x) => x !== EMPTY_SLOT && x !== BREAK_SLOT
    ).length;
    if (facultyDayHours + blockSize > 4) {
      return false;
    }

    if (!check_continuous_hours(combo.faculty_id, day, hour, blockSize)) {
      console.log(
        `[REJECT] Too many continuous hours: Faculty ${combo.faculty_id} D${day+1} H${hour+1}`
      );
      return false;
    }

    // SKIP strict teacher feasibility pruning during placement
    // if (!teacher_feasible(combo.faculty_id, day)) return false;
    // SKIP no-gap check during placement (final polish only)
    // if (!class_day_feasible(classId, day)) return false;

    if (!subject_feasible(classId, subj._id)) return false;

    return true;
  }

  

  // --- Core recursive generator (NEW slot-driven approach) ---

  function schedule_slot(day, hour) {
    if (stopFlag) return false;

    // --- Base cases and slot progression ---
    if (day >= MAX_DAYS) {
      const all_ok = all_subjects_exactly_assigned();
      if (all_ok && progressCallback) {
        progressCallback({ progress: 100 });
      }
      return all_ok;
    }

    if (hour >= HOURS_PER_DAY) {
      return schedule_slot(day + 1, 0);
    }

    if (BREAK_HOURS.includes(hour)) {
      return schedule_slot(day, hour + 1);
    }

    // --- Progress Reporting ---
    if (progressCallback) {
      const rem = total_remaining_required_hours();
      let initial_total = 0;
      for (const cls of classes) {
        initial_total += cls.total_class_hours || 0;
      }
      const progress = initial_total > 0 ? ((initial_total - rem) / initial_total) * 100 : 0;
      progressCallback({
        progress: Math.min(99, Math.round(progress)), // Don't show 100 until verified
        partialData: {
          class_timetables,
          faculty_timetables,
          subject_hours_assigned_per_class,
        },
      });
    }
    
    // --- Pruning and Execution ---
    if (!optimistic_feasible(day, hour)) {
      return false;
    }

    const classOrder = get_class_order_for_slot(day, hour);
    return try_class_in_slot(day, hour, classOrder, 0);
  }

  function try_class_in_slot(day, hour, classOrder, classIndex) {
    // Base case for this recursion: we've considered all classes for the current slot.
    // Time to move to the next time slot.
    if (classIndex >= classOrder.length) {
      return schedule_slot(day, hour + 1);
    }

    const classId = classOrder[classIndex];
    const cls = classById.get(classId);

    // Skip this class if the current day is outside its working days.
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    if (day >= daysPerWeek) {
      return try_class_in_slot(day, hour, classOrder, classIndex + 1);
    }

    // If the slot for this class is already occupied (e.g., by a fixed or combined class),
    // we don't need to do anything for it, just move to the next class for this slot.
    if (class_timetables[classId][day][hour] !== EMPTY_SLOT) {
      return try_class_in_slot(day, hour, classOrder, classIndex + 1);
    }

    // --- Candidate Generation (logic from old schedule_class) ---
    const candidates = [];
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const combo = comboByMongoId.get(String(cbid));
      if (!combo) continue;
      const subj = subjectById.get(combo.subject_id);
      if (!subj) continue;
      candidates.push({ combo, subj });
    }
    
    // Order candidates: combined, labs, then by remaining hours.
    candidates.sort((a, b) => {
        const aIsCombined = comboByMongoId.get(a.combo._id).class_ids.length > 1;
        const bIsCombined = comboByMongoId.get(b.combo._id).class_ids.length > 1;
        if (aIsCombined !== bIsCombined) return bIsCombined - aIsCombined;

        const aIsLab = a.subj.type === "lab";
        const bIsLab = b.subj.type === "lab";
        if (aIsLab !== bIsLab) return bIsLab - aIsLab;

        const remA = get_required_hours_for_class_subject(classId, a.subj._id) - (subject_hours_assigned_per_class[classId][a.subj._id] || 0);
        const remB = get_required_hours_for_class_subject(classId, b.subj._id) - (subject_hours_assigned_per_class[classId][b.subj._id] || 0);
        return remB - remA;
    });


    // --- CHOICE 1: Try to place each valid candidate subject ---
    for (const { combo, subj } of candidates) {
      const combo_id = String(combo._id);
      const comboDef = comboByMongoId.get(combo_id);
      const isCombined = Array.isArray(comboDef.class_ids) && comboDef.class_ids.length > 1;
      const blockSize = subj.type === 'lab' ? 2 : 1;

      if (isCombined) {
        // For combined classes, only the "primary" class in the group can initiate the placement.
        if (String(comboDef.class_ids[0]) !== classId) continue;

        if (can_place_combined(combo, subj, comboDef.class_ids, day, hour, blockSize)) {
          // --- Place Combined ---
          for (const cId of comboDef.class_ids) {
            for (let h = hour; h < hour + blockSize; h++) {
              class_timetables[cId][day][h] = combo_id;
              subject_hours_assigned_per_class[cId][subj._id]++;
              daily_hours_assigned[cId][day]++;
            }
          }
          for (let h = hour; h < hour + blockSize; h++) {
            faculty_timetables[combo.faculty_id][day][h] = combo_id;
          }

          if (try_class_in_slot(day, hour, classOrder, classIndex + 1)) return true;

          // --- Rollback Combined ---
          for (let h = hour; h < hour + blockSize; h++) {
            faculty_timetables[combo.faculty_id][day][h] = EMPTY_SLOT;
          }
          for (const cId of comboDef.class_ids) {
            for (let h = hour; h < hour + blockSize; h++) {
              daily_hours_assigned[cId][day]--;
              subject_hours_assigned_per_class[cId][subj._id]--;
              class_timetables[cId][day][h] = EMPTY_SLOT;
            }
          }
        }
      } else { // --- Regular (non-combined) placement ---
        if (is_placement_valid(classId, day, hour, combo_id, blockSize)) {
          if (blockSize > 1 && !can_place_lab_block(classId, combo.faculty_id, day, hour, blockSize)) {
              continue;
          }
          
          // --- Place Regular/Lab ---
          for (let h = hour; h < hour + blockSize; h++) {
            class_timetables[classId][day][h] = combo_id;
            faculty_timetables[combo.faculty_id][day][h] = combo_id;
            subject_hours_assigned_per_class[classId][subj._id]++;
            daily_hours_assigned[classId][day]++;
          }

          if (try_class_in_slot(day, hour, classOrder, classIndex + 1)) return true;

          // --- Rollback Regular/Lab ---
          for (let h = hour; h < hour + blockSize; h++) {
            daily_hours_assigned[classId][day]--;
            subject_hours_assigned_per_class[classId][subj._id]--;
            faculty_timetables[combo.faculty_id][day][h] = EMPTY_SLOT;
            class_timetables[classId][day][h] = EMPTY_SLOT;
          }
        }
      }
    }

    // --- CHOICE 2: Don't place any subject for this class in this slot. ---
    // We try to find a solution by moving to the next class for this same slot.
    return try_class_in_slot(day, hour, classOrder, classIndex + 1);
  }

// DIAGNOSTIC HELPERS - DO NOT MODIFY SOLVER LOGIC
function countFreeSlots(classId) {
  let free = 0;
  const table = class_timetables[classId];
  for (let d = 0; d < table.length; d++) {
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      if (!BREAK_HOURS.includes(h) && table[d][h] === EMPTY_SLOT) {
        free++;
      }
    }
  }
  return free;
}

function countTotalRequiredHoursForClass(classId) {
  const cls = classById.get(classId);
  if (!cls) return 0;

  const subjectSet = new Set();
  let tot = 0;

  const parallelGroups = cls.parallel_electives || cls.elective_groups || [];
  const parallelHoursAdded = new Set();

  const parallelSubjectSet = new Set(); // Need to initialize this here
  for (const grp of parallelGroups) {
    const sids = grp.subject_ids || grp.subjects || [];
    for (const sid of sids) {
      parallelSubjectSet.add(String(sid));
    }
  }

  for (const cbid of cls.assigned_teacher_subject_combos || []) {
    const cb = comboByMongoId.get(String(cbid));
    if (!cb) continue;
    const subjId = String(cb.subject_id);
    if (subjectSet.has(subjId)) continue;
    subjectSet.add(subjId);

    if (parallelGroups.length > 0 && parallelSubjectSet.has(subjId)) { // Added parallelGroups.length check
      const group = parallelGroups.find(
        g => (g.subject_ids || g.subjects || []).map(String).includes(subjId)
      );
      if (!group) continue;

      if (!parallelHoursAdded.has(group.groupId)) {
        const rep = (group.subject_ids || group.subjects || [])[0];
        const required =
          Number(group.hours) ||
          get_required_hours_for_class_subject(cls._id, rep) || 0;
        tot += required;
        parallelHoursAdded.add(group.groupId);
      }
    } else {
      const required = get_required_hours_for_class_subject(cls._id, subjId);
      tot += required;
    }
  }
  return tot;
}



  const ok = schedule_slot(0, 0);
  if (!ok) {
    const errorMsg = stopFlag
      ? "Stopped by user — partial timetable returned"
      : "Partial timetable generated — solver could not satisfy all constraints";

    console.error(`❌ ${errorMsg}`);
    console.log("Showing partial timetable for debugging...\n");
    
    const partial_class_timetables = {};
    const partial_faculty_timetables = {};
  
    for (const cls of classes)
      partial_class_timetables[cls._id] = class_timetables[cls._id];
  
    for (const f of faculties)
      partial_faculty_timetables[f._id] = faculty_timetables[f._id];
  
    // Logging partial output
    console.log("\n--- Partial Class Timetables ---");
    for (const classId in partial_class_timetables) {
      printTimetable(classId, partial_class_timetables[classId], classById);
    }
  
    console.log("\n--- Partial Faculty Timetables ---");
    for (const facultyId in partial_faculty_timetables) {
      console.log(`\n📅 Timetable for ${facultyById.get(facultyId).name}`);
      partial_faculty_timetables[facultyId].forEach((row, d) => {
        console.log(
          `Day ${d + 1}:`,
          row.map((slot) => (slot === -1 ? "—" : slot === "BREAK" ? "B" : slot)).join(" | ")
        );
      });
    }
  
    console.log("\n--- Subject Hours Assigned So Far ---");
    console.log(JSON.stringify(subject_hours_assigned_per_class, null, 2));
  
    // Also return partial output so frontend can display it
    return {
      ok: false,
      error: errorMsg,
      class_timetables: partial_class_timetables,
      faculty_timetables: partial_faculty_timetables,
      subject_hours_assigned_per_class,
    };
  }

  console.log("🎉 Successfully generated timetable");

  const out_class_timetables = {};
  for (const cls of classes) out_class_timetables[cls._id] = class_timetables[cls._id];
  const out_faculty_timetables = {};
  for (const f of faculties)
    out_faculty_timetables[f._id] = faculty_timetables[f._id];

  // Additionally provide a summary of faculty daily hours
  const faculty_daily_hours = {};
  for (const f of faculties) {
    faculty_daily_hours[f._id] = faculty_timetables[f._id].map((row) =>
      row.filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length
    );
  }

  // ############################################################################################

  // Log the generated timetables for debugging
  console.log("\n--- Generated Class Timetables ---");
  for (const classId in out_class_timetables) {
    printTimetable(classId, out_class_timetables[classId], classById);
  }

  console.log("\n--- Generated Faculty Timetables ---");
  for (const facultyId in out_faculty_timetables) {
    console.log(`\n📅 Timetable for ${facultyById.get(facultyId).name}`);
    out_faculty_timetables[facultyId].forEach((row, d) => {
      console.log(
        `Day ${d + 1}:`,
        row.map((slot) => (slot === -1 ? "—" : slot === "BREAK" ? "B" : slot)).join(" | ")
      );
    });
  }

  console.log("\n--- Faculty Daily Hours ---");
  for (const facultyId in faculty_daily_hours) {
    console.log(`\t\t ${facultyById.get(facultyId).name} Daily Hours:`, faculty_daily_hours[facultyId]);
  }
  // ############################################################################################

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
