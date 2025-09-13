import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";

function ManageSubject() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);

  // Edit states
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSem, setEditSem] = useState("");
  const [editCredits, setEditCredits] = useState("");

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
        const res = await axios.get("/subjects");
        setSubjects(res.data);
      } catch (err) {
        setError("Failed to fetch subjects.");
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
    setEditCredits(subject.no_of_hours_per_week);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedSubject = {
        name: editName,
        id: editCode,
        sem: editSem,
        no_of_hours_per_week: editCredits,
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
      setEditCredits("");
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
              <th>Credits</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredSubjects) &&
              filteredSubjects.map((subject) => (
                <tr key={subject._id}>
                  <td>
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
                  <td>
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
                      <input
                        type="number"
                        value={editCredits}
                        onChange={(e) => setEditCredits(e.target.value)}
                      />
                    ) : (
                      subject.no_of_hours_per_week
                    )}
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
