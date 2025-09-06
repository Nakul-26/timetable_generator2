import React, { useState, useEffect } from "react";
import axios from "../../api/axios";

const AddCombo = () => {
  const [comboName, setComboName] = useState("");
  const [semester, setSemester] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [facultyId, setFacultyId] = useState("");

  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    // Fetch all classes, subjects, faculties on load
    const fetchData = async () => {
      try {
        const [facRes, subRes, classRes] = await Promise.all([
          axios.get("/faculties"),
          axios.get("/subjects"),
          axios.get("/classes"),
        ]);
        setFaculties(facRes.data);
        setSubjects(subRes.data);
        setClasses(classRes.data);
      } catch (err) {
        setError("Failed to fetch initial data.");
      }
    };
    fetchData();
  }, []);

  // Filtered data based on selections
  const filteredClasses = semester
    ? classes.filter((c) => c.sem == semester)
    : [];

  const filteredSubjects = semester
    ? subjects.filter((s) => s.sem == semester)
    : [];

  const filteredFaculties = subjectId
    ? faculties.filter((f) => f)
    : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      console.log("payload:", {
        combo_name: comboName,
        faculty_id: facultyId,
        subject_id: subjectId,
        class_id: classId,
      });
      
      await axios.post("/add-and-assign-combo", {
        combo_name: comboName,
        faculty_id: facultyId,
        subject_id: subjectId,
        class_id: classId,
      });

      console.log("payload:", {
        combo_name: comboName,
        faculty_id: facultyId,
        subject_id: subjectId,
        class_id: classId,
      });

      setSuccess("Combo added successfully!");
      setComboName("");
      setSemester("");
      setClassId("");
      setSubjectId("");
      setFacultyId("");
    } catch (err) {
      setError("Failed to add combo.");
    }
    setLoading(false);
  };

  return (
    <div className="form-container">
      <h2>Add Combo</h2>
      <form onSubmit={handleSubmit} className="styled-form">
        {/* Combo Name */}
        <div className="form-group">
          <label>Combo Name</label>
          <input
            type="text"
            name="comboName"
            placeholder="Combo Name"
            value={comboName}
            onChange={(e) => setComboName(e.target.value)}
          />
        </div>

        {/* Semester */}
        <div className="form-group">
          <label>Semester</label>
          <select
            value={semester}
            onChange={(e) => {
              setSemester(e.target.value);
              setClassId("");
              setSubjectId("");
              setFacultyId("");
            }}
          >
            <option value="">Select Semester</option>
            {[...new Set(classes.map((c) => c.sem))].map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
              </option>
            ))}
          </select>
        </div>

        {/* Class (depends on semester) */}
        {semester && (
          <div className="form-group">
            <label>Class</label>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubjectId("");
                setFacultyId("");
              }}
            >
              <option value="">Select Class</option>
              {filteredClasses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Subject (depends on semester) */}
        {classId && (
          <div className="form-group">
            <label>Subject</label>
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setFacultyId("");
              }}
            >
              <option value="">Select Subject</option>
              {filteredSubjects.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Faculty (depends on subject) */}
        {subjectId && (
          <div className="form-group">
            <label>Faculty</label>
            <select
              value={facultyId}
              onChange={(e) => setFacultyId(e.target.value)}
            >
              <option value="">Select Faculty</option>
              {filteredFaculties.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name} ({f.id})
                </option>
              ))}
            </select>
          </div>
        )}

        <button type="submit" disabled={loading} className="primary-btn">
          {loading ? "Adding..." : "Add Combo"}
        </button>
      </form>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
    </div>
  );
};

export default AddCombo;
