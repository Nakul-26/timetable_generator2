// runGenerator.js
import Generator from "./generator.js";

function runGenerate({ faculties, subjects, classes, combos, fixedSlots }) {
  // --- Try multiple schedules and keep the best ---
  let bestClassTimetables = null;
  let bestFacultyTimetables = null;
  let bestScore = Infinity;

  for (let attempt = 0; attempt < 10; attempt++) {
    Generator.shuffle(classes);
    Generator.shuffle(combos);
    Generator.shuffle(faculties);
    Generator.shuffle(subjects);

    const { ok, class_timetables, faculty_timetables } = Generator.generate({
      faculties,
      subjects,
      classes,
      combos,
      fixed_slots: fixedSlots,
    });

    if (!ok) {
      console.log(`Attempt ${attempt + 1}: Failed to generate`);
      continue;
    }

    const score = Generator.scoreTimetable(
      class_timetables,
      classes.map((c) => c._id)
    );

    console.log(`Attempt ${attempt + 1}: Score = ${score}`);

    if (score < bestScore) {
      bestScore = score;
      bestClassTimetables = class_timetables;
      bestFacultyTimetables = faculty_timetables;
    }
  }

  // --- Print the best timetable ---
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

  return { bestClassTimetables, bestFacultyTimetables, bestScore };
}

export default runGenerate;
