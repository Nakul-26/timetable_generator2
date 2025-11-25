import React, { useEffect, useState } from "react";
import API from "../../api/axios";

const ManageTeacherSubject = () => {
  const [combos, setCombos] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [comboRes, teacherRes, subjectRes] = await Promise.all([
          API.get("/teacher-subject-combos"),
          API.get("/faculties"),
          API.get("/subjects"),
        ]);
        setCombos(comboRes.data);
        setTeachers(teacherRes.data);
        setSubjects(subjectRes.data);
      } catch (err) {
        setError("Failed to fetch data.");
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this combination?")) return;
    try {
      await API.delete(`/teacher-subject-combos/${id}`);
      setCombos(combos.filter((c) => c._id !== id));
    } catch (err) {
      setError("Failed to delete combination.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTeacher || !selectedSubject) {
      setError("Please select a teacher and subject.");
      return;
    }
    try {
      const newCombo = {
        faculty: selectedTeacher,
        subject: selectedSubject,
      };
      const res = await API.post('/teacher-subject-combos', newCombo);
      // refetch combos to get the populated data
        const comboRes = await API.get("/teacher-subject-combos");
        setCombos(comboRes.data);
      setSelectedTeacher("");
      setSelectedSubject("");
      setError("");
    } catch (err) {
      setError("Failed to create combination.");
    }
  };

  return (
    <div className="manage-container">
      <h2>Manage Teacher-Subject Combinations</h2>
      
      <form onSubmit={handleSubmit} className="add-form">
        <h3>Add New Combination</h3>
        {error && <div className="error-message">{error}</div>}
        <select value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)} required>
          <option value="">Select Teacher</option>
          {teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} required>
          <option value="">Select Subject</option>
          {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <button type="submit" className="primary-btn">Add Combination</button>
      </form>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="styled-table">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Subject</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {combos.map((combo) => (
              <tr key={combo._id}>
                <td>{combo.faculty?.name}</td>
                <td>{combo.subject?.name}</td>
                <td>
                  <button onClick={() => handleDelete(combo._id)} className="danger-btn">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ManageTeacherSubject;
