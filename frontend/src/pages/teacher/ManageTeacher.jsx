import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";

// Assuming you have some CSS for styling
// import "../../styles/ManageTeacher.css"; 

const ManageTeacher = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);
  
  // Using individual state variables for the edit form
  const [editName, setEditName] = useState("");
  const [editFacultyId, setEditFacultyId] = useState("");
  
  const navigate = useNavigate();

  const handleAddTeacher = () => {
    navigate('/teacher/add');
  };

  useEffect(() => {
    const fetchTeachers = async () => {
      setLoading(true);
      try {
        const res = await axios.get("/faculties");
        // Assuming the response data has '_id' for MongoDB and 'name'
        setTeachers(res.data);
      } catch (err) {
        setError("Failed to fetch teachers.");
        console.error("Fetch error:", err);
      }
      setLoading(false);
    };
    fetchTeachers();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this teacher?")) return;
    try {
      // Use the correct endpoint, likely by ID from the MongoDB document
      await axios.delete(`/faculties/${id}`);
      setTeachers(teachers.filter((t) => t._id !== id));
    } catch (err) {
      setError("Failed to delete teacher.");
      console.error("Delete error:", err);
    }
  };

  const handleEdit = (teacher) => {
    setEditId(teacher._id);
    // Set the individual state variables for editing
    setEditName(teacher.name);
    setEditFacultyId(teacher.id);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedTeacher = { name: editName, id: editFacultyId };
      console.log("Updating teacher:", updatedTeacher);
      // Use the correct endpoint for updating, and ensure you are sending the correct ID
      await axios.put(`/faculties/${editId}`, updatedTeacher);
      
      // Update the teachers array in state
      setTeachers(
        teachers.map((t) =>
          t._id === editId ? { ...t, name: editName, id: editFacultyId } : t
        )
      );
      setEditId(null); // Exit edit mode
      setEditName("");
      setEditFacultyId("");
    } catch (err) {
      setError("Failed to update teacher.");
      console.error("Update error:", err);
    }
  };

  return (
    <div className="manage-container">
      <h2>Manage Teachers</h2>
      <button onClick={handleAddTeacher}>Add Teacher</button>

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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher._id}>
                <td>
                  {editId === teacher._id ? (
                    <input
                      type="text"
                      name="name"
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
                      name="facultyId"
                      value={editFacultyId}
                      onChange={(e) => setEditFacultyId(e.target.value)}
                    />
                  ) : (
                    teacher.id
                  )}
                </td>
                <td>
                  {editId === teacher._id ? (
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