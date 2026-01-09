import React, { useState, useEffect } from "react";
import api from "../api/axios";
import axios from "../api/axios";

function Timetable() {
  const [loading, setLoading] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [error, setError] = useState("");
  const [bestScore, setBestScore] = useState(null);
  const [facultyDailyHours, setFacultyDailyHours] = useState(null);

  // New state for async generation
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(0);

  const [classes, setClasses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [combos, setCombos] = useState([]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  // Fixed slots state
  // Structure: { classId: { day: { period: comboId } } }
  const [fixedSlots, setFixedSlots] = useState({});
  const DAYS_PER_WEEK = 6;
  const HOURS_PER_DAY = 8;

  const fetchAll = async () => {
    try {
      const [classRes, facRes, subRes, comboRes] = await Promise.all([
        axios.get("/classes"),
        axios.get("/faculties"),
        axios.get("/subjects"),
        axios.get("/teacher-subject-combos") // New fetch
      ]);
      setClasses(classRes.data);
      setFaculties(facRes.data);
      setSubjects(subRes.data);
      setCombos(comboRes.data); // New state update
    } catch (err) {
      setError("Failed to fetch data.");
    }
  };

  useEffect(() => {
    fetchAll();
    fetchLatest();
  }, []);

  useEffect(() => {
    if (!taskId) return;

    const poll = setInterval(async () => {
      try {
        const res = await api.get(`/generation-status/${taskId}`);
        const { status, progress, result, error, partialData } = res.data;

        if (status === 'running') {
          setProgress(progress);
          if(partialData) {
            setTimetable(partialData);
          }

        } else { // status is 'completed' or 'error'
          if (status === 'error') {
            setError(error);
          }
          // Always try to set the timetable if available, regardless of final status
          if (result) {
            setTimetable(result);
            setBestScore(result?.score || null);
            setFacultyDailyHours(result?.faculty_daily_hours || null);
          } else if (partialData) { // Fallback to partialData if no full result
            setTimetable(partialData);
            // bestScore and facultyDailyHours are not part of partialData from progressCallback, clear them.
            setBestScore(null); 
            setFacultyDailyHours(null);
          } else {
             setTimetable(null); // Clear if absolutely no data available
          }

          setLoading(false);
          setTaskId(null);
          clearInterval(poll);
        }
      } catch (e) {
        setError("Failed to get generation status.");
        setLoading(false);
        setTaskId(null);
        clearInterval(poll);
      }
    }, 2000); // poll every 2 seconds

    return () => clearInterval(poll);
  }, [taskId]);

  // Handle dropdown change in empty timetable
  const handleSlotChange = (classId, day, hour, comboId) => {
    setFixedSlots((prev) => {
      const copy = { ...prev };
      if (!copy[classId]) copy[classId] = {};
      if (!copy[classId][day]) copy[classId][day] = {};
      if (comboId) {
        copy[classId][day][hour] = comboId;
      } else {
        delete copy[classId][day][hour];
      }
      return copy;
    });
  };

  const renderEmptyTable = (classId) => {
    const cls = classes.find((c) => c._id === classId);
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
                        {combos
                      .map((c) => {
                        return (
                          <option key={c._id} value={c._id}>
                            {c.faculty ? `${c.faculty.name}` : "-none-"} : {c.subject ? `${c.subject.name}` : "-none-"}
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

  const transformFixedSlots = (slots) => {
    const payload = [];
    for (const classId in slots) {
      if (Object.hasOwnProperty.call(slots, classId)) {
        const days = slots[classId];
        for (const day in days) {
          if (Object.hasOwnProperty.call(days, day)) {
            const hours = days[day];
            for (const hour in hours) {
              if (Object.hasOwnProperty.call(hours, hour)) {
                const comboId = hours[hour];
                if (comboId) {
                  payload.push({
                    class: classId,
                    day: parseInt(day, 10),
                    hour: parseInt(hour, 10),
                    combo: comboId,
                  });
                }
              }
            }
          }
        }
      }
    }
    return payload;
  };

  const generateTimetable = async () => {
    setLoading(true);
    setError("");
    setTimetable(null);
    setProgress(0);
    setTaskId(null);

    try {
      const payload = transformFixedSlots(fixedSlots);
      const classElectiveGroups = JSON.parse(localStorage.getItem('classElectiveGroups')) || [];
      const res = await api.post("/generate", { fixedSlots: payload, classElectiveGroups });
      setTaskId(res.data.taskId);
    } catch (e) {
      setError(e.response?.data?.error || "Failed to start timetable generation");
      setLoading(false);
    }
  };

  const stopGeneration = async () => {
    if (!taskId) return;
    try {
      await api.post(`/stop-generator/${taskId}`);
    } catch (e) {
      console.error("Failed to send stop signal", e);
    }
  };

  const fetchLatest = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/result/latest");
      setTimetable(res.data);
      setBestScore(res.data?.score || null);
      setFacultyDailyHours(res.data?.faculty_daily_hours || null);
      await fetchAll();
    } catch (e) {
      setError("Failed to fetch timetable");
    }
    setLoading(false);
  };

  const regenerateTimetable = async () => {
    setLoading(true);
    deleteAllTimetables();
    setError("");
    try {
      const payload = transformFixedSlots(fixedSlots);
      const classElectiveGroups = JSON.parse(localStorage.getItem('classElectiveGroups')) || [];
      const res = await api.post("/result/regenerate", { fixedSlots: payload, classElectiveGroups }); // ✅ include fixed slots and elective groups
      if (res.data?.ok) {
        setTimetable(res.data);
        setBestScore(res.data.score || null);
        setFacultyDailyHours(res.data.faculty_daily_hours || null);
      } else {
        setError("Failed to regenerate timetable");
      }
    } catch (e) {
      setError(e.response?.data?.error || "Failed to regenerate timetable");
    }
    setLoading(false);
  };

  const deleteAllTimetables = async () => {
    setLoading(true);
    setError("");
    try {
      await api.delete("/timetables");
    } catch (e) {
      setError(e.response?.data?.error || "Failed to delete timetables");
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
      const payload = {
        name,
        timetableData: timetable,
      };
      await api.post("/timetables", payload);
      alert("Timetable saved successfully!");
    } catch (err) {
      console.error("Error saving timetable:", err);
      alert(`Failed to save timetable: ${err.response?.data?.error || 'Server error'}`);
    }
  };

  // Helpers
  const getClassName = (id) => {
    const cls = classes.find((c) => String(c._id) === String(id));
    return cls ? `${cls.id}, ${cls.name} (Sem: ${cls.sem}, Section: ${cls.section})` : id;
  };

  const getFacultyName = (id) => {
    const fac = faculties.find((f) => String(f._id) === String(id));
    return fac ? `${fac.name} (${fac.id})` : id;
  };

  const getSubjectName = (id) => {
    const sub = subjects.find((s) => String(s._id) === String(id));
    return sub ? `${sub.name} (${sub.id})` : id;
  };

  const toggleFixedSlot = (classId, dayIdx, periodIdx, comboId) => {
    console.log("Toggling fixed slot:", classId, dayIdx, periodIdx, comboId);
    setFixedSlots((prev) => {
      const copy = { ...prev };
      if (!copy[classId]) copy[classId] = {};
      if (!copy[classId][dayIdx]) copy[classId][dayIdx] = {};
      if (copy[classId][dayIdx][periodIdx] === comboId) {
        delete copy[classId][dayIdx][periodIdx];
      } else {
        copy[classId][dayIdx][periodIdx] = comboId;
      }
      return copy;
    });
  };

  const renderClassTable = (classId, slots, allocationsReportForClass) => {
    if (!timetable || !timetable.class_timetables) {
      return null;
    }
    return (
      <div key={classId} style={{ marginBottom: "40px" }}>
        <h3 style={{ marginBottom: "10px" }}>
          Class: {getClassName(classId)}
        </h3>
        <table className="styled-table">
          <thead>
            <tr>
              <th>Day / Period</th>
              {Array.from({ length: HOURS_PER_DAY }).map((_, p) => (
                <th key={p}>
                  P{p + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((dayRow, dayIdx) => (
              <tr key={dayIdx}>
                <td>Day {dayIdx + 1}</td>
                {dayRow.map((slotId, p) => {
                  const slot = dayRow[p];
                  if (!slot || slot === -1 || slot === "BREAK") {
                    return <td key={p}>-</td>;
                  }
                  
                  // New data structure: slot is { comboId, teacherIds }
                  const comboSource = timetable.combos || combos;
                  const comboId = slot;
                  const combo = comboSource.find(c => String(c._id) === String(comboId));
                  const teacherIds = combo?.faculty_ids || [];
                  
                  if (!combo) {
                    return <td key={p}>?</td>;
                  }

                  const subject = subjects.find(s => String(s._id) === String(combo.subject_id));
                  const subjectName = subject ? subject.name : "N/A";

                  // Find all teacher names
                  const facultyNames = (teacherIds || []).map(tid => {
                    const faculty = faculties.find(f => String(f._id) === String(tid));
                    return faculty ? faculty.name : "N/A";
                  });

                  const isFixed =
                    fixedSlots[classId]?.[dayIdx]?.[p] === combo._id;
                  
                  // For filtering, check if any of the assigned teachers match
                  const isFilteredOut = (selectedFaculty && !(teacherIds || []).includes(selectedFaculty)) ||
                                        (selectedSubject && String(combo.subject_id) !== selectedSubject);

                  return (
                    <td
                      key={p}
                      style={{
                        backgroundColor: isFixed ? "#d1ffd1" : "inherit",
                        cursor: "pointer",
                        opacity: isFilteredOut ? 0.3 : 1,
                      }}
                      title={
                        isFixed ? "Click to unfix this slot" : "Click to fix slot"
                      }
                    >
                      <div>
                        <b>{subjectName}</b>
                      </div>
                      {/* Render all teacher names */}
                      {facultyNames.map((name, i) => <div key={i}>{name}</div>)}

                      {isFixed && (
                        <div style={{ fontSize: "0.8em" }}>📌 Fixed</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        
        {console.log("Allocations Report for Class:", allocationsReportForClass)}
        {allocationsReportForClass && allocationsReportForClass.subjects && (
          <div style={{ marginTop: "20px", borderTop: "1px solid #eee", paddingTop: "15px" }}>
            <h4>Allocation Summary for {allocationsReportForClass.className}</h4>
            <table className="styled-table compact-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Required</th>
                  <th>Allocated</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allocationsReportForClass.subjects.map((subj, index) => (
                  <tr key={index}>
                    <td>{subj.subjectName}</td>
                    <td>{subj.requiredHours}</td>
                    <td>{subj.allocatedHours}</td>
                    <td>{subj.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderFacultyDailyHours = () => {
    if (!facultyDailyHours) return null;
    return (
      <div style={{ marginTop: "40px" }}>
        <h3>Faculty Daily Hours</h3>
        <table className="styled-table">
          <thead>
            <tr>
              <th>Faculty</th>
              {Array.from({ length: DAYS_PER_WEEK }).map((_, day) => (
                <th key={day}>Day {day + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(facultyDailyHours).map(([facultyId, dailyHours]) => (
              <tr key={facultyId}>
                <td>{getFacultyName(facultyId)}</td>
                {Array.from({ length: DAYS_PER_WEEK }).map((_, day) => (
                  <td key={day}>{dailyHours[day] || 0}</td>
                ))}
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
    const comboSource = timetable.combos || combos; // Use timetable.combos if available

    // Filter by selected class
    if (selectedClass) {
      allClassTimetables = allClassTimetables.filter(
        ([classId]) => classId === selectedClass
      );
    }

    // Filter by selected faculty
    if (selectedFaculty) {
      allClassTimetables = allClassTimetables.filter(([classId, classSlots]) => {
        return Object.values(classSlots).some(dayRow =>
          Object.values(dayRow).some(slotComboId => { // slot is now comboId string
            if (!slotComboId || slotComboId === -1 || slotComboId === "BREAK") return false;
            
            const combo = comboSource.find(c => String(c._id) === String(slotComboId));
            if (!combo) return false;

            const teacherIds = combo.faculty_ids || [];
            return teacherIds.includes(selectedFaculty);
          })
        );
      });
    }

    // Filter by selected subject
    if (selectedSubject) {
      allClassTimetables = allClassTimetables.filter(([classId, classSlots]) => {
        return Object.values(classSlots).some(dayRow =>
          Object.values(dayRow).some(slotComboId => { // slot is now comboId string
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

  return (
    <div className="manage-container">
      <h2>Timetable Generator</h2>

      {loading && (
        <div style={{margin: "10px 0"}}>
          <progress value={progress} max="100" style={{width: "100%"}} />
          <span>  {progress}%</span>
        </div>
      )}
      <div className="actions-bar">
        <button className="primary-btn" onClick={generateTimetable} disabled={loading}>
          {loading ? "Generating..." : "Generate Timetable"}
        </button>
        <button className="danger-btn" onClick={stopGeneration} disabled={!loading}>
          Stop
        </button>
        <button className="secondary-btn" onClick={fetchLatest} disabled={loading}>
          Fetch Latest
        </button>
        <button className="secondary-btn" onClick={regenerateTimetable} disabled={loading}>
          {loading ? "Regenerating..." : "Regenerate Timetable"}
        </button>
        <button className="secondary-btn" onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
        <button className="secondary-btn" onClick={deleteAllTimetables} disabled={loading}>
          Delete All Timetables
        </button>
        <button className="primary-btn" onClick={handleSave} disabled={loading || !timetable}>
          Save Timetable
        </button>
      </div>

      {bestScore !== null && (
        <div style={{ marginTop: "10px", fontWeight: "bold" }}>
          🏆 Best Score: {bestScore}
        </div>
      )}

      {showFilters && (
        <div className="filters-container">
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map((cls) => (
              <option key={cls._id} value={cls._id}>
                {cls.name} ({cls.id})
              </option>
            ))}
          </select>

          <select value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)}>
            <option value="">All Faculties</option>
            {faculties.map((fac) => (
              <option key={fac._id} value={fac._id}>
                {fac.name} ({fac.id})
              </option>
            ))}
          </select>

          <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub._id} value={sub._id}>
                {sub.name} ({sub.id})
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

      {/* Generated timetable */}
      {console.log("Current Timetable State:", timetable , timetable && timetable.class_timetables)}
      {timetable && timetable.class_timetables && (

        <div style={{ marginTop: "20px" }}>
          {filteredTimetable().map(([classId, slots]) => {
            const allocationsReportForClass = timetable.allocations_report?.[classId];
            return renderClassTable(classId, slots, allocationsReportForClass);
          })}
          {renderFacultyDailyHours()}
        </div>
      )}

      {/* Message for assignment-only records */}
      {timetable && !timetable.class_timetables && (
        <div className="info-message" style={{ marginTop: '20px' }}>
          <p>The currently loaded data ('{timetable.name}') is an 'assignment-only' record and does not contain a full timetable schedule.</p>
          <p>Please use the 'Generate Timetable' button to create and view a complete schedule.</p>
        </div>
      )}
    </div>
  );
}

export default Timetable;