export const TIMETABLE_CONSTRAINTS_STORAGE_KEY = "timetable.constraintConfig";

export const DEFAULT_CONSTRAINT_CONFIG = {
  schedule: {
    daysPerWeek: 6,
    hoursPerDay: 8,
    breakHours: [],
  },
  structural: {
    labBlockSize: 2,
    theoryBlockSize: 1,
  },
  weeklySubjectHours: {
    hard: true,
    shortageWeight: 1000,
  },
  noGaps: {
    hard: true,
    weight: 500,
  },
  teacherContinuity: {
    enabled: true,
    maxConsecutive: 3,
    weight: 100,
  },
  classContinuity: {
    enabled: true,
    maxConsecutive: 3,
    weight: 80,
  },
  teacherDailyOverload: {
    enabled: true,
    max: 6,
    weight: 120,
  },
  subjectClustering: {
    enabled: true,
    maxPerDay: 3,
    weight: 50,
  },
  frontLoading: {
    enabled: true,
    weight: 400,
  },
  solver: {
    timeLimitSec: 180,
  },
};

function safeNum(value, fallback, min = null) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (min != null && n < min) return min;
  return n;
}

function safeInt(value, fallback, min = null) {
  const n = Math.trunc(safeNum(value, fallback, min));
  if (!Number.isFinite(n)) return fallback;
  if (min != null && n < min) return min;
  return n;
}

function toBool(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || String(value).toLowerCase() === "true") return true;
  if (value === 0 || value === "0" || String(value).toLowerCase() === "false") return false;
  return fallback;
}

export function normalizeConstraintConfig(input = {}) {
  const cfg = input || {};
  const schedule = cfg.schedule || {};
  const structural = cfg.structural || {};
  const weeklySubjectHours = cfg.weeklySubjectHours || {};
  const noGaps = cfg.noGaps || {};
  const teacherContinuity = cfg.teacherContinuity || {};
  const classContinuity = cfg.classContinuity || {};
  const teacherDailyOverload = cfg.teacherDailyOverload || {};
  const subjectClustering = cfg.subjectClustering || {};
  const frontLoading = cfg.frontLoading || {};
  const solver = cfg.solver || {};

  const breakHoursRaw = Array.isArray(schedule.breakHours) ? schedule.breakHours : [];
  const breakHours = Array.from(
    new Set(
      breakHoursRaw
        .map((h) => safeInt(h, null))
        .filter((h) => Number.isInteger(h) && h >= 0)
    )
  ).sort((a, b) => a - b);

  return {
    schedule: {
      daysPerWeek: safeInt(schedule.daysPerWeek, DEFAULT_CONSTRAINT_CONFIG.schedule.daysPerWeek, 1),
      hoursPerDay: safeInt(schedule.hoursPerDay, DEFAULT_CONSTRAINT_CONFIG.schedule.hoursPerDay, 1),
      breakHours,
    },
    structural: {
      labBlockSize: safeInt(structural.labBlockSize, DEFAULT_CONSTRAINT_CONFIG.structural.labBlockSize, 1),
      theoryBlockSize: safeInt(
        structural.theoryBlockSize,
        DEFAULT_CONSTRAINT_CONFIG.structural.theoryBlockSize,
        1
      ),
    },
    weeklySubjectHours: {
      hard: toBool(weeklySubjectHours.hard, DEFAULT_CONSTRAINT_CONFIG.weeklySubjectHours.hard),
      shortageWeight: safeInt(
        weeklySubjectHours.shortageWeight,
        DEFAULT_CONSTRAINT_CONFIG.weeklySubjectHours.shortageWeight,
        0
      ),
    },
    noGaps: {
      hard: toBool(noGaps.hard, DEFAULT_CONSTRAINT_CONFIG.noGaps.hard),
      weight: safeInt(noGaps.weight, DEFAULT_CONSTRAINT_CONFIG.noGaps.weight, 0),
    },
    teacherContinuity: {
      enabled: toBool(teacherContinuity.enabled, DEFAULT_CONSTRAINT_CONFIG.teacherContinuity.enabled),
      maxConsecutive: safeInt(
        teacherContinuity.maxConsecutive,
        DEFAULT_CONSTRAINT_CONFIG.teacherContinuity.maxConsecutive,
        1
      ),
      weight: safeInt(teacherContinuity.weight, DEFAULT_CONSTRAINT_CONFIG.teacherContinuity.weight, 0),
    },
    classContinuity: {
      enabled: toBool(classContinuity.enabled, DEFAULT_CONSTRAINT_CONFIG.classContinuity.enabled),
      maxConsecutive: safeInt(
        classContinuity.maxConsecutive,
        DEFAULT_CONSTRAINT_CONFIG.classContinuity.maxConsecutive,
        1
      ),
      weight: safeInt(classContinuity.weight, DEFAULT_CONSTRAINT_CONFIG.classContinuity.weight, 0),
    },
    teacherDailyOverload: {
      enabled: toBool(
        teacherDailyOverload.enabled,
        DEFAULT_CONSTRAINT_CONFIG.teacherDailyOverload.enabled
      ),
      max: safeInt(teacherDailyOverload.max, DEFAULT_CONSTRAINT_CONFIG.teacherDailyOverload.max, 0),
      weight: safeInt(
        teacherDailyOverload.weight,
        DEFAULT_CONSTRAINT_CONFIG.teacherDailyOverload.weight,
        0
      ),
    },
    subjectClustering: {
      enabled: toBool(subjectClustering.enabled, DEFAULT_CONSTRAINT_CONFIG.subjectClustering.enabled),
      maxPerDay: safeInt(subjectClustering.maxPerDay, DEFAULT_CONSTRAINT_CONFIG.subjectClustering.maxPerDay, 1),
      weight: safeInt(subjectClustering.weight, DEFAULT_CONSTRAINT_CONFIG.subjectClustering.weight, 0),
    },
    frontLoading: {
      enabled: toBool(frontLoading.enabled, DEFAULT_CONSTRAINT_CONFIG.frontLoading.enabled),
      weight: safeInt(frontLoading.weight, DEFAULT_CONSTRAINT_CONFIG.frontLoading.weight, 0),
    },
    solver: {
      timeLimitSec: safeInt(solver.timeLimitSec, DEFAULT_CONSTRAINT_CONFIG.solver.timeLimitSec, 1),
    },
  };
}

export function loadConstraintConfig() {
  if (typeof window === "undefined") return { ...DEFAULT_CONSTRAINT_CONFIG };
  try {
    const raw = window.localStorage.getItem(TIMETABLE_CONSTRAINTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONSTRAINT_CONFIG };
    return normalizeConstraintConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONSTRAINT_CONFIG };
  }
}

export function saveConstraintConfig(config) {
  if (typeof window === "undefined") return;
  const normalized = normalizeConstraintConfig(config);
  window.localStorage.setItem(
    TIMETABLE_CONSTRAINTS_STORAGE_KEY,
    JSON.stringify(normalized)
  );
}
