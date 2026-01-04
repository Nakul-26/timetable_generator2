import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------ */
/* ---------------- Internal State ---------------- */
/* ------------------------------------------------ */

const workers = new Map();
const taskResults = new Map();
let nextTaskId = 1;

/* ------------------------------------------------ */
/* ---------------- Worker Manager ---------------- */
/* ------------------------------------------------ */

export function startGenerationWorker({ payload }) {
  const taskId = nextTaskId++;

  const worker = new Worker(
    path.resolve(__dirname, "../../workers/worker.js")
  );

  workers.set(taskId, worker);
  taskResults.set(taskId, {
    status: "running",
    progress: 0
  });

  worker.postMessage({
    action: "GENERATE",
    payload: { ...payload, taskId }
  });

  worker.on("message", async (message) => {
    if (message.type === "PROGRESS") {
      taskResults.set(taskId, {
        status: "running",
        progress: message.progress,
        partialData: message.partialData
      });
    }

    if (message.type === "RESULT") {
      taskResults.set(taskId, {
        status: "completed",
        result: message.data
      });
      cleanup(taskId);
    }

    if (message.type === "ERROR") {
      taskResults.set(taskId, {
        status: "error",
        error: message.error
      });
      cleanup(taskId);
    }
  });

  worker.on("error", (err) => {
    taskResults.set(taskId, {
      status: "error",
      error: err.message
    });
    cleanup(taskId);
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      const current = taskResults.get(taskId);
      if (!current || current.status === "running") {
        taskResults.set(taskId, {
          status: "error",
          error: `Worker exited with code ${code}`
        });
      }
    }
    cleanup(taskId);
  });

  return taskId;
}

export function stopGenerationWorker(taskId) {
  const worker = workers.get(taskId);
  if (!worker) return false;

  worker.postMessage({ action: "STOP" });
  return true;
}

export function getGenerationStatus(taskId) {
  return taskResults.get(taskId) || null;
}

/* ------------------------------------------------ */
/* ------------------ Cleanup --------------------- */
/* ------------------------------------------------ */

function cleanup(taskId) {
  const worker = workers.get(taskId);
  if (worker) {
    worker.terminate();
  }
  workers.delete(taskId);

  // Auto-clean task result after 1 minute
  setTimeout(() => {
    taskResults.delete(taskId);
  }, 60000).unref();
}
