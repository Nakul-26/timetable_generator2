// lib/generator.js
// Thin wrapper around the Python CP-SAT solver service
const DEFAULT_SOLVER_URL = process.env.SOLVER_URL || "http://localhost:8001";
const DEFAULT_SOLVER_TIME_LIMIT_SEC = Number(process.env.SOLVER_TIME_LIMIT_SEC || 180);
// Keep HTTP timeout slightly above solver time limit to avoid client abort races.
const DEFAULT_TIMEOUT_MS = Number(
  process.env.SOLVER_TIMEOUT_MS || (DEFAULT_SOLVER_TIME_LIMIT_SEC * 1000 + 30000)
);

async function generate({
  faculties,
  subjects,
  classes,
  combos,
  DAYS_PER_WEEK = 6,
  HOURS_PER_DAY = 8,
  BREAK_HOURS = [],
  fixed_slots = [],
  fixedSlots = [],
  random_seed,
  progressCallback,
  stopFlag
}) {
  if (stopFlag?.is_set) {
    return {
      ok: false,
      error: "Stopped by user",
      class_timetables: {},
      faculty_timetables: {},
      classes: classes || []
    };
  }

  progressCallback?.({ progress: 0, phase: "start" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(`${DEFAULT_SOLVER_URL}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faculties,
        subjects,
        classes,
        combos,
        DAYS_PER_WEEK,
        HOURS_PER_DAY,
        BREAK_HOURS,
        fixed_slots: fixed_slots.length ? fixed_slots : fixedSlots,
        random_seed,
        solver_time_limit_sec: DEFAULT_SOLVER_TIME_LIMIT_SEC
      }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      return {
        ok: false,
        error: data?.error || `Solver HTTP ${res.status}`,
        class_timetables: {},
        faculty_timetables: {},
        classes: classes || []
      };
    }

    if (!data.ok) {
      return {
        ok: false,
        error: data.error || "Solver error",
        class_timetables: data.class_timetables || {},
        faculty_timetables: data.faculty_timetables || {},
        classes: data.classes || classes || [],
        unmet_requirements: data.unmet_requirements || [],
        warnings: data.warnings || []
      };
    }

    progressCallback?.({ progress: 100, phase: "done" });

    return {
      ok: true,
      class_timetables: data.class_timetables,
      faculty_timetables: data.faculty_timetables,
      classes: data.classes || classes || [],
      unmet_requirements: data.unmet_requirements || [],
      warnings: data.warnings || []
    };
  } catch (err) {
    const msg = err?.name === "AbortError" ? "Solver timeout" : (err?.message || "Solver request failed");
    return {
      ok: false,
      error: msg,
      class_timetables: {},
      faculty_timetables: {},
      classes: classes || []
    };
  } finally {
    clearTimeout(timeout);
  }
}

function printTimetable() {}
function scoreTimetable() { return 0; }
function shuffle() {}

export default { generate, printTimetable, scoreTimetable, shuffle };
