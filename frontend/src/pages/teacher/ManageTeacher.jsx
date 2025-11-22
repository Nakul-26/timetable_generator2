import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../api/axios";

const ManageTeacher = () => {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [combos, setCombos] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  const fetchCombos = async () => {
    setLoading(true);
    try {
      const comboRes = await API.get("/create-and-assign-combos");
      console.log("combos:",comboRes);
      setCombos(comboRes.data);
    } catch (err) {
      console.log("error:",err);
      setError("Failed to fetch data.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const fetchTeachers = async () => {
      setLoading(true);
      try {
        console.log("trying");
        const facultyRes = await API.get("/faculties");
        const classRes = await API.get("/classes");
        const subjectRes = await API.get("/subjects");
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
    fetchTeachers();
    fetchCombos();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this teacher?")) return;
    try {
      await API.delete(`/faculties/${id}`);
      setTeachers(teachers.filter((t) => t._id !== id));
    } catch (err) {
      setError("Failed to delete teacher.");
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

      setTeachers(
        teachers.map((t) =>
          t._id === editId ? { ...t, ...updatedTeacher } : t
        )
      );

      setEditId(null);
      setEditName("");
      setEditFacultyId("");
    } catch (err) {
      setError("Failed to update teacher.");
    }
  };

  // 🔎 Apply filters
  const filteredTeachers = teachers.filter((t) => {
    return (
      (!filterName || t.name.toLowerCase().includes(filterName.toLowerCase())) &&
      (!filterFacultyId ||
        t.id.toLowerCase().includes(filterFacultyId.toLowerCase()))
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
              <th>Assigned Class-Subject</th>
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
                    {combos
                      .filter(c => c.faculty_id?._id === teacher._id) // get combos for teacher
                      .map(c => {
                        const subj = c.subject_id;
                        if (!c.class_ids || c.class_ids.length === 0) {
                          return (
                            <div key={c._id}>
                              <p>
                                Subject: {subj?.name || "Unknown"} ({subj?.id || "N/A"}) - Class: Not Assigned
                              </p>
                            </div>
                          );
                        }
                        return c.class_ids.map(cls => {
                          return (
                            <div key={`${c._id}-${cls._id}`}>
                              <p>
                                Class: {cls?.name || "Unknown"} ({cls?.id || 'N/A'}) - Subject: {subj?.name || "Unknown"} ({subj?.id || 'N/A'})
                              </p>
                            </div>
                          );
                        });
                      })}
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
