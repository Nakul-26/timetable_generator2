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
        console.log(err);
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
    // Set individual state variables from the selected class item
    setEditName(classItem.name);
    setEditSection(classItem.section);
    setEditSemester(classItem.sem);
    setEditClassId(classItem.id);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      // Use the individual state variables in the API call
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
      setError(""); // Clear any previous errors on success
    } catch (err) {
      setError("Failed to update class.");
    }
  };

  return (
    <div className="manage-container">
      <h2>Manage Classes</h2>
      <button onClick={handleAddClass}>Add new class</button>
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
            { Array.isArray(classes) && classes.map((classItem) => (
              <tr key={classItem.id}>
                <td>
                  {editId === classItem._id ? (
                    <input
                      type="text"
                      name="classId"
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
                      name="name"
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
                      name="section"
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
                      name="semester"
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