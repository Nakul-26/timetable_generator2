import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import axios from "../api/axios";
import { loadConstraintConfig } from "./constraintConfig";

const HEALTH_BLOCK_STORAGE_KEY = "timetable.blockGenerateOnHealthErrors";
const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };

function Timetable() {
  const [loading, setLoading] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [error, setError] = useState("");
  const [bestScore, setBestScore] = useState(null);
  const [facultyDailyHours, setFacultyDailyHours] = useState(null);

  // Async generation
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthReport, setHealthReport] = useState(null);
  const [healthSeverityFilter, setHealthSeverityFilter] = useState("all");
  const [blockGenerateOnHealthErrors, setBlockGenerateOnHealthErrors] = useState(() => {
    try {
      const raw = window.localStorage.getItem(HEALTH_BLOCK_STORAGE_KEY);
      return raw ? raw === "true" : false;
    } catch {
      return false;
    }
  });

  // Master data
  const [classes, setClasses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [combos, setCombos] = useState([]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  // Fixed slots
  const [fixedSlots, setFixedSlots] = useState({});
  const [constraintConfig, setConstraintConfig] = useState(() => loadConstraintConfig());
  const DAYS_PER_WEEK = Number(constraintConfig?.schedule?.daysPerWeek) || 6;
  const HOURS_PER_DAY = Number(constraintConfig?.schedule?.hoursPerDay) || 8;

  const classById = useMemo(() => new Map(classes.map((c) => [String(c._id), c])), [classes]);
  const facultyById = useMemo(
    () => new Map(faculties.map((f) => [String(f._id), f])),
    [faculties]
  );
  const subjectById = useMemo(
    () => new Map(subjects.map((s) => [String(s._id), s])),
    [subjects]
  );

  const normalizeTableShape = (table) => {
    if (!table || typeof table !== "object") return null;
    const out = {};
    for (const [classId, days] of Object.entries(table)) {
      if (Array.isArray(days)) {
        out[classId] = days;
        continue;
      }
      if (days && typeof days === "object") {
        const orderedDays = Object.keys(days)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => {
            const row = days[k];
            if (Array.isArray(row)) return row;
            if (row && typeof row === "object") {
              return Object.keys(row)
                .sort((a, b) => Number(a) - Number(b))
                .map((h) => row[h]);
            }
            return [];
          });
        out[classId] = orderedDays;
      }
    }
    return out;
  };

  const normalizeGenerationResult = (raw) => {
    if (!raw) return null;
    const payload = raw.result && typeof raw.result === "object" ? raw.result : raw;
    const classTimetables =
      payload.class_timetables ??
      payload.bestClassTimetables ??
      payload.partialData?.class_timetables ??
      null;
    const facultyTimetables =
      payload.faculty_timetables ??
      payload.bestFacultyTimetables ??
      payload.partialData?.faculty_timetables ??
      null;

    return {
      ...payload,
      class_timetables: normalizeTableShape(classTimetables),
      faculty_timetables: facultyTimetables,
    };
  };

  const hasRenderableTimetable = (data) => {
    const table = data?.class_timetables;
    return !!table && typeof table === "object" && Object.keys(table).length > 0;
  };

  /* ===================== DATA FETCH ===================== */

  const fetchAll = useCallback(async () => {
    try {
      const [classRes, facRes, subRes, comboRes] = await Promise.all([
        axios.get("/classes"),
        axios.get("/faculties"),
        axios.get("/subjects"),
        axios.get("/teacher-subject-combos"),
      ]);
      setClasses(classRes.data);
      setFaculties(facRes.data);
      setSubjects(subRes.data);
      setCombos(comboRes.data || []);
    } catch {
      setError("Failed to fetch master data.");
    }
  }, []);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/result/latest");
      setTimetable(res.data);
      if (res.data && res.data.combos) {
        setCombos(res.data.combos);
      }
      setBestScore(res.data?.score ?? null);
      setFacultyDailyHours(res.data?.faculty_daily_hours ?? null);
    } catch {
      setError("Failed to fetch latest timetable.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    fetchLatest();
  }, [fetchAll, fetchLatest]);

  useEffect(() => {
    const refreshConfig = () => setConstraintConfig(loadConstraintConfig());
    window.addEventListener("storage", refreshConfig);
    window.addEventListener("focus", refreshConfig);
    return () => {
      window.removeEventListener("storage", refreshConfig);
      window.removeEventListener("focus", refreshConfig);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        HEALTH_BLOCK_STORAGE_KEY,
        blockGenerateOnHealthErrors ? "true" : "false"
      );
    } catch {
      // ignore localStorage failures
    }
  }, [blockGenerateOnHealthErrors]);

  const sortedHealthWarnings = useMemo(() => {
    const list = Array.isArray(healthReport?.warnings) ? [...healthReport.warnings] : [];
    return list.sort((a, b) => {
      const sa = String(a?.severity || "warning").toLowerCase();
      const sb = String(b?.severity || "warning").toLowerCase();
      const ra = SEVERITY_RANK[sa] ?? 9;
      const rb = SEVERITY_RANK[sb] ?? 9;
      if (ra !== rb) return ra - rb;
      return String(a?.message || "").localeCompare(String(b?.message || ""));
    });
  }, [healthReport]);

  const filteredHealthWarnings = useMemo(() => {
    if (healthSeverityFilter === "all") return sortedHealthWarnings;
    return sortedHealthWarnings.filter(
      (w) => String(w?.severity || "warning").toLowerCase() === healthSeverityFilter
    );
  }, [sortedHealthWarnings, healthSeverityFilter]);

  const groupedHealthWarnings = useMemo(() => {
    const out = { error: [], warning: [], info: [] };
    for (const w of filteredHealthWarnings) {
      const s = String(w?.severity || "warning").toLowerCase();
      if (!out[s]) out[s] = [];
      out[s].push(w);
    }
    return out;
  }, [filteredHealthWarnings]);

  const healthErrorsCount = Number(healthReport?.summary?.errors || 0);
  const isGenerateBlockedByHealth =
    blockGenerateOnHealthErrors && healthReport && healthErrorsCount > 0;

  /* ===================== POLLING ===================== */

  useEffect(() => {
    if (!taskId) return;

    const poll = setInterval(async () => {
      try {
        const res = await api.get(`/generation-status/${taskId}`);
        const { status, progress, result, error, partialData } = res.data;

        if (status === "running") {
          setProgress(progress ?? 0);
          if (partialData) {
            const normalized = normalizeGenerationResult(partialData);
            if (hasRenderableTimetable(normalized)) {
              setTimetable(normalized);
            }
          }
        } else {
          if (status === "error") setError(error || "Generation failed");

          if (result || partialData) {
            const normalized = normalizeGenerationResult(result || partialData);
            setTimetable((prev) =>
              hasRenderableTimetable(normalized) ? normalized : prev
            );
            if (normalized?.ok === false && normalized?.error) {
              setError(normalized.error);
            }
            if (normalized?.classes) {
              setClasses(normalized.classes);
            }
            if (normalized?.combos) {
              setCombos(normalized.combos);
            }
            setBestScore(normalized?.score ?? null);
            setFacultyDailyHours(normalized?.faculty_daily_hours ?? null);
          } else if (partialData) {
            const normalized = normalizeGenerationResult(partialData);
            setTimetable(normalized);
            setBestScore(null);
            setFacultyDailyHours(null);
          }

          setLoading(false);
          setTaskId(null);
          clearInterval(poll);
        }
      } catch {
        setError("Failed to poll generation status.");
        setLoading(false);
        setTaskId(null);
        clearInterval(poll);
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [taskId]);

  /* ===================== FIXED SLOTS ===================== */

  const handleSlotChange = (classId, day, hour, comboId) => {
    setFixedSlots(prev => {
      const copy = { ...prev };
      if (!copy[classId]) copy[classId] = {};
      if (!copy[classId][day]) copy[classId][day] = {};
      if (comboId) copy[classId][day][hour] = comboId;
      else delete copy[classId][day][hour];
      return copy;
    });
  };

  const transformFixedSlots = slots => {
    const payload = [];
    Object.entries(slots).forEach(([classId, days]) => {
      Object.entries(days).forEach(([day, hours]) => {
        Object.entries(hours).forEach(([hour, combo]) => {
          if (combo) {
            payload.push({
              class: classId,
              day: Number(day),
              hour: Number(hour),
              combo,
            });
          }
        });
      });
    });
    return payload;
  };

  /* ===================== ACTIONS ===================== */

  const generateTimetable = async () => {
    if (isGenerateBlockedByHealth) {
      setError(
        "Generation blocked: health check contains errors. Resolve issues or disable blocking."
      );
      return;
    }

    setLoading(true);
    setError("");
    setTimetable(null);
    setProgress(0);

    try {
      const latestConstraintConfig = loadConstraintConfig();
      setConstraintConfig(latestConstraintConfig);

      await api.delete("/timetables");

      const payload = transformFixedSlots(fixedSlots);
      const classElectiveGroups =
        JSON.parse(localStorage.getItem("classElectiveGroups")) || [];
      const res = await api.post("/generate", {
        fixedSlots: payload,
        classElectiveGroups,
        constraintConfig: latestConstraintConfig,
      });
      setTaskId(res.data.taskId);
    } catch {
      setError("Failed to start generation.");
      setLoading(false);
    }
  };

  const runHealthCheck = async () => {
    setHealthLoading(true);
    setError("");
    try {
      const latestConstraintConfig = loadConstraintConfig();
      setConstraintConfig(latestConstraintConfig);
      const payload = transformFixedSlots(fixedSlots);
      const res = await api.post("/health-check", {
        fixedSlots: payload,
        constraintConfig: latestConstraintConfig,
      });
      setHealthReport(res.data || null);
    } catch {
      setError("Failed to run health check.");
    } finally {
      setHealthLoading(false);
    }
  };

  const stopGeneration = async () => {
    if (!taskId) return;
    try {
      await api.post(`/stop-generator/${taskId}`);
    } catch {
      /* ignore */
    }
  };

  const deleteAllTimetables = async () => {
    setLoading(true);
    try {
      await api.delete("/timetables");
      setTimetable(null);
    } catch {
      setError("Failed to delete timetables.");
    }
    setLoading(false);
  };

      const handleSave = async () => {
        if (!timetable) {
          alert("No timetable to save.");
          return;
        }
    
        const name = prompt("Please enter a name for this timetable:");
        if (!name) {
          return; // User cancelled
        }
    
        try {
          await api.post("/timetables", { name, timetable });
          alert("Timetable saved successfully!");
        } catch (err) {
          console.error("Error saving timetable:", err);
          alert(`Failed to save timetable: ${err.response?.data?.error || 'Server error'}`);
        }
      };
    
          const regenerateTimetable = async () => {
            try {
              await generateTimetable();
            } catch {
              setError("Failed to regenerate timetable.");
            }
          };
        
          /* ===================== HELPERS ===================== */
        
  const getClassName = id => {
    const cls = classes.find(c => String(c._id) === String(id));
    if (!cls) return id;
    const name = cls.name || cls.id || id;
    const semPart = cls.sem != null ? `Sem ${cls.sem}` : null;
    const sectionPart = cls.section ? `${cls.section}` : null;
    const meta = [semPart, sectionPart].filter(Boolean).join(", ");
    return meta ? `${name} (${meta})` : name;
  };

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };
        
          const getFacultyName = id => {
            const fac = faculties.find(f => String(f._id) === String(id));
            return fac ? fac.name : id;
          };

  const getSlotDisplay = (slot) => {
    if (!slot || slot === -1 || slot === "BREAK") {
      return { subjectName: "-", facultyNames: [] };
    }

    const combo = combos.find((c) => String(c._id) === String(slot));
    if (!combo) {
      return { subjectName: "?", facultyNames: [] };
    }

    const subject = subjectById.get(String(combo.subject_id));
    const subjectName = subject ? subject.name : `Elective ${String(combo.subject_id).slice(-4)}`;

    let facultyNames = [];
    if (combo.faculty_ids && Array.isArray(combo.faculty_ids)) {
      facultyNames = combo.faculty_ids.map((fid) => {
        const fac = facultyById.get(String(fid));
        return fac ? fac.name : "N/A";
      });
    } else if (combo.faculty_id) {
      const fac = facultyById.get(String(combo.faculty_id));
      facultyNames = [fac ? fac.name : "N/A"];
    }

    return { subjectName, facultyNames };
  };

  const buildPdfHtml = ({ entries, filtered }) => {
    const now = new Date();
    const filtersText = [
      selectedClass ? `Class: ${getClassName(selectedClass)}` : null,
      selectedFaculty ? `Faculty: ${getFacultyName(selectedFaculty)}` : null,
      selectedSubject
        ? `Subject: ${subjectById.get(String(selectedSubject))?.name || selectedSubject}`
        : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const sections = entries
      .map(([classId, slots]) => {
        const rows = slots
          .map((row, dayIndex) => {
            const cells = row
              .map((slot) => {
                const matches = filtered ? isCellMatching(slot) : true;
                const { subjectName, facultyNames } = getSlotDisplay(slot);
                const facultyLine = facultyNames.length
                  ? `<div class="faculty">${escapeHtml(facultyNames.join(", "))}</div>`
                  : "";
                return `<td class="${matches ? "" : "dim"}"><div class="subject">${escapeHtml(subjectName)}</div>${facultyLine}</td>`;
              })
              .join("");
            return `<tr><td class="day">Day ${dayIndex + 1}</td>${cells}</tr>`;
          })
          .join("");

        return `
          <div class="class-block">
            <h3>${escapeHtml(getClassName(classId))}</h3>
            <table>
              <thead>
                <tr>
                  <th>Day / Period</th>
                  ${Array.from({ length: HOURS_PER_DAY })
                    .map((_, p) => `<th>P${p + 1}</th>`)
                    .join("")}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `;
      })
      .join("");

    return `
      <div class="pdf-root">
        <h1>${filtered ? "Filtered Timetable" : "Generated Timetable"}</h1>
        <div class="meta">Generated on: ${escapeHtml(now.toLocaleString())}</div>
        ${filtered && filtersText ? `<div class="meta">Filters: ${escapeHtml(filtersText)}</div>` : ""}
        ${sections}
      </div>
    `;
  };

  const downloadPdfFromHtml = (html, title) => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      throw new Error("Unable to open print window.");
    }

    popup.document.open();
    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            @page { size: A4 portrait; margin: 10mm; }
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; }
            .pdf-root h1 { margin: 0 0 10px 0; }
            .pdf-root .meta { margin: 0 0 8px 0; font-size: 13px; color: #444; }
            .pdf-root .class-block { margin-top: 18px; page-break-inside: avoid; }
            .pdf-root .class-block h3 { margin: 0 0 8px 0; font-size: 16px; }
            .pdf-root table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            .pdf-root th, .pdf-root td { border: 1px solid #d0d0d0; padding: 6px; font-size: 10px; vertical-align: top; word-wrap: break-word; }
            .pdf-root th { background: #f2f2f2; }
            .pdf-root .day { font-weight: 700; width: 95px; }
            .pdf-root .subject { font-weight: 700; }
            .pdf-root .faculty { margin-top: 3px; color: #333; }
            .pdf-root .dim { opacity: 0.35; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const downloadGeneratedPdf = () => {
    if (!timetable || !timetable.class_timetables) {
      alert("No timetable available to download.");
      return;
    }

    const entries = Object.entries(timetable.class_timetables);
    if (!entries.length) {
      alert("No timetable data available to download.");
      return;
    }

    try {
      const html = buildPdfHtml({ entries, filtered: false });
      downloadPdfFromHtml(html, "Generated Timetable PDF");
    } catch {
      setError("Failed to download generated timetable PDF.");
    }
  };

  const downloadFilteredPdf = () => {
    if (!timetable || !timetable.class_timetables) {
      alert("No timetable available to download.");
      return;
    }

    const entries = filteredTimetable();
    if (!entries.length) {
      alert("No filtered timetable data available to download.");
      return;
    }

    try {
      const html = buildPdfHtml({ entries, filtered: true });
      downloadPdfFromHtml(html, "Filtered Timetable PDF");
    } catch {
      setError("Failed to download filtered timetable PDF.");
    }
  };


  const renderEmptyTable = (classId) => {
    return (
      <div key={classId} style={{ marginBottom: "30px" }}>
        <h3>
          Class: {getClassName(classId)}
        </h3>
        <table className="styled-table">
          <thead>
            <tr>
              <th>Day / Period</th>
              {Array.from({ length: HOURS_PER_DAY }).map((_, p) => (
                <th key={p}>P{p + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: DAYS_PER_WEEK }).map((_, d) => (
              <tr key={d}>
                <td>Day {d + 1}</td>
                {Array.from({ length: HOURS_PER_DAY }).map((_, h) => {
                  const selected =
                    fixedSlots[classId]?.[d]?.[h] || "";
                  return (
                    <td key={h}>
                      <select
                        value={selected}
                        onChange={(e) =>
                          handleSlotChange(classId, d, h, e.target.value)
                        }
                      >
                        <option value="">
                          --Select faculty-subject--
                        </option>
                        {combos && combos
                          .map((c) => {
                            const facultyNames = (c.faculty_ids || []).map(fid => {
                              const fac = faculties && faculties.find(f => String(f._id) === String(fid));
                              return fac ? fac.name : 'N/A'
                            }).join(' & ');

                            const subject = subjects && subjects.find(s => String(s._id) === String(c.subject_id));
                            const subjectName = subject ? subject.name : "N/A";

                            return (
                              <option key={c._id} value={c._id}>
                                {facultyNames} : {subjectName}
                              </option>
                            );
                          })}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const filteredTimetable = () => {
    if (!timetable || !timetable.class_timetables) {
      return [];
    }

    let allClassTimetables = Object.entries(timetable.class_timetables);

    if (selectedClass) {
      allClassTimetables = allClassTimetables.filter(
        ([classId]) => classId === selectedClass
      );
    }

    return allClassTimetables;
  };

  const isCellMatching = (slotComboId) => {
    const hasFilter = selectedFaculty || selectedSubject;
    if (!hasFilter) {
      return true; // No filter, all match
    }

    if (!slotComboId || slotComboId === -1 || slotComboId === "BREAK") {
      return false;
    }

    const combo = combos.find(c => String(c._id) === String(slotComboId));
    if (!combo) {
      return false;
    }

    const facultyMatch = () => {
        if (!selectedFaculty) return true;
        if (combo.faculty_ids) {
            return combo.faculty_ids.includes(selectedFaculty);
        } else if (combo.faculty_id) {
            return String(combo.faculty_id) === selectedFaculty;
        }
        return false;
    }

    const subjectMatch = () => {
        if (!selectedSubject) return true;
        return String(combo.subject_id) === selectedSubject;
    }

    return facultyMatch() && subjectMatch();
  };

  const calculateAssignedHours = (slots) => {
    const assignedHours = {};
    if (!slots || !combos) return assignedHours;

    slots.forEach(dayRow => {
      dayRow.forEach(slot => {
        if (slot && slot !== -1 && slot !== "BREAK") {
          const combo = combos.find(c => String(c._id) === String(slot));
          if (combo) {
            const subjectId = combo.subject_id;
            if (!assignedHours[subjectId]) {
              assignedHours[subjectId] = 0;
            }
            assignedHours[subjectId]++;
          }
        }
      });
    });
    return assignedHours;
  };

  const resetFilters = () => {
    setSelectedClass("");
    setSelectedFaculty("");
    setSelectedSubject("");
  };

  const clearFixedSlots = () => {
    setFixedSlots({});
  };

  /* ===================== RENDER ===================== */

  return (
    <div className="manage-container">
      <h2>Timetable Generator</h2>

      {loading && (
        <div style={{ margin: "10px 0" }}>
          <progress value={progress} max="100" style={{ width: "100%" }} />
          <span> {progress}%</span>
        </div>
      )}

      <div className="actions-bar">
        <button className="secondary-btn" onClick={runHealthCheck} disabled={loading || healthLoading}>
          {healthLoading ? "Checking..." : "Run Health Check"}
        </button>
        <button
          className="primary-btn"
          onClick={generateTimetable}
          disabled={loading || isGenerateBlockedByHealth}
          title={
            isGenerateBlockedByHealth
              ? "Blocked by health check errors"
              : "Generate timetable"
          }
        >
          Generate
        </button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={blockGenerateOnHealthErrors}
            onChange={(e) => setBlockGenerateOnHealthErrors(e.target.checked)}
          />
          Block generate on health errors
        </label>
        {/* <button className="danger-btn" onClick={stopGeneration} disabled={!loading}>
          Stop
        </button> */}
        {/* <button className="secondary-btn" onClick={fetchLatest} disabled={loading}>
          Fetch Latest
        </button> */}
        {/* <button className="secondary-btn" onClick={regenerateTimetable} disabled={loading}>
          Regenerate
        </button> */}
        <button className="secondary-btn" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
        {/* <button className="secondary-btn" onClick={deleteAllTimetables} disabled={loading}>
          Delete All
        </button> */}
        {/* <button className="primary-btn" onClick={handleSave} disabled={loading || !timetable}>
          Save Timetable
        </button> */}
        <button className="secondary-btn" onClick={downloadGeneratedPdf} disabled={loading || !timetable}>
          Download Generated PDF
        </button>
        <button className="secondary-btn" onClick={downloadFilteredPdf} disabled={loading || !timetable}>
          Download Filtered PDF
        </button>
      </div>

      {showFilters && (
        <div className="filters-container">
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map((cls) => (
              <option key={cls._id} value={cls._id}>
                {getClassName(cls._id)}
              </option>
            ))}
          </select>

          <select value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)}>
            <option value="">All Faculties</option>
            {faculties.map((fac) => (
              <option key={fac._id} value={fac._id}>
                {getFacultyName(fac._id)}
              </option>
            ))}
          </select>

          <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name}
              </option>
            ))}
          </select>

          <button onClick={resetFilters} className="secondary-btn">
            Reset
          </button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div style={{ marginTop: 20 }}>
        <h3>Active Constraint Policy</h3>
        <p style={{ marginTop: 0 }}>
          Configure solver rules on the dedicated settings page.
        </p>
        <div className="filters-container">
          <span>Days: {constraintConfig?.schedule?.daysPerWeek ?? 6}</span>
          <span>Hours: {constraintConfig?.schedule?.hoursPerDay ?? 8}</span>
          <span>Solver Time: {constraintConfig?.solver?.timeLimitSec ?? 180}s</span>
          <Link className="secondary-btn" to="/timetable/settings">
            Open Timetable Settings
          </Link>
        </div>
      </div>

      {healthReport ? (
        <div style={{ marginTop: 20 }}>
          <h3>Constraint Health Report</h3>
          <p style={{ marginTop: 0 }}>
            Status: <b>{healthReport.ok ? "Healthy" : "Needs Attention"}</b>
          </p>
          <div className="filters-container">
            <span>Class Required: {healthReport.summary?.totalClassRequiredHours ?? 0}</span>
            <span>Class Capacity: {healthReport.summary?.totalClassCapacityHours ?? 0}</span>
            <span>Errors: {healthReport.summary?.errors ?? 0}</span>
            <span>Warnings: {healthReport.summary?.warnings ?? 0}</span>
            <select
              value={healthSeverityFilter}
              onChange={(e) => setHealthSeverityFilter(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="error">Errors</option>
              <option value="warning">Warnings</option>
              <option value="info">Info</option>
            </select>
          </div>
          {isGenerateBlockedByHealth ? (
            <div className="error-message" style={{ marginTop: 10 }}>
              Generate is blocked because health check contains errors.
            </div>
          ) : null}
          {filteredHealthWarnings.length > 0 ? (
            <div style={{ marginTop: 10, maxHeight: 220, overflowY: "auto" }}>
              {["error", "warning", "info"].map((severity) => {
                const items = groupedHealthWarnings[severity] || [];
                if (!items.length) return null;
                return (
                  <div key={severity} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      {severity.toUpperCase()} ({items.length})
                    </div>
                    {items.map((w, idx) => (
                      <div
                        key={`${w.type || "warning"}-${severity}-${idx}`}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          marginBottom: 8,
                          background:
                            severity === "error"
                              ? "#ffe9e9"
                              : severity === "warning"
                                ? "#fff8e5"
                                : "#eaf4ff",
                          border:
                            severity === "error"
                              ? "1px solid #e0b4b4"
                              : severity === "warning"
                                ? "1px solid #e6d6a8"
                                : "1px solid #b6d4ef",
                        }}
                      >
                        <b>{severity.toUpperCase()}</b>: {w.message}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ marginTop: 8 }}>No issues detected.</p>
          )}
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <h3>Fixed Classes (Empty Timetable)</h3>
        <p style={{ marginTop: 0 }}>
          Assign slots here to lock them before you generate.
        </p>
        <button className="secondary-btn" onClick={clearFixedSlots} disabled={loading}>
          Clear Fixed Classes
        </button>
        <div style={{ marginTop: 14 }}>
          {(selectedClass
            ? classes.filter((cls) => String(cls._id) === String(selectedClass))
            : classes
          ).map((cls) => renderEmptyTable(cls._id))}
        </div>
      </div>

      {timetable && timetable.class_timetables && (
        <div style={{ marginTop: 20 }}>
          {filteredTimetable().map(([classId, slots]) => {
            const assignedHours = calculateAssignedHours(slots);
            const currentClass = classById.get(classId);

            return (
              <div key={classId} style={{ marginBottom: 40 }}>
                <h3>{getClassName(classId)}</h3>
                <table className="styled-table">
                  <thead>
                    <tr>
                      <th>Day / Period</th>
                      {Array.from({ length: HOURS_PER_DAY }).map((_, p) => (
                        <th key={p}>P{p + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((row, d) => (
                      <tr key={d}>
                        <td>Day {d + 1}</td>
                        {row.map((slot, h) => {
                          const cellMatches = isCellMatching(slot);
                          const cellStyle = { opacity: cellMatches ? 1 : 0.3 };

                          if (!slot || slot === -1 || slot === "BREAK") {
                            return <td key={h} style={cellStyle}>-</td>;
                          }

                          const combo = combos && combos.find(c => String(c._id) === String(slot));
                          if (!combo) {
                            return <td key={h} style={cellStyle}>?</td>;
                          }

                          const subject = subjects && subjects.find(s => String(s._id) === String(combo.subject_id));
                          const subjectName = subject ? subject.name : `Elective ${combo.subject_id.slice(-4)}`;

                          let facultyNames = [];
                          if (combo.faculty_ids) {
                              facultyNames = (combo.faculty_ids || []).map(tid => {
                                  const faculty = faculties && faculties.find(f => String(f._id) === String(tid));
                                  return faculty ? faculty.name : "N/A";
                              });
                          } else if (combo.faculty_id) {
                              const faculty = faculties && faculties.find(f => String(f._id) === String(combo.faculty_id));
                              if (faculty) {
                                  facultyNames.push(faculty.name);
                              } else {
                                  facultyNames.push("N/A");
                              }
                          }

                          return (
                            <td key={h} style={cellStyle}>
                              <div>
                                <b>{subjectName}</b>
                              </div>
                              {facultyNames.map((name, i) => <div key={i}>{name}</div>)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: '10px' }}>
                    <h4 style={{ marginBottom: '5px' }}>Subject Hours Report</h4>
                    {(() => {
                        if (!currentClass) return null;

                        const assignedElectiveIds = new Set();
                        slots.flat().forEach(slot => {
                            if(!slot || slot === -1 || slot === "BREAK") return;
                            const combo = combos.find(c => String(c._id) === String(slot));
                            if (combo && !subjects.find(s => s._id === combo.subject_id)) {
                                assignedElectiveIds.add(combo.subject_id);
                            }
                        });

                        return (
                            <>
                                {currentClass.subject_hours && Object.entries(currentClass.subject_hours).map(([subjectId, requiredHours]) => {
                                    const subject = subjects.find(s => String(s._id) === String(subjectId));
                                    if (!subject) return null;
                                    const assigned = assignedHours[subjectId] || 0;
                                    
                                    if (assigned === 0 && assignedElectiveIds.size > 0) return null;
                                    if (assigned === 0 && requiredHours === 0) return null;

                                    return (
                                        <div key={subjectId}>
                                            <span>{subject.name}: {assigned} / {requiredHours}</span>
                                        </div>
                                    )
                                })}
                                {Array.from(assignedElectiveIds).map(subjectId => {
                                    const assigned = assignedHours[subjectId] || 0;
                                    if (assigned === 0) return null;
                                    const name = `Elective ${subjectId.slice(-4)}`;
                                    const requiredHours = currentClass?.subject_hours?.[subjectId] ?? 'N/A';
                                    return (
                                        <div key={subjectId}>
                                            <span>{name}: {assigned} / {requiredHours}</span>
                                        </div>
                                    );
                                })}
                            </>
                        );
                    })()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  );
}

export default Timetable;
