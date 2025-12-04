import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../api/axios";
import DataContext from "../../context/DataContext";

const ManageTeacher = () => {
  const { faculties, classes, subjects, combos, loading, error, refetchData } = useContext(DataContext);
  const [editId, setEditId] = useState(null);

  // Edit form states
  const [editName, setEditName] = useState("");
  const [editFacultyId, setEditFacultyId] = useState("");

  // 🔍 Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterFacultyId, setFilterFacultyId] = useState("");

  const navigate = useNavigate();

  const handleAddTeacher = () => {
    navigate("/teacher/add");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this teacher?")) return;
    try {
      await API.delete(`/faculties/${id}`);
      refetchData(['faculties']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  };

  const handleEdit = (teacher) => {
    setEditId(teacher._id);
    setEditName(teacher.name);
    setEditFacultyId(teacher.id);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedTeacher = { name: editName, id: editFacultyId };
      await API.put(`/faculties/${editId}`, updatedTeacher);

      setEditId(null);
      setEditName("");
      setEditFacultyId("");
      refetchData(['faculties']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  };

  // 🔎 Apply filters
  const filteredTeachers = faculties.filter((t) => {
    return (
      (!filterName || (t.name && t.name.toLowerCase().includes(filterName.toLowerCase()))) &&
      (!filterFacultyId ||
        (t.id && t.id.toLowerCase().includes(filterFacultyId.toLowerCase())))
    );
  });

  const resetFilters = () => {
    setFilterName("");
    setFilterFacultyId("");
  };

  return (
    <div className="manage-container">
      <h2>Manage Teachers</h2>
      <div className="actions-bar">
        <button onClick={handleAddTeacher}>Add Teacher</button>
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
            placeholder="Search by Faculty ID"
            value={filterFacultyId}
            onChange={(e) => setFilterFacultyId(e.target.value)}
          />
          <button onClick={resetFilters} className="secondary-btn">
            Reset
          </button>
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
              <th>Faculty ID</th>
              <th>Assigned Classes</th>
              <th>Assigned Subjects</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredTeachers) &&
              filteredTeachers.map((teacher) => (
                <tr key={teacher._id}>
                  <td>
                    {editId === teacher._id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      teacher.name
                    )}
                  </td>
                  <td>
                    {editId === teacher._id ? (
                      <input
                        type="text"
                        value={editFacultyId}
                        onChange={(e) => setEditFacultyId(e.target.value)}
                      />
                    ) : (
                      teacher.id
                    )}
                  </td>
                  <td>
                    {classes
                        .filter(cls => cls.faculties?.some(f => f._id === teacher._id))
                        .map(cls => (
                            <div key={cls._id}><strong>{cls.name}</strong></div>
                        ))}
                  </td>
                  <td>
                    {combos
                        .filter(c => c.faculty?._id === teacher._id)
                        .map(c => (
                            <div key={c._id}>{c.subject?.name}</div>
                        ))}
                  </td>
                  <td>
                    {editId === teacher._id ? (
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
                          onClick={() => handleEdit(teacher)}
                          className="primary-btn"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(teacher._id)}
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

export default ManageTeacher;
