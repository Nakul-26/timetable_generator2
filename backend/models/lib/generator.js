// lib/generator.js
// Thin wrapper around the Python CP-SAT solver service
const DEFAULT_SOLVER_URL = process.env.SOLVER_URL || "http://localhost:8001";
const DEFAULT_TIMEOUT_MS = Number(process.env.SOLVER_TIMEOUT_MS || 60000);

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
        fixed_slots: fixed_slots.length ? fixed_slots : fixedSlots
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
        classes: data.classes || classes || []
      };
    }

    progressCallback?.({ progress: 100, phase: "done" });

    return {
      ok: true,
      class_timetables: data.class_timetables,
      faculty_timetables: data.faculty_timetables,
      classes: data.classes || classes || []
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
