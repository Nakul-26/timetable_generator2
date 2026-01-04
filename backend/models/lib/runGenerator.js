// runGenerator.js
import Generator from "./generator.js";

function runGenerate({
  faculties,
  subjects,
  classes,
  combos,
  fixedSlots,
  attempts = 10,
}) {
  let best_class_timetables = null;
  let best_faculty_timetables = null;
  let best_faculty_daily_hours = null;
  let bestScore = Infinity;
  let result_combos = null; // To store the combos from the best result
  let result_allocations = null; // To store the allocations from the best result

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffledClasses = [...classes];
    const shuffledCombos = [...combos];
    const shuffledFaculties = [...faculties];
    const shuffledSubjects = [...subjects];

    Generator.shuffle(shuffledClasses);
    Generator.shuffle(shuffledCombos);
    Generator.shuffle(shuffledFaculties);
    Generator.shuffle(shuffledSubjects);

    const result = Generator.generate({
      faculties: shuffledFaculties,
      subjects: shuffledSubjects,
      classes: shuffledClasses,
      combos: shuffledCombos,
      fixed_slots: fixedSlots,
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
      result_combos = shuffledCombos; // Save the combos that produced this result
      result_allocations = result.allocations_report;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    if (best_class_timetables) {
      console.log("\n🎉 Best timetable found! Score:", bestScore);
      const classMap = new Map(classes.map((c) => [c._id, c]));

      for (const cls of classes) {
        Generator.printTimetable(
          cls._id,
          best_class_timetables[cls._id],
          classMap
        );
      }
    } else {
      console.error("❌ Could not generate a valid timetable.");
    }
  }

  return {
    ok: Boolean(best_class_timetables),
    score: bestScore,
    class_timetables: best_class_timetables,
    faculty_timetables: best_faculty_timetables,
    faculty_daily_hours: best_faculty_daily_hours,
    combos: result_combos, // Pass the combos along
    allocations_report: result_allocations, // Pass allocations along
    attemptsTried: attempts,
  };
}

export default runGenerate;
