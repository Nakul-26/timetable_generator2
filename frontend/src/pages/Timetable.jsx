import React, { useState, useEffect } from "react";
import api from "../api/axios";
import axios from "../api/axios"; // use same instance
import "../styles/Cards.css";

function Timetable() {
  const [loading, setLoading] = useState(false);
  const [timetable, setTimetable] = useState(null);
  const [error, setError] = useState("");

  const [classes, setClasses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classCombos, setClassCombos] = useState([]);

  // fetch classes, faculties, subjects, combos
  const fetchAll = async () => {
    try {
      const [comboRes, classRes, facRes, subRes] = await Promise.all([
        axios.get("/create-and-assign-combos"),
        axios.get("/classes"),
        axios.get("/faculties"),
        axios.get("/subjects"),
      ]);

      const flattened = [];
      comboRes.data.classAssignments.forEach((cls) => {
        (cls.assignedCombos || []).forEach((combo) => {
          flattened.push({
            _id: combo._id,
            combo_name: combo.combo_name,
            class_id: cls.classId,
            class_name: cls.className,
            faculty_id: combo.faculty_id,
            subject_id: combo.subject_id,
          });
        });
      });

      setClassCombos(flattened);
      setClasses(classRes.data);
      setFaculties(facRes.data);
      setSubjects(subRes.data);
    } catch (err) {
      console.error(err);
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
    } catch (e) {
      setError("Failed to fetch timetable");
    }
    setLoading(false);
  };

  // helpers
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
      <div key={classId} style={{ marginBottom: 40 }}>
        <h3 style={{ marginBottom: 10 }}>
          Class: {getClassName(classId)}
        </h3>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginBottom: 20,
            background: "#fff7e6",
          }}
        >
          <thead>
            <tr>
              <th style={{ border: "1px solid #ddd", padding: 8 }}>Day / Period</th>
              {Array.from({ length: 8 }).map((_, p) => (
                <th key={p} style={{ border: "1px solid #ddd", padding: 8 }}>
                  P{p + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slots.map((dayRow, dayIdx) => (
              <tr key={dayIdx}>
                <td style={{ border: "1px solid #ddd", padding: 8 }}>
                  Day {dayIdx + 1}
                </td>
                {dayRow.map((slotId, p) => {
                  if (slotId === -1) {
                    return (
                      <td
                        key={p}
                        style={{ border: "1px solid #ddd", padding: 8, textAlign: "center" }}
                      >
                        -
                      </td>
                    );
                  }
                  const combo = classCombos.find((c) => c._id === slotId);
                  if (!combo) {
                    return (
                      <td key={p} style={{ border: "1px solid #ddd", padding: 8 }}>
                        {slotId}
                      </td>
                    );
                  }
                  return (
                    <td key={p} style={{ border: "1px solid #ddd", padding: 8 }}>
                      <div><b>{getSubjectName(combo.subject_id)}</b></div>
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

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        minHeight: "70vh",
        background: "#ffe5d2",
        padding: "20px",
      }}
    >
      <div className="card" style={{ maxWidth: 900, width: "100%" }}>
        <h2 style={{ marginBottom: 10, textAlign: "center" }}>
          Timetable Generator
        </h2>
        <div style={{ marginBottom: 18, textAlign: "center" }}>
          <button
            className="card"
            style={{
              padding: "10px 24px",
              fontSize: "1rem",
              background: "#ff8c42",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              marginRight: 8,
            }}
            onClick={generateTimetable}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Timetable"}
          </button>
          <button
            className="card"
            style={{
              padding: "10px 24px",
              fontSize: "1rem",
              background: "#ff8c42",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
            onClick={fetchLatest}
            disabled={loading}
          >
            Fetch Latest
          </button>
        </div>
        {error && (
          <div style={{ color: "#d32f2f", marginBottom: 12, textAlign: "center" }}>
            {error}
          </div>
        )}
        {timetable && (
          <div style={{ marginTop: 18 }}>
            {Object.entries(timetable.class_timetables).map(([classId, slots]) =>
              renderClassTable(classId, slots)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Timetable;
