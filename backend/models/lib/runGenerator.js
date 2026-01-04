// runGenerator.js
import Generator from "./generator.js";

function runGenerate({
  faculties,
  subjects,
  classes,
  combos,
  fixedSlots,
  attempts = 10, // 🔧 1. Make attempt count configurable
}) {
  let bestClassTimetables = null;
  let bestFacultyTimetables = null;
  let bestFacultyDailyHours = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // 🔧 2. Clone arrays before shuffling to avoid mutating inputs
    const shuffledClasses = [...classes];
    const shuffledCombos = [...combos];
    const shuffledFaculties = [...faculties];
    const shuffledSubjects = [...subjects];

    Generator.shuffle(shuffledClasses);
    Generator.shuffle(shuffledCombos);
    Generator.shuffle(shuffledFaculties);
    Generator.shuffle(shuffledSubjects);

    const { ok, class_timetables, faculty_timetables, faculty_daily_hours } = Generator.generate({
      faculties: shuffledFaculties,
      subjects: shuffledSubjects,
      classes: shuffledClasses,
      combos: shuffledCombos,
      fixed_slots: fixedSlots,
    });

    if (!ok) {
      // 🔧 3. Gate logging
      if (process.env.NODE_ENV !== "production") {
        console.log(`Attempt ${attempt + 1}: Failed to generate`);
      }
      continue;
    }

    const score = Generator.scoreTimetable(
      class_timetables,
      classes.map((c) => c._id)
    );

    // 🔧 3. Gate logging
    if (process.env.NODE_ENV !== "production") {
      console.log(`Attempt ${attempt + 1}: Score = ${score}`);
    }

    if (score < bestScore) {
      bestScore = score;
      bestClassTimetables = class_timetables;
      bestFacultyTimetables = faculty_timetables;
      bestFacultyDailyHours = faculty_daily_hours;
    }
  }

  // 🔧 3. Gate logging for the final result
  if (process.env.NODE_ENV !== "production") {
    if (bestClassTimetables) {
      console.log("\n🎉 Best timetable found! Score:", bestScore);
      const classMap = new Map(classes.map((c) => [c._id, c]));

      for (const cls of classes) {
        Generator.printTimetable(
          cls._id,
          bestClassTimetables[cls._id],
          classMap
        );
      }
    } else {
      console.error("❌ Could not generate a valid timetable.");
    }
  }

  // 🔧 4. Return more structured metadata
  return {
    ok: Boolean(bestClassTimetables),
    bestScore,
    bestClassTimetables,
    bestFacultyTimetables,
    bestFacultyDailyHours,
    attemptsTried: attempts,
  };
}

export default runGenerate;
