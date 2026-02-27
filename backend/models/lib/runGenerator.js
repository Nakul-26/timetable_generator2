// runGenerator.js
const DEFAULT_SOLVER_URL = process.env.SOLVER_URL || "http://localhost:8001";
const DEFAULT_SOLVER_TIME_LIMIT_SEC = Number(process.env.SOLVER_TIME_LIMIT_SEC || 180);
const DEFAULT_TIMEOUT_MS = Number(
  process.env.SOLVER_TIMEOUT_MS || (DEFAULT_SOLVER_TIME_LIMIT_SEC * 1000 + 30000)
);

function analyzeClassInternalGaps(classTimetables) {
  let gapCount = 0;

  if (!classTimetables || typeof classTimetables !== "object") {
    return { gapCount: 0 };
  }

  for (const rows of Object.values(classTimetables)) {
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      if (!Array.isArray(row)) continue;

      const teachingSlots = row
        .map((slot, idx) => ({ slot, idx }))
        .filter(
          ({ slot }) =>
            slot !== -1 &&
            slot !== "BREAK" &&
            slot !== null &&
            slot !== undefined
        )
        .map(({ idx }) => idx);

      if (teachingSlots.length <= 1) continue;

      const first = teachingSlots[0];
      const last = teachingSlots[teachingSlots.length - 1];
      for (let h = first + 1; h < last; h++) {
        const slot = row[h];
        if (slot === -1 || slot === null || slot === undefined) {
          gapCount += 1;
        }
      }
    }
  }

  return { gapCount };
}

