import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";

function ManageSubject() {
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);

  // Edit states
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSem, setEditSem] = useState("");
  const [editType, setEditType] = useState("");
  const [editCombinedClasses, setEditCombinedClasses] = useState([]);

  // 🔍 Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [filterSem, setFilterSem] = useState("");

  const navigate = useNavigate();

  const handleAddSubject = () => {
    navigate("/subject/add");
  };

  useEffect(() => {
    const fetchSubjects = async () => {
      setLoading(true);
      try {
        console.log("trying");
        const facultyRes = await axios.get("/faculties");
        const classRes = await axios.get("/classes");
        const subjectRes = await axios.get("/subjects");
        console.log("faculty res:",facultyRes);
        setTeachers(facultyRes.data);
        setClasses(classRes.data);
        setSubjects(subjectRes.data);
      } catch (err) {
        console.log("fetch faculty error:",err);
        setError("Failed to fetch teachers.");
      }
      setLoading(false);
    };
    fetchSubjects();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this subject?")) return;
    try {
      await axios.delete(`/subjects/${id}`);
      setSubjects(subjects.filter((s) => s._id !== id));
    } catch (err) {
      setError("Failed to delete subject.");
    }
  };

  const handleEdit = (subject) => {
    setEditId(subject._id);
    setEditName(subject.name);
    setEditCode(subject.id);
    setEditSem(subject.sem);
    setEditType(subject.type);
    setEditCombinedClasses(subject.combined_classes || []);
  };

  const handleEditCombinedClassesChange = (e) => {
    const { value, checked } = e.target;
    if (checked) {
      setEditCombinedClasses([...editCombinedClasses, value]);
    } else {
      setEditCombinedClasses(editCombinedClasses.filter((id) => id !== value));
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedSubject = {
        name: editName,
        id: editCode,
        sem: editSem,
        type: editType,
        combined_classes: editCombinedClasses,
      };
      await axios.put(`/subjects/${editId}`, updatedSubject);
      setSubjects(
        subjects.map((s) =>
          s._id === editId ? { ...s, ...updatedSubject } : s
        )
      );
      setEditId(null);
      setEditName("");
      setEditCode("");
      setEditSem("");
      setEditType("theory");
      setEditCombinedClasses([]);
    } catch (err) {
      setError("Failed to update subject.");
    }
  };

  // 🔎 Filtered data
  const filteredSubjects = subjects.filter((s) => {
    return (
      (!filterName || s.name.toLowerCase().includes(filterName.toLowerCase())) &&
      (!filterCode || s.id.toLowerCase().includes(filterCode.toLowerCase())) &&
      (!filterSem || String(s.sem) === filterSem)
    );
  });

  return (
    <div className="manage-container">
      <h2>Manage Subjects</h2>
      <div className="actions-bar">
        <button onClick={handleAddSubject}>Add Subject</button>
        <button onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Search" : "Show Search"}
        </button>
      </div>

      {/* 🔽 Filters */}
      {showFilters && (
        <div className="filters-container">
          <input
            type="text"
            placeholder="Search by Name"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Code"
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
          />
          <select
            value={filterSem}
            onChange={(e) => setFilterSem(e.target.value)}
          >
            <option value="">All Semesters</option>
            {[...new Set(subjects.map((s) => s.sem))].map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
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
              <th>Name</th>
              <th>Code</th>
              <th>Semester</th>
              <th>Subject Type</th>
              <th>Combined Classes</th>
              <th>Assigned Classes & Faculties</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredSubjects) &&
              filteredSubjects.map((subject) => (
                <tr key={subject._id}>
                  <td style={{ width: '10%' }}>
                    {editId === subject._id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      subject.name
                    )}
                  </td>
                  <td style={{ width: '10%' }}>
                    {editId === subject._id ? (
                      <input
                        type="text"
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                      />
                    ) : (
                      subject.id
                    )}
                  </td>
<td>
                    {editId === subject._id ? (
                      <input
                        type="text"
                        value={editSem}
                        onChange={(e) => setEditSem(e.target.value)}
                      />
                    ) : (
                      subject.sem
                    )}
                  </td>
                  <td>
                    {editId === subject._id ? (
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        required
                      >
                        <option value="theory">Theory</option>
                        <option value="lab">Lab</option>
                      </select>
                    ) : (
                      subject.type
                    )}
                  </td>
                  <td>
                    {editId === subject._id ? (
                      <div className="edit-checkbox-container">
                        <div className="form-checkbox-group">
                          {classes.map((c) => (
                            <label key={c._id} className="checkbox-label">
                              <input
                                type="checkbox"
                                value={c._id}
                                checked={editCombinedClasses.includes(c._id)}
                                onChange={handleEditCombinedClassesChange}
                              />
                              {c.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      subject.combined_classes?.map(classId => {
                        const combinedClass = classes.find(c => c._id === classId);
                        return combinedClass ? combinedClass.name : '';
                      }).join(', ')
                    )}
                  </td>
                  <td>
                    {classes
                      .filter(cls => cls.subjects?.some(s => s._id === subject._id))
                      .map(cls => (
                        <div key={cls._id}>
                          <strong>{cls.name}:</strong>{" "}
                          {(cls.faculties || []).map(f => f.name).join(", ")}
                        </div>
                      ))}
                  </td>
                  <td>
                    {editId === subject._id ? (
                      <>
                        <button
                          onClick={handleEditSubmit}
                          className="primary-btn"
                        >
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
                          onClick={() => handleEdit(subject)}
                          className="primary-btn"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(subject._id)}
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
}

export default ManageSubject;
