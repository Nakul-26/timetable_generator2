import React, { useState, useEffect, useCallback } from "react";
import api from "../api/axios";
import axios from "../api/axios";

function Timetable() {
  const [loading, setLoading] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [error, setError] = useState("");
  const [bestScore, setBestScore] = useState(null);
  const [facultyDailyHours, setFacultyDailyHours] = useState(null);

  // Async generation
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(0);

  // Master data
  const [classes, setClasses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  // Fixed slots
  const [fixedSlots, setFixedSlots] = useState({});

  const DAYS_PER_WEEK = 6;
  const HOURS_PER_DAY = 8;

  /* ===================== DATA FETCH ===================== */

  const fetchAll = useCallback(async () => {
    try {
      const [classRes, facRes, subRes] = await Promise.all([
        axios.get("/classes"),
        axios.get("/faculties"),
        axios.get("/subjects"),
      ]);
      setClasses(classRes.data);
      setFaculties(facRes.data);
      setSubjects(subRes.data);
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

  /* ===================== POLLING ===================== */

  useEffect(() => {
    if (!taskId) return;

    const poll = setInterval(async () => {
      try {
        const res = await api.get(`/generation-status/${taskId}`);
        const { status, progress, result, error, partialData } = res.data;

        if (status === "running") {
          setProgress(progress ?? 0);
          if (partialData) setTimetable(partialData);
        } else {
          if (status === "error") setError(error || "Generation failed");

          if (result) {
            setTimetable(result);
            setBestScore(result.score ?? null);
            setFacultyDailyHours(result.faculty_daily_hours ?? null);
          } else if (partialData) {
            setTimetable(partialData);
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
    setLoading(true);
    setError("");
    setTimetable(null);
    setProgress(0);

    try {
      const payload = transformFixedSlots(fixedSlots);
      const classElectiveGroups =
        JSON.parse(localStorage.getItem("classElectiveGroups")) || [];
      const res = await api.post("/generate", {
        fixedSlots: payload,
        classElectiveGroups,
      });
      setTaskId(res.data.taskId);
    } catch {
      setError("Failed to start generation.");
      setLoading(false);
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

    } catch (err) {
      console.error("Error saving timetable:", err);
      alert(`Failed to save timetable: ${err.response?.data?.error || 'Server error'}`);
    }
  };

    } catch {
      setError("Failed to regenerate timetable.");
    }

  /* ===================== HELPERS ===================== */

  const getClassName = id => {
    const cls = classes.find(c => String(c._id) === String(id));
    return cls
      ? `${cls.id}, ${cls.name} (Sem ${cls.sem}, ${cls.section})`
      : id;
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
                        {timetable && timetable.combos && timetable.combos
                          .map((c) => {
                            const facultyNames = (c.faculty_ids || []).map(fid => {
                              const fac = faculties.find(f => String(f._id) === String(fid));
                              return fac ? fac.name : 'N/A'
                            }).join(' & ');

                            const subject = subjects.find(s => String(s._id) === String(c.subject_id));
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
    const comboSource = timetable.combos;

    if (selectedClass) {
      allClassTimetables = allClassTimetables.filter(
        ([classId]) => classId === selectedClass
      );
    }

    if (selectedFaculty) {
      allClassTimetables = allClassTimetables.filter(([, classSlots]) => {
        return Object.values(classSlots).some(dayRow =>
          Object.values(dayRow).some(slotComboId => {
            if (!slotComboId || slotComboId === -1 || slotComboId === "BREAK") return false;
            
            const combo = comboSource.find(c => String(c._id) === String(slotComboId));
            if (!combo) return false;

            const teacherIds = combo.faculty_ids || [];
            return teacherIds.includes(selectedFaculty);
          })
        );
      });
    }

    if (selectedSubject) {
      allClassTimetables = allClassTimetables.filter(([, classSlots]) => {
        return Object.values(classSlots).some(dayRow =>
          Object.values(dayRow).some(slotComboId => {
            if (!slotComboId || slotComboId === -1 || slotComboId === "BREAK") return false;
            
            const combo = comboSource.find(c => String(c._id) === String(slotComboId));
            return combo && String(combo.subject_id) === selectedSubject;
          })
        );
      });
    }

    return allClassTimetables;
  };

  const resetFilters = () => {
    setSelectedClass("");
    setSelectedFaculty("");
    setSelectedSubject("");
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
        <button className="primary-btn" onClick={generateTimetable} disabled={loading}>
          Generate
        </button>
        <button className="danger-btn" onClick={stopGeneration} disabled={!loading}>
          Stop
        </button>
        <button className="secondary-btn" onClick={fetchLatest} disabled={loading}>
          Fetch Latest
        </button>
        <button className="secondary-btn" onClick={regenerateTimetable} disabled={loading}>
          Regenerate
        </button>
        <button className="secondary-btn" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
        <button className="secondary-btn" onClick={deleteAllTimetables} disabled={loading}>
          Delete All
        </button>
        <button className="primary-btn" onClick={handleSave} disabled={loading || !timetable}>
          Save Timetable
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

      {/* Empty timetable with assignment dropdowns */}
      {!timetable &&
        classes.map((cls) => renderEmptyTable(cls._id))}

      {timetable && timetable.class_timetables && (
        <div style={{ marginTop: 20 }}>
          {filteredTimetable().map(([classId, slots]) => (
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
                        if (!slot || slot === -1 || slot === "BREAK") {
                          return <td key={h}>-</td>;
                        }

                        const combo = timetable.combos.find(c => String(c._id) === String(slot));
                        if (!combo) {
                          return <td key={h}>?</td>;
                        }

                        const subject = subjects.find(s => String(s._id) === String(combo.subject_id));
                        const subjectName = subject ? subject.name : "N/A";

                        const facultyNames = (combo.faculty_ids || []).map(tid => {
                          const faculty = faculties.find(f => String(f._id) === String(tid));
                          return faculty ? faculty.name : "N/A";
                        });

                        return (
                          <td key={h}>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Timetable;
