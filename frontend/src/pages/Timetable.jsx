import React, { useState, useEffect } from "react";
import api from "../api/axios";
import axios from "../api/axios";

function Timetable() {
  const [loading, setLoading] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [error, setError] = useState("");
  const [bestScore, setBestScore] = useState(null);
  const [facultyDailyHours, setFacultyDailyHours] = useState(null);

  const [classes, setClasses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classCombos, setClassCombos] = useState([]);

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
      const [comboRes, classRes, facRes, subRes] = await Promise.all([
        axios.get("/create-and-assign-combos"),
        axios.get("/classes"),
        axios.get("/faculties"),
        axios.get("/subjects"),
      ]);
      setClassCombos(comboRes.data);
      setClasses(classRes.data);
      setFaculties(facRes.data);
      setSubjects(subRes.data);
    } catch (err) {
      setError("Failed to fetch data.");
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

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
          Class: {cls?.sem} {cls?.section}
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
                        {classCombos
                          .filter((c) => c.class_ids && c.class_ids.some(cls => cls._id === classId))
                          .map((c) => {
                            const fac = c.faculty_id;
                            const sub = c.subject_id;
                            return (
                              <option key={c._id} value={c._id}>
                                {fac ? `${fac.name} (${fac.id})` : "-none-"} : {sub ? `${sub.name} (${sub.id})` : "-none-"}
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
    deleteAllTimetables();
    setError("");
    try {
      const payload = transformFixedSlots(fixedSlots);
      await api.post("/generate", { fixedSlots: payload }); // ✅ include fixed slots
      await fetchLatest();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to generate timetable");
    }
    setLoading(false);
  };

  const fetchLatest = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/result/latest");
      setTimetable(res.data);
      setBestScore(res.data?.score || null);
      setFacultyDailyHours(res.data?.faculty_daily_hours || null);
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
      const res = await api.post("/result/regenerate", { fixedSlots: payload }); // ✅ include fixed slots
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

  // Helpers
  const getClassName = (id) => {
    const cls = classes.find((c) => String(c._id) === String(id));
    return cls ? `${cls.name} (${cls.id})` : id;
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

  const renderClassTable = (classId, slots) => {
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
                  if (slotId === -1) {
                    return <td key={p}>-</td>;
                  }

                  let combo = classCombos.find((c) => c._id === slotId);
                  let isCombined = false;

                  // Heuristic to handle in-memory combined-class combos from the backend
                  if (!combo && typeof slotId === 'string' && slotId.endsWith('-combined')) {
                    const originalComboId = slotId.replace('-combined', '');
                    const originalCombo = classCombos.find(c => c._id === originalComboId);
                    if (originalCombo) {
                      combo = originalCombo;
                      isCombined = true;
                    }
                  }

                  if (!combo) {
                    return <td key={p}>{slotId}</td>;
                  }

                  if (
                    (selectedFaculty &&
                      (!combo.faculty_id ||
                        String(combo.faculty_id._id) !== selectedFaculty)) ||
                    (selectedSubject &&
                      (!combo.subject_id ||
                        String(combo.subject_id._id) !== selectedSubject))
                  ) {
                    return <td key={p}>-</td>;
                  }
                  const isFixed =
                    fixedSlots[classId]?.[dayIdx]?.[p] === combo._id;

                  return (
                    <td
                      key={p}
                      style={{
                        backgroundColor: isFixed ? "#d1ffd1" : "inherit",
                        cursor: "pointer",
                      }}
                      // onClick={() =>
                      //   toggleFixedSlot(classId, dayIdx, p, combo._id)
                      // }
                      title={
                        isFixed ? "Click to unfix this slot" : "Click to fix slot"
                      }
                    >
                      <div>
                        <b>{combo.subject_id ? combo.subject_id.name : 'N/A'}</b>
                        {isCombined && <span style={{fontSize: '0.8em', color: 'blue'}}> (Combined)</span>}
                      </div>
                      <div>{combo.faculty_id ? `${combo.faculty_id.name} (${combo.faculty_id.id})` : 'N/A'}</div>
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
    if (!timetable) return null;
    let filteredEntries = Object.entries(timetable.class_timetables);
    if (selectedClass) {
      filteredEntries = filteredEntries.filter(
        ([classId]) => classId === selectedClass
      );
    }
    return filteredEntries;
  };

  const resetFilters = () => {
    setSelectedClass("");
    setSelectedFaculty("");
    setSelectedSubject("");
  };

  return (
    <div className="manage-container">
      <h2>Timetable Generator</h2>

      <div className="actions-bar">
        <button className="primary-btn" onClick={generateTimetable} disabled={loading}>
          {loading ? "Generating..." : "Generate Timetable"}
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
      {timetable && (
        <div style={{ marginTop: "20px" }}>
          {filteredTimetable().map(([classId, slots]) =>
            renderClassTable(classId, slots)
          )}
          {renderFacultyDailyHours()}
        </div>
      )}
    </div>
  );
}

export default Timetable;