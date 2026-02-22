import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import DataContext from "../../context/DataContext";

function ManageSubject() {
  const { subjects, classes, faculties, assignments, combos, loading, error, refetchData } = useContext(DataContext);
  const [editId, setEditId] = useState(null);

  // Edit states
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSem, setEditSem] = useState("");
  const [editType, setEditType] = useState("");
  const [editCombinedClasses, setEditCombinedClasses] = useState([]);
  const [editIsElective, setEditIsElective] = useState(false); // New state for isElective

  // 🔍 Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [filterSem, setFilterSem] = useState("");

  const navigate = useNavigate();

  const handleAddSubject = () => {
    navigate("/subject/add");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this subject?")) return;
    try {
      await axios.delete(`/subjects/${id}`);
      refetchData(['subjects']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  };

  const handleEdit = (subject) => {
    setEditId(subject._id);
    setEditName(subject.name);
    setEditCode(subject.id);
    setEditSem(subject.sem);
    setEditType(subject.type);
    setEditCombinedClasses(subject.combined_classes || []);
    setEditIsElective(subject.isElective || false); // Initialize new state
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
        isElective: editIsElective, // Include new state in payload
      };
      await axios.put(`/subjects/${editId}`, updatedSubject);
      setEditId(null);
      setEditName("");
      setEditCode("");
      setEditSem("");
      setEditType("theory");
      setEditCombinedClasses([]);
      refetchData();
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  };

  // 🔎 Filtered data
  const filteredSubjects = subjects.filter((s) => {
    return (
      (!filterName || (s.name && s.name.toLowerCase().includes(filterName.toLowerCase()))) &&
      (!filterCode || (s.id && s.id.toLowerCase().includes(filterCode.toLowerCase()))) &&
      (!filterSem || (s.sem && String(s.sem) === filterSem))
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
              <th>Assigned Classes</th>
              <th>Assigned Faculties</th>
              <th>Elective</th> {/* New table header */}
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
                    {assignments
                      .filter(a => a.subject?._id === subject._id)
                      .map(a => (
                        <div key={a._id}>{a.class?.name}</div>
                      ))}
                  </td>
                  <td>
                    {combos
                        .filter(c => c.subject?._id === subject._id)
                        .map(c => (
                            <div key={c._id}>{c.faculty?.name}</div>
                        ))}
                  </td>
                  <td> {/* New table cell for Elective */}
                    {editId === subject._id ? (
                      <input
                        type="checkbox"
                        checked={editIsElective}
                        onChange={(e) => setEditIsElective(e.target.checked)}
                      />
                    ) : (
                      subject.isElective ? "✅ Yes" : "❌ No"
                    )}
                  </td>
                  <td className="actions-cell">
                    {editId === subject._id ? (
                      <div className="actions-buttons">
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
                      </div>
                    ) : (
                      <div className="actions-buttons">
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
                      </div>
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
