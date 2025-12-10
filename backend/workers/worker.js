// workers/worker.js
import { parentPort } from "worker_threads";
console.log("WORKER STARTED");
import generator from "../models/lib/generator.js"; // Your existing timetable generator

let stopRequested = false;

// Accept messages from parent thread
parentPort.on("message", async (message) => {
  const { action, payload } = message;

  if (action === "STOP") {
    console.log("⛔ STOP requested in worker");
    stopRequested = true;
    return;
  }

  if (action === "GENERATE") {
    stopRequested = false;

    const {
      faculties,
      subjects,
      classes,
      combos,
      DAYS_PER_WEEK,
      HOURS_PER_DAY,
      BREAK_HOURS,
      fixed_slots,
      taskId
    } = payload;

    console.log(`🧠 Worker started generation Task #${taskId}`);

    try {
      // Directly call generator.generate and pass progressCallback
      const result = generator.generate({
        faculties, subjects, classes, combos, DAYS_PER_WEEK, HOURS_PER_DAY, BREAK_HOURS, fixed_slots,
        progressCallback: (progress) => {
          // Send progress updates back to main thread
          parentPort.postMessage({
            taskId,
            type: "PROGRESS",
            progress: progress.progress,
            partialData: progress.partialData
          });
        },
        stopFlag: stopRequested // Pass the stopRequested flag
      });

      // Whether success or partial, always send a final result message
      parentPort.postMessage({
        taskId,
        type: "RESULT",
        ok: result.ok,
        data: result
      });

    } catch (err) {
      parentPort.postMessage({
        taskId,
        type: "ERROR",
        error: err.message || err.toString()
      });
    }
  }
});


