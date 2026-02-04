// runGenerator.js
import Generator from "./generator.js";

async function runGenerate({
  faculties,
  subjects,
  classes,
  combos,
  fixedSlots,
  onProgress,
  attempts = 1,
}) {
  let best_class_timetables = null;
  let best_faculty_timetables = null;
  let best_faculty_daily_hours = null;
  let best_classes = null;
  let bestScore = Infinity;
  let result_combos = null;
  let result_allocations = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffledClasses = [...classes];
    const shuffledCombos = [...combos];
    const shuffledFaculties = [...faculties];
    const shuffledSubjects = [...subjects];

    const result = await Generator.generate({
      faculties: shuffledFaculties,
      subjects: shuffledSubjects,
      classes: shuffledClasses,
      combos: shuffledCombos,
      fixed_slots: fixedSlots,
      progressCallback: onProgress,
    });

    if (!result.ok) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`Attempt ${attempt + 1}: Failed to generate`);
      }
      continue;
    }

    const score = Generator.scoreTimetable(
      result.class_timetables,
      classes.map((c) => c._id)
    );

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
    }
  }

  if (process.env.NODE_ENV !== "production") {
    if (best_class_timetables) {
      console.log("Best timetable found. Score:", bestScore);
    } else {
      console.error("Could not generate a valid timetable.");
    }
  }

  return {
    ok: Boolean(best_class_timetables),
    score: bestScore,
    class_timetables: best_class_timetables,
    faculty_timetables: best_faculty_timetables,
    faculty_daily_hours: best_faculty_daily_hours,
    classes: best_classes,
    combos: result_combos,
    allocations_report: result_allocations,
    attemptsTried: attempts,
    // Legacy aliases used in some routes
    bestClassTimetables: best_class_timetables,
    bestFacultyTimetables: best_faculty_timetables,
    bestFacultyDailyHours: best_faculty_daily_hours,
    bestScore: bestScore,
  };
}

export default runGenerate;
