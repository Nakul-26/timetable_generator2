import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";

function ManageClass() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);

  // State variables for editing a class
  const [editName, setEditName] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editClassId, setEditClassId] = useState("");

  // 🔍 Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterClassId, setFilterClassId] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterSemester, setFilterSemester] = useState("");

  const navigate = useNavigate();

  const handleAddClass = () => {
    navigate("/class/add");
  };

  useEffect(() => {
    const fetchClasses = async () => {
      setLoading(true);
      try {
        const res = await api.get("/classes");
        setClasses(res.data);
      } catch (err) {
        setError("Failed to fetch classes.");
      }
      setLoading(false);
    };
    fetchClasses();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this class?")) return;
    try {
      await api.delete(`/classes/${id}`);
      setClasses(classes.filter((c) => c._id !== id));
    } catch (err) {
      setError("Failed to delete class.");
    }
  };

  const handleEdit = (classItem) => {
    setEditId(classItem._id);
    setEditName(classItem.name);
    setEditSection(classItem.section);
    setEditSemester(classItem.sem);
    setEditClassId(classItem.id);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedData = {
        name: editName,
        sem: editSemester,
        section: editSection,
        id: editClassId,
      };
      await api.put(`/classes/${editId}`, updatedData);
      setClasses(
        classes.map((c) => (c._id === editId ? { ...c, ...updatedData } : c))
      );
      setEditId(null);
      setError("");
    } catch (err) {
      setError("Failed to update class.");
    }
  };

  // 🔎 Apply filters
  const filteredClasses = classes.filter((c) => {
    return (
      (!filterClassId || c.id.toLowerCase().includes(filterClassId.toLowerCase())) &&
      (!filterName || c.name.toLowerCase().includes(filterName.toLowerCase())) &&
      (!filterSection || c.section.toLowerCase().includes(filterSection.toLowerCase())) &&
      (!filterSemester || String(c.sem).toLowerCase().includes(filterSemester.toLowerCase()))
    );
  });

  const resetFilters = () => {
    setFilterClassId("");
    setFilterName("");
    setFilterSection("");
    setFilterSemester("");
  };

  return (
    <div className="manage-container">
      <h2>Manage Classes</h2>
      <div className="actions-bar">
        <button onClick={handleAddClass}>Add new class</button>
        <button onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Search" : "Show Search"}
        </button>
      </div>

      {/* 🔽 Filters */}
      {showFilters && (
        <div className="filters-container">
          <input
            type="text"
            placeholder="Search by Class ID"
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Name"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Section"
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Semester"
            value={filterSemester}
            onChange={(e) => setFilterSemester(e.target.value)}
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
              <th>Class ID</th>
              <th>Name</th>
              <th>Section</th>
              <th>Semester</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredClasses) &&
              filteredClasses.map((classItem) => (
                <tr key={classItem._id}>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editClassId}
                        onChange={(e) => setEditClassId(e.target.value)}
                      />
                    ) : (
                      classItem.id
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      classItem.name
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editSection}
                        onChange={(e) => setEditSection(e.target.value)}
                      />
                    ) : (
                      classItem.section
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editSemester}
                        onChange={(e) => setEditSemester(e.target.value)}
                      />
                    ) : (
                      classItem.sem
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
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
                          onClick={() => handleEdit(classItem)}
                          className="primary-btn"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(classItem._id)}
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

export default ManageClass;
