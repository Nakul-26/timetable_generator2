import React, { useState, useEffect } from "react";
import api from "../api/axios";
import axios from "../api/axios";

function Timetable() {
  const [loading, setLoading] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [error, setError] = useState("");
  const [bestScore, setBestScore] = useState(null); // 🔥 NEW: Track best score

  const [classes, setClasses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classCombos, setClassCombos] = useState([]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  // Fetch classes, faculties, subjects, combos
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

  const generateTimetable = async () => {
    setLoading(true);
    setError("");
    try {
      await api.post("/generate");
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
    } catch (e) {
      setError("Failed to fetch timetable");
    }
    setLoading(false);
  };

  // 🔥 NEW: Regenerate timetable using your /result/regenerate endpoint
  const regenerateTimetable = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/result/regenerate");
      console.log("response to regenerate:",res);
      if (res.data?.ok) {
        setTimetable(res.data);
        setBestScore(res.data.score || null);
      } else {
        setError("Failed to regenerate timetable");
      }
    } catch (e) {
      setError(e.response?.data?.error || "Failed to regenerate timetable");
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
              {Array.from({ length: 9 }).map((_, p) => (
                <th key={p}>
                  P{p + 1}
                  {p === 2 ? " (Tea Break)" : ""}
                  {p === 5 ? " (Lunch Break)" : ""}
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
                  const combo = classCombos.find((c) => c._id === slotId);
                  if (!combo) {
                    return <td key={p}>{slotId}</td>;
                  }

                  // Apply filters
                  if (
                    (selectedFaculty && combo.faculty_id !== selectedFaculty) ||
                    (selectedSubject && combo.subject_id !== selectedSubject)
                  ) {
                    return <td key={p}>-</td>;
                  }

                  return (
                    <td key={p}>
                      <div>
                        <b>{getSubjectName(combo.subject_id)}</b>
                      </div>
                      <div>{getFacultyName(combo.faculty_id)}</div>
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

  const deleteAllTimetables = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.delete("/timetables");
      console.log("response to regenerate:",res);
      if (res) {
        setError("");
      } else {
        setError("Failed to regenerate timetable");
      }
    } catch (e) {
      setError(e.response?.data?.error || "Failed to regenerate timetable");
    }
    setLoading(false);
  }

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
        <button className="secondart-btn" onClick={deleteAllTimetables} disabled={loading}>
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

      {timetable && (
        <div style={{ marginTop: "20px" }}>
          {filteredTimetable().map(([classId, slots]) =>
            renderClassTable(classId, slots)
          )}
        </div>
      )}
    </div>
  );
}

export default Timetable;
