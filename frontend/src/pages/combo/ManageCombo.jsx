import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";

const ManageClassCombo = () => {
  const [classCombos, setClassCombos] = useState([]);
  const [classes, setClasses] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Edit states
  const [editId, setEditId] = useState(null);
  const [editComboName, setEditComboName] = useState("");
  const [editClassId, setEditClassId] = useState("");
  const [editFacultyId, setEditFacultyId] = useState("");
  const [editSubjectId, setEditSubjectId] = useState("");

  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterClass, setFilterClass] = useState("");
  const [filterFaculty, setFilterFaculty] = useState("");
  const [filterSubject, setFilterSubject] = useState("");

  const navigate = useNavigate();

  const fetchAll = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleAddCombo = () => {
    navigate("/combo/add");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this class-combo?")) return;
    try {
      await axios.delete(`/create-and-assign-combos/${id}`);
      setClassCombos(classCombos.filter((c) => c._id !== id));
    } catch (err) {
      setError("Failed to delete class-combo.");
    }
  };

  const handleEdit = (combo) => {
    setEditId(combo._id);
    setEditComboName(combo.combo_name);
    setEditClassId(combo.class_id);
    setEditFacultyId(combo.faculty_id);
    setEditSubjectId(combo.subject_id);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedCombo = {
        combo_name: editComboName,
        class_id: editClassId,
        faculty_id: editFacultyId,
        subject_id: editSubjectId,
      };
      await axios.put(`/create-and-assign-combos/${editId}`, updatedCombo);
      setClassCombos(
        classCombos.map((c) =>
          c._id === editId ? { ...c, ...updatedCombo } : c
        )
      );
      setEditId(null);
    } catch (err) {
      setError("Failed to update class-combo.");
    }
  };

  // Helpers to display names
  const getClassName = (id) => {
    const cls = classes.find((c) => String(c._id) === String(id));
    return cls ? `${cls.name} (${cls.id}) (${cls.section})` : id;
  };
  const getFacultyName = (id) => {
    const fac = faculties.find((f) => String(f._id) === String(id));
    return fac ? `${fac.name} (${fac.id})` : id;
  };
  const getSubjectName = (id) => {
    const sub = subjects.find((s) => String(s._id) === String(id));
    return sub ? `${sub.name} (${sub.id})` : id;
  };

  // 🔍 Apply filters
  const filteredCombos = classCombos.filter((combo) => {
    return (
      (!filterClass || String(combo.class_id) === filterClass) &&
      (!filterFaculty || String(combo.faculty_id) === filterFaculty) &&
      (!filterSubject || String(combo.subject_id) === filterSubject)
    );
  });

  return (
    <div className="manage-container">
      <h2>Manage Class Combos</h2>
      
      <div className="actions-bar">
        <button onClick={handleAddCombo}>Add Class Combo</button>
        <button onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
      </div>

      {/* 🔽 Filters */}
      {showFilters && (
        <div className="filters-container">
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>

          <select
            value={filterFaculty}
            onChange={(e) => setFilterFaculty(e.target.value)}
          >
            <option value="">All Faculties</option>
            {faculties.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name} ({f.id})
              </option>
            ))}
          </select>

          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
          >
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <table className="styled-table">
          <thead>
            <tr>
              <th>Combo Name</th>
              <th>Class</th>
              <th>Faculty</th>
              <th>Subject</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCombos.map((combo) => (
              <tr key={combo._id}>
                <td>
                  {editId === combo._id ? (
                    <input
                      type="text"
                      value={editComboName}
                      onChange={(e) => setEditComboName(e.target.value)}
                    />
                  ) : (
                    combo.combo_name
                  )}
                </td>
                <td>
                  {editId === combo._id ? (
                    <select
                      value={editClassId}
                      onChange={(e) => setEditClassId(e.target.value)}
                    >
                      <option value="">Select Class</option>
                      {classes.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} ({c.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    getClassName(combo.class_id)
                  )}
                </td>
                <td>
                  {editId === combo._id ? (
                    <select
                      value={editFacultyId}
                      onChange={(e) => setEditFacultyId(e.target.value)}
                    >
                      <option value="">Select Faculty</option>
                      {faculties.map((f) => (
                        <option key={f._id} value={f._id}>
                          {f.name} ({f.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    getFacultyName(combo.faculty_id)
                  )}
                </td>
                <td>
                  {editId === combo._id ? (
                    <select
                      value={editSubjectId}
                      onChange={(e) => setEditSubjectId(e.target.value)}
                    >
                      <option value="">Select Subject</option>
                      {subjects.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} ({s.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    getSubjectName(combo.subject_id)
                  )}
                </td>
                <td>
                  {editId === combo._id ? (
                    <>
                      <button onClick={handleEditSubmit} className="primary-btn">
                        Save
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="secondary-btn"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(combo)}
                        className="primary-btn"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(combo._id)}
                        className="danger-btn"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ManageClassCombo;
