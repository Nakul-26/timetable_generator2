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

  if (DEBUG) {
    console.log(
      `🔹 Start: ${classes.length} classes, ${faculties.length} faculties, ${subjects.length} subjects, ${combos.length} combos`
    );
  }

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

  // --- Normalize to strings and ensure faculty_ids exists ---
  faculties = faculties.map((f) => ({ ...f, _id: String(f._id || f.id) }));
  subjects = subjects.map((s) => ({ ...s, _id: String(s._id || s.id) }));
  combos = combos.map((c) => ({
    ...c,
    _id: String(c._id || c.id),
    id: c.id != null ? String(c.id) : undefined,
    subject_id: String(c.subject_id),
    class_ids: Array.isArray(c.class_ids) ? c.class_ids.map(String) : [],
    // IMPORTANT: Every combo now has a faculty_ids array
    faculty_ids: Array.isArray(c.faculty_ids)
      ? c.faculty_ids.map(String)
      : c.faculty_id
      ? [String(c.faculty_id)]
      : [],
  }));
  classes = classes.map((c) => ({ ...c, _id: String(c._id || c.id) }));


  if (DEBUG) {
    console.log('--- Normalized Generator Data ---');
    console.log('Normalized Combos:', JSON.stringify(combos, null, 2));
    console.log('---------------------------------');
  }

  // --- Maps ---
  const comboByMongoId = new Map(combos.map((c) => [c._id, c]));
  const comboByBizId = new Map(combos.filter((c) => c.id).map((c) => [c.id, c]));
  const facultyById = new Map(faculties.map((f) => [f._id, f]));
  const subjectById = new Map(subjects.map((s) => [s._id, s]));
  const classById = new Map(classes.map((c) => [c._id, c]));

  // --- Allocation Report Data Structure ---
  const allocations_report = {};

  // ensure subjects have combined_classes array if present (deprecated if using combo.class_ids)
  for (const s of subjects) {
    if (s.combined_classes && !Array.isArray(s.combined_classes)) {
      s.combined_classes = Array.isArray(s.combined_classes)
        ? s.combined_classes.map(String)
        : [String(s.combined_classes)];
    }
  }

  // --- Helper: get required hours for (class, subject) ---
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

  const classDays = classes.map((c) => Number(c.days_per_week || DAYS_PER_WEEK));
  const MAX_DAYS = classDays.length ? Math.max(...classDays) : DAYS_PER_WEEK;

  for (const f of faculties) {
    faculty_timetables[f._id] = Array.from({ length: MAX_DAYS }, () =>
      Array.from({ length: HOURS_PER_DAY }, (_, h) =>
        BREAK_HOURS.includes(h) ? BREAK_SLOT : EMPTY_SLOT
      )
    );
  }

  const classOrderCache = new Map();

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
      else if (DEBUG) console.warn(`⚠️  Unknown combo reference on class:`, v);
    }
    return resolved;
  }

  function check_no_gaps_constraint(classId, day, hour) {
    const row = class_timetables[classId][day];
    const firstAssigned = row.findIndex(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
    if (firstAssigned === -1) return true;
    if (hour < firstAssigned) return true;
    for (let h = firstAssigned; h < hour; h++) {
      if (row[h] === EMPTY_SLOT) return false;
    }
    return true;
  }

  function can_place_lab_block(classId, faculty_ids, day, hour, blockSize) {
    if (hour + blockSize > HOURS_PER_DAY) return false;
    for (let h = hour; h < hour + blockSize; h++) {
      if (BREAK_HOURS.includes(h)) return false;
      if (class_timetables[classId][day][h] !== EMPTY_SLOT) return false;
      for (const fid of faculty_ids) {
        if (faculty_timetables[fid][day][h] !== EMPTY_SLOT) return false;
      }
    }
    return true;
  }

  function check_continuous_hours(faculty_ids, day, hour, blockSize) {
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

  function teacher_feasible(faculty_ids, day) {
    for (const fid of faculty_ids) {
      const row = faculty_timetables[fid][day];
      const assigned = row.filter(x => x !== EMPTY_SLOT && x !== BREAK_SLOT).length;
      const remaining = row.filter(x => x === EMPTY_SLOT).length;
      if (assigned > 0) {
        if (assigned > 4) return false;
        if (assigned + remaining < 4) return false;
      }
    }
    return true;
  }

  function class_day_feasible(classId, day) {
    const row = class_timetables[classId][day];
    let seen = false;
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const busy = row[h] !== EMPTY_SLOT && row[h] !== BREAK_SLOT;
      if (busy) seen = true;
      else if (seen) {
        const hasMoreBusy = row.slice(h + 1).some(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
        if (hasMoreBusy) return false;
      }
    }
    return true;
  }

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

  for (const cls of classes) {
    if (cls.assigned_teacher_subject_combos === undefined || cls.assigned_teacher_subject_combos === null) {
      const auto = combos
        .filter((cb) => {
          const subj = subjectById.get(cb.subject_id);
          if (!subj) return false;
          if (subj.sem !== cls.sem) return false;
          if (!Array.isArray(cb.class_ids) || cb.class_ids.length === 0) return true;
          return cb.class_ids.map(String).includes(cls._id);
        })
        .map((cb) => cb._id);
      cls.assigned_teacher_subject_combos = auto;
    } else {
      cls.assigned_teacher_subject_combos = resolveAssignedCombos(cls.assigned_teacher_subject_combos);
    }
    const subjectSet = new Set();
    let tot = 0;
    const parallelGroups = cls.parallel_electives || cls.elective_groups || [];
    const parallelSubjectSet = new Set();
    for (const grp of parallelGroups) {
      const sids = grp.subject_ids || grp.subjects || [];
      for (const sid of sids) {
        parallelSubjectSet.add(String(sid));
      }
    }
    const parallelHoursAdded = new Set();
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const cb = comboByMongoId.get(String(cbid));
      if (!cb) continue;
      const subjId = String(cb.subject_id);
      if (subjectSet.has(subjId)) continue;
      subjectSet.add(subjId);
      if (parallelSubjectSet.has(subjId)) {
        const group = parallelGroups.find(g => (g.subject_ids || g.subjects || []).map(String).includes(subjId));
        if (!group) continue;
        if (!parallelHoursAdded.has(group.groupId)) {
          const rep = (group.subject_ids || group.subjects || [])[0];
          const required = Number(group.hours) || get_required_hours_for_class_subject(cls._id, rep) || 0;
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

  const classIds = classes.filter((c) => c.total_class_hours > 0).map((c) => c._id);

  for (const cls of classes) {
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    const availableSlots = daysPerWeek * (HOURS_PER_DAY - BREAK_HOURS.length);
    if (cls.total_class_hours > availableSlots) {
      if (DEBUG) console.error(`Class ${cls.name} has more required hours (${cls.total_class_hours}) than available slots (${availableSlots}).`);
      return {
        ok: false,
        error: `Class ${cls.name} has more required hours (${cls.total_class_hours}) than available slots (${availableSlots}).`,
      };
    }
  }

  if (!Array.isArray(fixed_slots)) fixed_slots = [];

  function resolveComboForSubjectAndClass({ classId, subjectId, facultyPref }) {
    const cls = classById.get(classId);
    if (!cls) return null;
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const cb = comboByMongoId.get(String(cbid));
      if (!cb) continue;
      if (cb.subject_id === subjectId) {
        if (facultyPref && !(cb.faculty_ids || []).map(String).includes(String(facultyPref))) continue;
        return cb._id;
      }
    }
    for (const cb of combos) {
      if (cb.subject_id === subjectId) return cb._id;
    }
    return null;
  }

  const fixedMap = new Map();
  function setFixedSlot(classId, day, hour, comboId) {
    fixedMap.set(`${classId}|${day}|${hour}`, { comboId });
  }
  function getFixedSlot(classId, day, hour) {
    return fixedMap.get(`${classId}|${day}|${hour}`) || null;
  }

  for (const slot of fixed_slots) {
    const classId = String(slot.class);
    const day = Number(slot.day);
    const hour = Number(slot.hour);
    const blockSize = slot.blockSize != null ? Number(slot.blockSize) : 1;
    if (!classById.has(classId)) return { ok: false, error: `Fixed slot references unknown class ${slot.class}` };
    const clsForSlot = classById.get(classId);
    const daysForClass = Number(clsForSlot.days_per_week || DAYS_PER_WEEK);
    if (day < 0 || day >= daysForClass) return { ok: false, error: `Fixed slot day out of range for class ${classId}: ${slot.day}` };
    if (hour < 0 || hour >= HOURS_PER_DAY) return { ok: false, error: `Fixed slot hour out of range: ${slot.hour}` };
    let comboId = null;
    if (slot.combo) {
      comboId = toComboMongoId(slot.combo);
      if (!comboId) return { ok: false, error: `Fixed slot references unknown combo ${slot.combo}` };
    } else if (slot.subject) {
      const subjId = String(slot.subject);
      if (!subjectById.has(subjId)) return { ok: false, error: `Fixed slot references unknown subject ${slot.subject}` };
      const resolved = resolveComboForSubjectAndClass({ classId, subjectId: subjId, facultyPref: slot.faculty });
      if (!resolved) return { ok: false, error: `No combo found in class ${classId} for subject ${subjId}` };
      comboId = resolved;
    } else {
      return { ok: false, error: `Fixed slot must include either combo or subject: ${JSON.stringify(slot)}` };
    }
    const combo = comboByMongoId.get(comboId);
    if (hour + blockSize > HOURS_PER_DAY) return { ok: false, error: `Fixed block too large for day/hour: ${JSON.stringify(slot)}` };
    for (let h = hour; h < hour + blockSize; h++) {
      if (BREAK_HOURS.includes(h)) return { ok: false, error: `Fixed block intersects a break hour: ${JSON.stringify(slot)}` };
      if (class_timetables[classId][day][h] !== EMPTY_SLOT) return { ok: false, error: `Fixed block collides with prefilled class slot for ${classId} day ${day} hour ${h}` };
      for (const facultyId of combo.faculty_ids) {
        if (faculty_timetables[facultyId][day][h] !== EMPTY_SLOT) return { ok: false, error: `Fixed block collides with faculty availability for ${facultyId} at ${day}:${h}` };
      }
    }
    const subj = subjectById.get(combo.subject_id);
    for (let h = hour; h < hour + blockSize; h++) {
      class_timetables[classId][day][h] = comboId;
      for (const facultyId of combo.faculty_ids) {
        faculty_timetables[facultyId][day][h] = comboId;
      }
      subject_hours_assigned_per_class[classId][subj._id] += 1;
      daily_hours_assigned[classId][day] += 1;
      setFixedSlot(classId, day, h, comboId);
    }
  }

  const visited = new Set();

  function class_assigned_hours(classId) {
    let total = 0;
    for (const s of subjects) total += subject_hours_assigned_per_class[classId][s._id] || 0;
    return total;
  }

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
        if (!BREAK_HOURS.includes(h) && table[d][h] === EMPTY_SLOT) free++;
      }
    }
    return free;
  }

  function get_class_order_for_slot(day, hour) {
    const key = `${day}|${hour}`;
    const ordered = [...classIds].sort((a, b) => {
      const remA = remaining_hours_for_class(a);
      const remB = remaining_hours_for_class(b);
      const freeA = free_slots_for_class_from(a, day, hour);
      const freeB = free_slots_for_class_from(b, day, hour);
      const ratioA = freeA > 0 ? remA / freeA : Number.POSITIVE_INFINITY;
      const ratioB = freeB > 0 ? remB / freeB : Number.POSITIVE_INFINITY;
      if (ratioA !== ratioB) return ratioB - ratioA;
      if (remA !== remB) return remB - remA;
      const cA = classById.get(a);
      const cB = classById.get(b);
      const daysA = Number(cA?.days_per_week || DAYS_PER_WEEK);
      const daysB = Number(cB?.days_per_week || DAYS_PER_WEEK);
      if (daysA !== daysB) return daysA - daysB;
      return 0;
    });
    return ordered;
  }

  function total_remaining_required_hours() {
    let total = 0;
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
        if (required > assigned) total += required - assigned;
      }
    }
    return total;
  }

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

  function optimistic_feasible(day, hour) {
    const rem = total_remaining_required_hours();
    const avail = total_available_empty_slots();
    if (avail < rem && DEBUG) {
      console.log(`[PRUNE] Not enough slots: remaining=${rem}, available=${avail}, point=Day${day+1}, Hour${hour+1}`);
    }
    return avail >= rem;
  }

  function get_class_allocation_report_data(classId) {
    const cls = classById.get(classId);
    if (!cls || !cls.total_class_hours || cls.total_class_hours <= 0) return null;
    const class_report = { className: cls.name, classId: cls._id, subjects: [] };
    const subjectIdsForClass = (cls.assigned_teacher_subject_combos || []).map(cbid => {
      const cb = comboByMongoId.get(String(cbid));
      return cb ? cb.subject_id : null;
    }).filter(id => id);
    for (const subjId of new Set(subjectIdsForClass)) {
      const subj = subjectById.get(subjId);
      if (!subj) continue;
      const required = get_required_hours_for_class_subject(cls._id, subjId);
      const assigned = subject_hours_assigned_per_class[cls._id][subjId] || 0;
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
        const cb = comboByMongoId.get(String(cbid));
        if (!cb) continue;
        const subjId = cb.subject_id;
        if (subjSet.has(subjId)) continue;
        subjSet.add(subjId);
        const required = get_required_hours_for_class_subject(classId, subjId);
        const assigned = subject_hours_assigned_per_class[classId][subjId] || 0;
        if (Math.abs(required - assigned) > 1) {
          if (DEBUG) console.log(`Exactness ±1 failed for class ${classId}, subject ${subjId}: required ${required}, assigned ${assigned}`);
          return false;
        }
      }
    }
    for (const f of faculties) {
      const ft = faculty_timetables[f._id];
      for (let d = 0; d < ft.length; d++) {
        const hours = ft[d].filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length;
        if (hours < 0 || hours > 6) {
          if (DEBUG) console.log(`Faculty too many hours on faculty ${f._id} day ${d}: ${hours}`);
          return false;
        }
      }
    }
    if (!final_no_gap_check()) {
      if (DEBUG) console.log("❌ Final gap check failed");
      return false;
    }
    for (const cls of classes) {
      const table = class_timetables[cls._id];
      let seenEmptyDay = false;
      for (let d = 0; d < table.length; d++) {
        const busy = table[d].some(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
        if (!busy) seenEmptyDay = true;
        else if (seenEmptyDay) {
          if (DEBUG) console.log(`❌ Free-day rule failed: Busy day found after a free day for class ${cls._id}`);
          return false;
        }
      }
    }
    return true;
  }

  function final_no_gap_check() {
    for (const cls of classes) {
      const table = class_timetables[cls._id];
      for (let d = 0; d < table.length; d++) {
        const row = table[d];
        const first = row.findIndex(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
        if (first === -1) continue;
        for (let h = 0; h < first; h++) {
          if (row[h] !== EMPTY_SLOT) return false;
        }
        let started = false;
        for (let h = 0; h < HOURS_PER_DAY; h++) {
          const busy = row[h] !== EMPTY_SLOT && row[h] !== BREAK_SLOT;
          if (busy) started = true;
          else if (started) {
            const hasMore = row.slice(h + 1).some(x => x !== EMPTY_SLOT && x !== BREAK_SLOT);
            if (hasMore) return false;
          }
        }
      }
    }
    return true;
  }

  function can_place_combined(combo, subj, group, day, hour, blockSize) {
    for (const otherClass of group) {
      if (!classById.has(otherClass)) return false;
      const cls = classById.get(otherClass);
      const daysForClass = Number(cls.days_per_week || DAYS_PER_WEEK);
      if (day >= daysForClass) return false;
      for (let h = hour; h < hour + blockSize; h++) {
        if (BREAK_HOURS.includes(h)) return false;
        if (class_timetables[otherClass][day][h] !== EMPTY_SLOT) return false;
      }
      const required = get_required_hours_for_class_subject(otherClass, subj._id);
      if (subject_hours_assigned_per_class[otherClass][subj._id] + blockSize > required) return false;
      const hasCombo = classById.get(otherClass).assigned_teacher_subject_combos.some((cbid) => String(cbid) === String(combo._id));
      if (!hasCombo) return false;
    }
    for (const facultyId of combo.faculty_ids) {
        for (let h = hour; h < hour + blockSize; h++) {
            if (faculty_timetables[facultyId][day][h] !== EMPTY_SLOT) return false;
        }
        const facultyDayHours = faculty_timetables[facultyId][day].filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length;
        if (facultyDayHours + blockSize > 4) return false;
        if (!check_continuous_hours([facultyId], day, hour, blockSize)) return false;
    }
    for (const otherClass of group) {
      if (!subject_feasible(otherClass, subj._id)) return false;
    }
    return true;
  }

  function is_placement_valid(classId, day, hour, combo_id, blockSize = 1) {
    const combo = comboByMongoId.get(String(combo_id));
    const subj = subjectById.get(combo.subject_id);
    if (BREAK_HOURS.includes(hour)) {
      if (DEBUG) console.log(`[REJECT] BREAK slot: class ${classId}, D${day+1} H${hour+1}`);
      return false;
    }
    for (let h = hour; h < hour + blockSize; h++) {
      const fixed = getFixedSlot(classId, day, h);
      if (fixed && fixed.comboId !== combo._id) {
        if (DEBUG) console.log(`[REJECT] Fixed mismatch at class ${classId}, D${day+1} H${h+1} (want ${combo._id}, fixed=${fixed.comboId})`);
        return false;
      }
    }
    const required = get_required_hours_for_class_subject(classId, subj._id);
    const assigned = subject_hours_assigned_per_class[classId][subj._id] || 0;
    if (assigned >= required) return false;
    if (class_timetables[classId][day][hour] !== EMPTY_SLOT) {
      if (DEBUG) console.log(`[REJECT] Class slot busy: class ${classId} D${day+1} H${hour+1}`);
      return false;
    }
    for (const facultyId of combo.faculty_ids) {
        const facultyDayHours = faculty_timetables[facultyId][day].filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length;
        if (facultyDayHours + blockSize > 4) return false;
    }
    if (!check_continuous_hours(combo.faculty_ids, day, hour, blockSize)) {
      if (DEBUG) console.log(`[REJECT] Too many continuous hours for one of faculties in ${combo.faculty_ids} at D${day+1} H${hour+1}`);
      return false;
    }
    if (!subject_feasible(classId, subj._id)) return false;
    return true;
  }

  function schedule_slot(day, hour) {
    if (stopFlag) return false;
    if (day >= MAX_DAYS) {
      const all_ok = all_subjects_exactly_assigned();
      if (all_ok && progressCallback) progressCallback({ progress: 100 });
      return all_ok;
    }
    if (hour >= HOURS_PER_DAY) return schedule_slot(day + 1, 0);
    if (BREAK_HOURS.includes(hour)) return schedule_slot(day, hour + 1);
    if (progressCallback) {
      const total_slots = MAX_DAYS * HOURS_PER_DAY;
      const current_slot = day * HOURS_PER_DAY + hour;
      const progress = (current_slot / total_slots) * 100;
      progressCallback({
        progress: Math.min(99, Math.round(progress)),
        partialData: { class_timetables, faculty_timetables, subject_hours_assigned_per_class },
      });
    }
    if (!optimistic_feasible(day, hour)) return false;
    const classOrder = get_class_order_for_slot(day, hour);
    return try_class_in_slot(day, hour, classOrder, 0);
  }

  function try_class_in_slot(day, hour, classOrder, classIndex) {
    if (classIndex >= classOrder.length) return schedule_slot(day, hour + 1);
    const classId = classOrder[classIndex];
    const cls = classById.get(classId);
    const daysPerWeek = Number(cls.days_per_week || DAYS_PER_WEEK);
    if (day >= daysPerWeek) return try_class_in_slot(day, hour, classOrder, classIndex + 1);
    if (class_timetables[classId][day][hour] !== EMPTY_SLOT) return try_class_in_slot(day, hour, classOrder, classIndex + 1);
    const candidates = [];
    for (const cbid of cls.assigned_teacher_subject_combos) {
      const combo = comboByMongoId.get(String(cbid));
      if (!combo) continue;
      const subj = subjectById.get(combo.subject_id);
      if (!subj) continue;
      candidates.push({ combo, subj });
    }
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
    for (const { combo, subj } of candidates) {
      const combo_id = String(combo._id);
      const comboDef = comboByMongoId.get(combo_id);
      const isCombined = Array.isArray(comboDef.class_ids) && comboDef.class_ids.length > 1;
      const blockSize = subj.type === 'lab' ? 2 : 1;
      if (isCombined) {
        if (String(comboDef.class_ids[0]) !== classId) continue;
        if (can_place_combined(combo, subj, comboDef.class_ids, day, hour, blockSize)) {
          for (const cId of comboDef.class_ids) {
            for (let h = hour; h < hour + blockSize; h++) {
              class_timetables[cId][day][h] = combo_id;
              subject_hours_assigned_per_class[cId][subj._id]++;
              daily_hours_assigned[cId][day]++;
            }
          }
          for (const facultyId of combo.faculty_ids) {
            for (let h = hour; h < hour + blockSize; h++) {
              faculty_timetables[facultyId][day][h] = combo_id;
            }
          }
          if (try_class_in_slot(day, hour, classOrder, classIndex + 1)) return true;
          for (const facultyId of combo.faculty_ids) {
            for (let h = hour; h < hour + blockSize; h++) {
              faculty_timetables[facultyId][day][h] = EMPTY_SLOT;
            }
          }
          for (const cId of comboDef.class_ids) {
            for (let h = hour; h < hour + blockSize; h++) {
              daily_hours_assigned[cId][day]--;
              subject_hours_assigned_per_class[cId][subj._id]--;
              class_timetables[cId][day][h] = EMPTY_SLOT;
            }
          }
        }
      } else {
        if (is_placement_valid(classId, day, hour, combo_id, blockSize)) {
          if (blockSize > 1 && !can_place_lab_block(classId, combo.faculty_ids, day, hour, blockSize)) continue;
          for (let h = hour; h < hour + blockSize; h++) {
            class_timetables[classId][day][h] = combo_id;
            for (const facultyId of combo.faculty_ids) {
                faculty_timetables[facultyId][day][h] = combo_id;
            }
            subject_hours_assigned_per_class[classId][subj._id]++;
            daily_hours_assigned[classId][day]++;
          }
          if (try_class_in_slot(day, hour, classOrder, classIndex + 1)) return true;
          for (let h = hour; h < hour + blockSize; h++) {
            daily_hours_assigned[classId][day]--;
            subject_hours_assigned_per_class[classId][subj._id]--;
            for (const facultyId of combo.faculty_ids) {
                faculty_timetables[facultyId][day][h] = EMPTY_SLOT;
            }
            class_timetables[classId][day][h] = EMPTY_SLOT;
          }
        }
      }
    }
    return try_class_in_slot(day, hour, classOrder, classIndex + 1);
  }

  function countFreeSlots(classId) {
    let free = 0;
    const table = class_timetables[classId];
    for (let d = 0; d < table.length; d++) {
      for (let h = 0; h < HOURS_PER_DAY; h++) {
        if (!BREAK_HOURS.includes(h) && table[d][h] === EMPTY_SLOT) free++;
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
    const parallelSubjectSet = new Set();
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
      if (parallelGroups.length > 0 && parallelSubjectSet.has(subjId)) {
        const group = parallelGroups.find(g => (g.subject_ids || g.subjects || []).map(String).includes(subjId));
        if (!group) continue;
        if (!parallelHoursAdded.has(group.groupId)) {
          const rep = (group.subject_ids || group.subjects || [])[0];
          const required = Number(group.hours) || get_required_hours_for_class_subject(cls._id, rep) || 0;
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

  for (const cls of classes) {
    if (cls.total_class_hours > 0) {
      const report = get_class_allocation_report_data(cls._id);
      if (report) allocations_report[cls._id] = report;
    }
  }

  if (!ok) {
    const errorMsg = stopFlag ? "Stopped by user — partial timetable returned" : "Partial timetable generated — solver could not satisfy all constraints";
    if (DEBUG) {
      console.error(`❌ ${errorMsg}`);
      console.log("Showing partial timetable for debugging...\n");
      const partial_class_timetables = {};
      const partial_faculty_timetables = {};
      for (const cls of classes) partial_class_timetables[cls._id] = class_timetables[cls._id];
      for (const f of faculties) partial_faculty_timetables[f._id] = faculty_timetables[f._id];
      console.log("\n--- Partial Class Timetables ---");
      for (const classId in partial_class_timetables) {
        printTimetable(classId, partial_class_timetables[classId], classById);
        if (allocations_report[classId]) {
          console.log("  Allocation Summary (Partial):");
          allocations_report[classId].subjects.forEach(subj => {
            console.log(`    - ${subj.subjectName.padEnd(15)} | Required: ${subj.requiredHours}, Allocated: ${subj.allocatedHours} | ${subj.status}`);
          });
        }
      }
      console.log("\n--- Partial Faculty Timetables ---");
      for (const facultyId in partial_faculty_timetables) {
        console.log(`\n📅 Timetable for ${facultyById.get(facultyId).name}`);
        partial_faculty_timetables[facultyId].forEach((row, d) => {
          console.log(`Day ${d + 1}:`, row.map((slot) => (slot === -1 ? "—" : slot === "BREAK" ? "B" : slot)).join(" | "));
        });
      }
      console.log("\n--- Subject Hours Assigned So Far ---");
      console.log(JSON.stringify(subject_hours_assigned_per_class, null, 2));
    }
    return {
      ok: false,
      error: errorMsg,
      class_timetables: class_timetables,
      faculty_timetables: faculty_timetables,
      subject_hours_assigned_per_class,
      allocations_report,
    };
  }

  if (DEBUG) console.log("🎉 Successfully generated timetable");

  const out_class_timetables = {};
  for (const cls of classes) out_class_timetables[cls._id] = class_timetables[cls._id];
  const out_faculty_timetables = {};
  for (const f of faculties) out_faculty_timetables[f._id] = faculty_timetables[f._id];

  const faculty_daily_hours = {};
  for (const f of faculties) {
    faculty_daily_hours[f._id] = faculty_timetables[f._id].map((row) =>
      row.filter((x) => x !== EMPTY_SLOT && x !== BREAK_SLOT).length
    );
  }

  if (DEBUG) {
    console.log("\n--- Generated Class Timetables ---");
    for (const classId in out_class_timetables) {
      printTimetable(classId, out_class_timetables[classId], classById);
      if (allocations_report[classId]) {
        console.log("  Allocation Summary:");
        allocations_report[classId].subjects.forEach(subj => {
          console.log(`    - ${subj.subjectName.padEnd(15)} | Required: ${subj.requiredHours}, Allocated: ${subj.allocatedHours} | ${subj.status}`);
        });
      }
    }
    console.log("\n--- Generated Faculty Timetables ---");
    for (const facultyId in out_faculty_timetables) {
      console.log(`\n📅 Timetable for ${facultyById.get(facultyId).name}`);
      out_faculty_timetables[facultyId].forEach((row, d) => {
        console.log(`Day ${d + 1}:`, row.map((slot) => (slot === -1 ? "—" : slot === "BREAK" ? "B" : slot)).join(" | "));
      });
    }
    console.log("\n--- Faculty Daily Hours ---");
    for (const facultyId in faculty_daily_hours) {
      console.log(`\t\t ${facultyById.get(facultyId).name} Daily Hours:`, faculty_daily_hours[facultyId]);
    }
  }

  return {
    ok: true,
    class_timetables: out_class_timetables,
    faculty_timetables: out_faculty_timetables,
    faculty_daily_hours,
    allocations_report,
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