async function callCpSatSolver({
  faculties,
  subjects,
  classes,
  combos,
  fixedSlots,
  DAYS_PER_WEEK,
  HOURS_PER_DAY,
  constraintConfig,
  random_seed,
  onProgress,
  stopFlag,
}) {
  if (stopFlag?.is_set) {
    return {
      ok: false,
      error: "Stopped by user",
      class_timetables: {},
      faculty_timetables: {},
      classes: classes || [],
      config: constraintConfig || {},
    };
  }

  onProgress?.({ progress: 0, phase: "start" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const solverTimeLimitSec =
      Number(constraintConfig?.solver?.timeLimitSec) || DEFAULT_SOLVER_TIME_LIMIT_SEC;

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
        fixed_slots: fixedSlots || [],
        constraintConfig,
        random_seed,
        solver_time_limit_sec: solverTimeLimitSec,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      return {
        ok: false,
        error: data?.error || `Solver HTTP ${res.status}`,
        class_timetables: {},
        faculty_timetables: {},
        classes: classes || [],
        config: constraintConfig || {},
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
        warnings: data.warnings || [],
        config: data.config || constraintConfig || {},
      };
    }

    onProgress?.({ progress: 100, phase: "done" });

    return {
      ok: true,
      class_timetables: data.class_timetables || {},
      faculty_timetables: data.faculty_timetables || {},
      faculty_daily_hours: data.faculty_daily_hours || null,
      classes: data.classes || classes || [],
      unmet_requirements: data.unmet_requirements || [],
      warnings: data.warnings || [],
      config: data.config || constraintConfig || {},
      allocations_report: data.allocations_report || null,
    };
  } catch (err) {
    const msg =
      err?.name === "AbortError" ? "Solver timeout" : (err?.message || "Solver request failed");
    return {
      ok: false,
      error: msg,
      class_timetables: {},
      faculty_timetables: {},
      classes: classes || [],
      config: constraintConfig || {},
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runGenerate({
  faculties,
  subjects,
  classes,
  combos,
  fixedSlots,
  DAYS_PER_WEEK = 6,
  HOURS_PER_DAY = 8,
  constraintConfig = {},
  onProgress,
  attempts = 3,
}) {
  const enforceHardNoGaps =
    constraintConfig?.noGaps?.hard !== undefined
      ? Boolean(constraintConfig.noGaps.hard)
      : String(process.env.ENFORCE_HARD_NO_GAPS || "true").toLowerCase() !== "false";

  let best_class_timetables = null;
  let best_faculty_timetables = null;
  let best_faculty_daily_hours = null;
  let best_classes = null;
  let bestScore = Infinity;
  let result_combos = null;
  let result_allocations = null;
  let result_config = null;
  let result_unmet_requirements = null;
  let result_warnings = null;
  let lastError = null;
  let bestPartial = null;
  let bestPartialFilled = -1;

  const countFilledSlots = (classTimetables) => {
    if (!classTimetables || typeof classTimetables !== "object") return 0;
    let filled = 0;
    for (const rows of Object.values(classTimetables)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        for (const slot of row) {
          if (slot !== -1 && slot !== "BREAK" && slot !== null && slot !== undefined) {
            filled += 1;
          }
        }
      }
    }
    return filled;
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffledClasses = [...classes];
    const shuffledCombos = [...combos];
    const shuffledFaculties = [...faculties];
    const shuffledSubjects = [...subjects];

    const result = await callCpSatSolver({
      faculties: shuffledFaculties,
      subjects: shuffledSubjects,
      classes: shuffledClasses,
      combos: shuffledCombos,
      fixedSlots,
      DAYS_PER_WEEK,
      HOURS_PER_DAY,
      constraintConfig,
      random_seed: attempt + 1,
      onProgress,
    });

    if (!result.ok) {
      lastError = result.error || "Unknown generator failure";
      const partialFilled = countFilledSlots(result.class_timetables);
      if (partialFilled > bestPartialFilled) {
        bestPartialFilled = partialFilled;
        bestPartial = {
          class_timetables: result.class_timetables || {},
          faculty_timetables: result.faculty_timetables || {},
          classes: result.classes || shuffledClasses,
          combos: shuffledCombos,
          config: result.config || constraintConfig || {},
          unmet_requirements: result.unmet_requirements || [],
          warnings: result.warnings || [],
        };
      }
      if (process.env.NODE_ENV !== "production") {
        console.log(`Attempt ${attempt + 1}: Failed to generate - ${lastError}`);
      }
      continue;
    }

    const { gapCount } = analyzeClassInternalGaps(result.class_timetables);
    if (enforceHardNoGaps && gapCount > 0) {
      lastError = `Generated timetable has ${gapCount} internal class gaps`;
      if (process.env.NODE_ENV !== "production") {
        console.log(`Attempt ${attempt + 1}: Rejected due to gaps (${gapCount})`);
      }
      continue;
    }

    const score = gapCount;

    if (process.env.NODE_ENV !== "production") {
      console.log(`Attempt ${attempt + 1}: Score = ${score}`);
    }

    if (score < bestScore) {
      bestScore = score;
      best_class_timetables = result.class_timetables;
      best_faculty_timetables = result.faculty_timetables;
      best_faculty_daily_hours = result.faculty_daily_hours;
      best_classes = result.classes;
      result_combos = shuffledCombos;
      result_allocations = result.allocations_report;
      result_config = result.config || constraintConfig || {};
      result_unmet_requirements = result.unmet_requirements || [];
      result_warnings = result.warnings || [];
    }
  }

  if (process.env.NODE_ENV !== "production") {
    if (best_class_timetables) {
    console.log("Best timetable found. Score:", bestScore);
  } else {
      console.error("Could not generate a valid timetable.", lastError ? `Last error: ${lastError}` : "");
  }
  }

  if (!best_class_timetables && (!bestPartial || bestPartialFilled <= 0)) {
    bestPartial = null;
  }

  return {
    ok: Boolean(best_class_timetables),
    error: best_class_timetables ? null : (lastError || "Failed to generate timetable"),
    score: best_class_timetables ? bestScore : null,
    class_timetables: best_class_timetables || bestPartial?.class_timetables || null,
    faculty_timetables: best_faculty_timetables || bestPartial?.faculty_timetables || null,
    faculty_daily_hours: best_faculty_daily_hours,
    classes: best_classes || bestPartial?.classes || null,
    combos: result_combos || bestPartial?.combos || null,
    config: result_config || bestPartial?.config || constraintConfig || {},
    allocations_report: result_allocations,
    unmet_requirements: result_unmet_requirements || bestPartial?.unmet_requirements || [],
    warnings: result_warnings || bestPartial?.warnings || [],
    attemptsTried: attempts,
    // Legacy aliases used in some routes
    bestClassTimetables: best_class_timetables,
    bestFacultyTimetables: best_faculty_timetables,
    bestFacultyDailyHours: best_faculty_daily_hours,
    bestScore: bestScore,
  };
}

export default runGenerate;
