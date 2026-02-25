import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DEFAULT_CONSTRAINT_CONFIG,
  loadConstraintConfig,
  normalizeConstraintConfig,
  saveConstraintConfig,
} from "./constraintConfig";

const STRENGTH_FACTORS = {
  low: 0.4,
  medium: 0.8,
  high: 1,
  very_high: 1.6,
};

function toStrength(base, weight) {
  if (!base || base <= 0) return "high";
  const ratio = weight / base;
  const entries = Object.entries(STRENGTH_FACTORS);
  let best = "high";
  let bestDiff = Infinity;
  for (const [k, factor] of entries) {
    const diff = Math.abs(ratio - factor);
    if (diff < bestDiff) {
      best = k;
      bestDiff = diff;
    }
  }
  return best;
}

function fromStrength(base, level) {
  const factor = STRENGTH_FACTORS[level] || 1;
  return Math.max(0, Math.round(base * factor));
}

function parseJsonOrDefault(text, fallback) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function TimetableSettings() {
  const [config, setConfig] = useState(() => loadConstraintConfig());
  const [savedAt, setSavedAt] = useState("");
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(loadConstraintConfig(), null, 2)
  );
  const [jsonError, setJsonError] = useState("");
  const [availabilityMapText, setAvailabilityMapText] = useState(() =>
    JSON.stringify(loadConstraintConfig().teacherAvailability?.unavailableSlotsByTeacher || {}, null, 2)
  );
  const [globalAvailabilityText, setGlobalAvailabilityText] = useState(() =>
    JSON.stringify(loadConstraintConfig().teacherAvailability?.globallyUnavailableSlots || [], null, 2)
  );
  const [teacherBoundaryOverridesText, setTeacherBoundaryOverridesText] = useState(() =>
    JSON.stringify(loadConstraintConfig().teacherBoundaryPreference?.teacherOverrides || {}, null, 2)
  );

  const strengths = useMemo(
    () => ({
      teacherContinuity: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.teacherContinuity.weight,
        config.teacherContinuity.weight
      ),
      classContinuity: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.classContinuity.weight,
        config.classContinuity.weight
      ),
      teacherDailyOverload: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.teacherDailyOverload.weight,
        config.teacherDailyOverload.weight
      ),
      subjectClustering: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.subjectClustering.weight,
        config.subjectClustering.weight
      ),
      frontLoading: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.frontLoading.weight,
        config.frontLoading.weight
      ),
      teacherAvailability: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.teacherAvailability.weight,
        config.teacherAvailability.weight
      ),
      teacherWeeklyLoadBalanceUnder: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.teacherWeeklyLoadBalance.underWeight,
        config.teacherWeeklyLoadBalance.underWeight
      ),
      teacherWeeklyLoadBalanceOver: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.teacherWeeklyLoadBalance.overWeight,
        config.teacherWeeklyLoadBalance.overWeight
      ),
      classDailyMinimumLoad: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.classDailyMinimumLoad.weight,
        config.classDailyMinimumLoad.weight
      ),
      teacherBoundaryPreference: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.teacherBoundaryPreference.weight,
        config.teacherBoundaryPreference.weight
      ),
      noGaps: toStrength(DEFAULT_CONSTRAINT_CONFIG.noGaps.weight, config.noGaps.weight),
      weeklySubjectHours: toStrength(
        DEFAULT_CONSTRAINT_CONFIG.weeklySubjectHours.shortageWeight,
        config.weeklySubjectHours.shortageWeight
      ),
    }),
    [config]
  );

  const updateConfig = (updater) => {
    setConfig((prev) => normalizeConstraintConfig(updater(prev)));
  };

  const save = () => {
    const normalized = normalizeConstraintConfig(config);
    saveConstraintConfig(normalized);
    setConfig(normalized);
    setJsonText(JSON.stringify(normalized, null, 2));
    setAvailabilityMapText(
      JSON.stringify(normalized.teacherAvailability.unavailableSlotsByTeacher || {}, null, 2)
    );
    setGlobalAvailabilityText(
      JSON.stringify(normalized.teacherAvailability.globallyUnavailableSlots || [], null, 2)
    );
    setTeacherBoundaryOverridesText(
      JSON.stringify(normalized.teacherBoundaryPreference.teacherOverrides || {}, null, 2)
    );
    setSavedAt(new Date().toLocaleString());
  };

  const resetDefaults = () => {
    const defaults = normalizeConstraintConfig(DEFAULT_CONSTRAINT_CONFIG);
    setConfig(defaults);
    setJsonText(JSON.stringify(defaults, null, 2));
    setAvailabilityMapText(
      JSON.stringify(defaults.teacherAvailability.unavailableSlotsByTeacher || {}, null, 2)
    );
    setGlobalAvailabilityText(
      JSON.stringify(defaults.teacherAvailability.globallyUnavailableSlots || [], null, 2)
    );
    setTeacherBoundaryOverridesText(
      JSON.stringify(defaults.teacherBoundaryPreference.teacherOverrides || {}, null, 2)
    );
    setJsonError("");
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const normalized = normalizeConstraintConfig(parsed);
      setConfig(normalized);
      setAvailabilityMapText(
        JSON.stringify(normalized.teacherAvailability.unavailableSlotsByTeacher || {}, null, 2)
      );
      setGlobalAvailabilityText(
        JSON.stringify(normalized.teacherAvailability.globallyUnavailableSlots || [], null, 2)
      );
      setTeacherBoundaryOverridesText(
        JSON.stringify(normalized.teacherBoundaryPreference.teacherOverrides || {}, null, 2)
      );
      setJsonError("");
    } catch {
      setJsonError("Invalid JSON. Please correct it before applying.");
    }
  };

  return (
    <div className="manage-container">
      <h2>Timetable Settings</h2>
      <div className="actions-bar">
        <button className="primary-btn" onClick={save}>Save Settings</button>
        <button className="secondary-btn" onClick={resetDefaults}>Reset Defaults</button>
        <button className="secondary-btn" onClick={() => setJsonMode((v) => !v)}>
          {jsonMode ? "Hide Advanced JSON" : "Show Advanced JSON"}
        </button>
        <Link className="secondary-btn" to="/timetable">Go To Generate</Link>
      </div>
      {savedAt ? <div>Saved at: {savedAt}</div> : null}

      <div className="filters-container" style={{ marginTop: 16 }}>
        <label>
          Days Per Week
          <input
            type="number"
            min="1"
            value={config.schedule.daysPerWeek}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                schedule: { ...prev.schedule, daysPerWeek: Number(e.target.value) || 1 },
              }))
            }
          />
        </label>
        <label>
          Hours Per Day
          <input
            type="number"
            min="1"
            value={config.schedule.hoursPerDay}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                schedule: { ...prev.schedule, hoursPerDay: Number(e.target.value) || 1 },
              }))
            }
          />
        </label>
        <label>
          Break Hours (comma separated)
          <input
            type="text"
            value={config.schedule.breakHours.join(",")}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                schedule: {
                  ...prev.schedule,
                  breakHours: e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                    .map((v) => Number(v)),
                },
              }))
            }
          />
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Weekly Subject Hours
          <select
            value={config.weeklySubjectHours.hard ? "hard" : "soft"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                weeklySubjectHours: {
                  ...prev.weeklySubjectHours,
                  hard: e.target.value === "hard",
                },
              }))
            }
          >
            <option value="hard">Hard Enforce</option>
            <option value="soft">Soft Enforce</option>
          </select>
        </label>
        <label>
          Weekly Hours Soft Strength
          <select
            value={strengths.weeklySubjectHours}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                weeklySubjectHours: {
                  ...prev.weeklySubjectHours,
                  shortageWeight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.weeklySubjectHours.shortageWeight,
                    e.target.value
                  ),
                },
              }))
            }
            disabled={config.weeklySubjectHours.hard}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          No Gaps Rule
          <select
            value={
              config.noGaps.hard ? "hard" : config.noGaps.weight > 0 ? "soft" : "disabled"
            }
            onChange={(e) =>
              updateConfig((prev) => {
                if (e.target.value === "hard") {
                  return { ...prev, noGaps: { ...prev.noGaps, hard: true } };
                }
                if (e.target.value === "soft") {
                  return {
                    ...prev,
                    noGaps: {
                      ...prev.noGaps,
                      hard: false,
                      weight:
                        prev.noGaps.weight > 0
                          ? prev.noGaps.weight
                          : DEFAULT_CONSTRAINT_CONFIG.noGaps.weight,
                    },
                  };
                }
                return { ...prev, noGaps: { ...prev.noGaps, hard: false, weight: 0 } };
              })
            }
          >
            <option value="hard">Hard</option>
            <option value="soft">Soft</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          No Gaps Soft Strength
          <select
            value={strengths.noGaps}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                noGaps: {
                  ...prev.noGaps,
                  weight: fromStrength(DEFAULT_CONSTRAINT_CONFIG.noGaps.weight, e.target.value),
                },
              }))
            }
            disabled={config.noGaps.hard || config.noGaps.weight === 0}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Teacher Max Daily Load
          <input
            type="number"
            min="0"
            value={config.teacherDailyOverload.max}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherDailyOverload: {
                  ...prev.teacherDailyOverload,
                  max: Number(e.target.value) || 0,
                },
              }))
            }
          />
        </label>
        <label>
          Teacher Daily Load Strength
          <select
            value={strengths.teacherDailyOverload}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherDailyOverload: {
                  ...prev.teacherDailyOverload,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.teacherDailyOverload.weight,
                    e.target.value
                  ),
                },
              }))
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Teacher Max Consecutive
          <input
            type="number"
            min="1"
            value={config.teacherContinuity.maxConsecutive}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherContinuity: {
                  ...prev.teacherContinuity,
                  maxConsecutive: Number(e.target.value) || 1,
                },
              }))
            }
          />
        </label>
        <label>
          Teacher Continuity Strength
          <select
            value={strengths.teacherContinuity}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherContinuity: {
                  ...prev.teacherContinuity,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.teacherContinuity.weight,
                    e.target.value
                  ),
                },
              }))
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Class Max Consecutive
          <input
            type="number"
            min="1"
            value={config.classContinuity.maxConsecutive}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                classContinuity: {
                  ...prev.classContinuity,
                  maxConsecutive: Number(e.target.value) || 1,
                },
              }))
            }
          />
        </label>
        <label>
          Class Continuity Strength
          <select
            value={strengths.classContinuity}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                classContinuity: {
                  ...prev.classContinuity,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.classContinuity.weight,
                    e.target.value
                  ),
                },
              }))
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Subject Max Per Day
          <input
            type="number"
            min="1"
            value={config.subjectClustering.maxPerDay}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                subjectClustering: {
                  ...prev.subjectClustering,
                  maxPerDay: Number(e.target.value) || 1,
                },
              }))
            }
          />
        </label>
        <label>
          Subject Clustering Strength
          <select
            value={strengths.subjectClustering}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                subjectClustering: {
                  ...prev.subjectClustering,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.subjectClustering.weight,
                    e.target.value
                  ),
                },
              }))
            }
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Front Loading
          <select
            value={config.frontLoading.enabled ? "enabled" : "disabled"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                frontLoading: {
                  ...prev.frontLoading,
                  enabled: e.target.value === "enabled",
                },
              }))
            }
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          Front Loading Strength
          <select
            value={strengths.frontLoading}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                frontLoading: {
                  ...prev.frontLoading,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.frontLoading.weight,
                    e.target.value
                  ),
                },
              }))
            }
            disabled={!config.frontLoading.enabled}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Teacher Availability
          <select
            value={config.teacherAvailability.enabled ? "enabled" : "disabled"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherAvailability: {
                  ...prev.teacherAvailability,
                  enabled: e.target.value === "enabled",
                },
              }))
            }
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          Teacher Availability Mode
          <select
            value={config.teacherAvailability.hard ? "hard" : "soft"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherAvailability: {
                  ...prev.teacherAvailability,
                  hard: e.target.value === "hard",
                },
              }))
            }
            disabled={!config.teacherAvailability.enabled}
          >
            <option value="hard">Hard</option>
            <option value="soft">Soft</option>
          </select>
        </label>
        <label>
          Teacher Availability Strength
          <select
            value={strengths.teacherAvailability}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherAvailability: {
                  ...prev.teacherAvailability,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.teacherAvailability.weight,
                    e.target.value
                  ),
                },
              }))
            }
            disabled={!config.teacherAvailability.enabled || config.teacherAvailability.hard}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>
          {'Global Unavailable Slots JSON ([{ "day": 5, "hour": 0 }])'}
        </label>
        <textarea
          value={globalAvailabilityText}
          onChange={(e) => setGlobalAvailabilityText(e.target.value)}
          onBlur={() =>
            updateConfig((prev) => ({
              ...prev,
              teacherAvailability: {
                ...prev.teacherAvailability,
                globallyUnavailableSlots: parseJsonOrDefault(globalAvailabilityText, []),
              },
            }))
          }
          rows={4}
          style={{ width: "100%", fontFamily: "Consolas, Menlo, monospace" }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>
          {'Teacher Unavailable Slots JSON ({"teacherId":[{"day":0,"hour":2}]})'}
        </label>
        <textarea
          value={availabilityMapText}
          onChange={(e) => setAvailabilityMapText(e.target.value)}
          onBlur={() =>
            updateConfig((prev) => ({
              ...prev,
              teacherAvailability: {
                ...prev.teacherAvailability,
                unavailableSlotsByTeacher: parseJsonOrDefault(availabilityMapText, {}),
              },
            }))
          }
          rows={6}
          style={{ width: "100%", fontFamily: "Consolas, Menlo, monospace" }}
        />
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Teacher Weekly Load Balance
          <select
            value={config.teacherWeeklyLoadBalance.enabled ? "enabled" : "disabled"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  enabled: e.target.value === "enabled",
                },
              }))
            }
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          Min Weekly Load
          <input
            type="number"
            min="0"
            value={config.teacherWeeklyLoadBalance.minWeeklyLoad}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  minWeeklyLoad: Number(e.target.value) || 0,
                },
              }))
            }
            disabled={!config.teacherWeeklyLoadBalance.enabled}
          />
        </label>
        <label>
          Target Weekly Load
          <input
            type="number"
            min="0"
            value={config.teacherWeeklyLoadBalance.targetWeeklyLoad}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  targetWeeklyLoad: Number(e.target.value) || 0,
                },
              }))
            }
            disabled={!config.teacherWeeklyLoadBalance.enabled}
          />
        </label>
        <label>
          Max Weekly Load
          <input
            type="number"
            min="0"
            value={config.teacherWeeklyLoadBalance.maxWeeklyLoad}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  maxWeeklyLoad: Number(e.target.value) || 0,
                },
              }))
            }
            disabled={!config.teacherWeeklyLoadBalance.enabled}
          />
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Min Weekly Load Rule
          <select
            value={config.teacherWeeklyLoadBalance.hardMin ? "hard" : "soft"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  hardMin: e.target.value === "hard",
                },
              }))
            }
            disabled={!config.teacherWeeklyLoadBalance.enabled}
          >
            <option value="soft">Soft</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label>
          Max Weekly Load Rule
          <select
            value={config.teacherWeeklyLoadBalance.hardMax ? "hard" : "soft"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  hardMax: e.target.value === "hard",
                },
              }))
            }
            disabled={!config.teacherWeeklyLoadBalance.enabled}
          >
            <option value="soft">Soft</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label>
          Underload Strength
          <select
            value={strengths.teacherWeeklyLoadBalanceUnder}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  underWeight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.teacherWeeklyLoadBalance.underWeight,
                    e.target.value
                  ),
                },
              }))
            }
            disabled={!config.teacherWeeklyLoadBalance.enabled || config.teacherWeeklyLoadBalance.hardMin}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
        <label>
          Overload Strength
          <select
            value={strengths.teacherWeeklyLoadBalanceOver}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherWeeklyLoadBalance: {
                  ...prev.teacherWeeklyLoadBalance,
                  overWeight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.teacherWeeklyLoadBalance.overWeight,
                    e.target.value
                  ),
                },
              }))
            }
            disabled={!config.teacherWeeklyLoadBalance.enabled || config.teacherWeeklyLoadBalance.hardMax}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Class Daily Minimum Load
          <select
            value={config.classDailyMinimumLoad.enabled ? "enabled" : "disabled"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                classDailyMinimumLoad: {
                  ...prev.classDailyMinimumLoad,
                  enabled: e.target.value === "enabled",
                },
              }))
            }
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          Min Slots Per Day
          <input
            type="number"
            min="0"
            value={config.classDailyMinimumLoad.minPerDay}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                classDailyMinimumLoad: {
                  ...prev.classDailyMinimumLoad,
                  minPerDay: Number(e.target.value) || 0,
                },
              }))
            }
            disabled={!config.classDailyMinimumLoad.enabled}
          />
        </label>
        <label>
          Daily Min Mode
          <select
            value={config.classDailyMinimumLoad.hard ? "hard" : "soft"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                classDailyMinimumLoad: {
                  ...prev.classDailyMinimumLoad,
                  hard: e.target.value === "hard",
                },
              }))
            }
            disabled={!config.classDailyMinimumLoad.enabled}
          >
            <option value="soft">Soft</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label>
          Daily Min Strength
          <select
            value={strengths.classDailyMinimumLoad}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                classDailyMinimumLoad: {
                  ...prev.classDailyMinimumLoad,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.classDailyMinimumLoad.weight,
                    e.target.value
                  ),
                },
              }))
            }
            disabled={!config.classDailyMinimumLoad.enabled || config.classDailyMinimumLoad.hard}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Teacher First/Last Period Preference
          <select
            value={config.teacherBoundaryPreference.enabled ? "enabled" : "disabled"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherBoundaryPreference: {
                  ...prev.teacherBoundaryPreference,
                  enabled: e.target.value === "enabled",
                },
              }))
            }
          >
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label>
          Avoid First Period
          <select
            value={config.teacherBoundaryPreference.avoidFirstPeriod ? "yes" : "no"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherBoundaryPreference: {
                  ...prev.teacherBoundaryPreference,
                  avoidFirstPeriod: e.target.value === "yes",
                },
              }))
            }
            disabled={!config.teacherBoundaryPreference.enabled}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          Avoid Last Period
          <select
            value={config.teacherBoundaryPreference.avoidLastPeriod ? "yes" : "no"}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherBoundaryPreference: {
                  ...prev.teacherBoundaryPreference,
                  avoidLastPeriod: e.target.value === "yes",
                },
              }))
            }
            disabled={!config.teacherBoundaryPreference.enabled}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          Boundary Strength
          <select
            value={strengths.teacherBoundaryPreference}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                teacherBoundaryPreference: {
                  ...prev.teacherBoundaryPreference,
                  weight: fromStrength(
                    DEFAULT_CONSTRAINT_CONFIG.teacherBoundaryPreference.weight,
                    e.target.value
                  ),
                },
              }))
            }
            disabled={!config.teacherBoundaryPreference.enabled}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", marginBottom: 6 }}>
          {'Teacher First/Last Overrides JSON ({"teacherId":{"avoidFirstPeriod":true,"avoidLastPeriod":false}})'}
        </label>
        <textarea
          value={teacherBoundaryOverridesText}
          onChange={(e) => setTeacherBoundaryOverridesText(e.target.value)}
          onBlur={() =>
            updateConfig((prev) => ({
              ...prev,
              teacherBoundaryPreference: {
                ...prev.teacherBoundaryPreference,
                teacherOverrides: parseJsonOrDefault(teacherBoundaryOverridesText, {}),
              },
            }))
          }
          rows={5}
          style={{ width: "100%", fontFamily: "Consolas, Menlo, monospace" }}
        />
      </div>

      <div className="filters-container" style={{ marginTop: 12 }}>
        <label>
          Lab Block Size
          <input
            type="number"
            min="1"
            value={config.structural.labBlockSize}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                structural: { ...prev.structural, labBlockSize: Number(e.target.value) || 1 },
              }))
            }
          />
        </label>
        <label>
          Theory Block Size
          <input
            type="number"
            min="1"
            value={config.structural.theoryBlockSize}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                structural: { ...prev.structural, theoryBlockSize: Number(e.target.value) || 1 },
              }))
            }
          />
        </label>
        <label>
          Solver Time Limit (seconds)
          <input
            type="number"
            min="1"
            value={config.solver.timeLimitSec}
            onChange={(e) =>
              updateConfig((prev) => ({
                ...prev,
                solver: { ...prev.solver, timeLimitSec: Number(e.target.value) || 1 },
              }))
            }
          />
        </label>
      </div>

      {jsonMode ? (
        <div style={{ marginTop: 16 }}>
          <h3>Advanced JSON</h3>
          <p style={{ marginTop: 0 }}>
            Advanced mode exposes raw numeric weights. Use only for expert tuning.
          </p>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={16}
            style={{ width: "100%", fontFamily: "Consolas, Menlo, monospace" }}
          />
          <div className="actions-bar" style={{ marginTop: 8 }}>
            <button className="secondary-btn" onClick={applyJson}>Apply JSON</button>
            <button
              className="secondary-btn"
              onClick={() => setJsonText(JSON.stringify(config, null, 2))}
            >
              Refresh JSON From Form
            </button>
          </div>
          {jsonError ? <div className="error-message">{jsonError}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

export default TimetableSettings;
