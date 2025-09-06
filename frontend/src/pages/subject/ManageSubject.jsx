import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";

function ManageSubject() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState(null);
  // const [editTeachers, setEditTeachers] = useState([]);

  // Individual state variables for the subject being edited
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSem, setEditSem] = useState("");
  const [editCredits, setEditCredits] = useState("");
  // const [teachers, setTeachers] = useState([]);
  
  const navigate = useNavigate();

  const handleAddSubject = () => {
    navigate('/subject/add');
  };

  // useEffect(() => {
  //   const fetchTeachers = async () => {
  //     setLoading(true);
  //     try {
  //       const res = await axios.get("/faculties");
  //       console.log("response for get all teachers is", res.data);
  //       setTeachers(res.data);
  //     } catch (err) {
  //       setError("Failed to fetch teachers.");
  //       console.error("Fetch error:", err);
  //     }
  //     setLoading(false);
  //   };
  //   fetchTeachers();
  // }, []);

  useEffect(() => {
    const fetchSubjects = async () => {
      setLoading(true);
      try {
        const res = await axios.get("/subjects");
        console.log("response for get all subjects is", res);
        setSubjects(res.data);
      } catch (err) {
        setError("Failed to fetch subjects.");
        console.error("Fetch error:", err);
      }
      setLoading(false);
    };
    fetchSubjects();
  }, []);

  const handleDelete = async (id) => {
    // Replaced window.confirm to avoid browser dialogs in the immersive
    if (!window.confirm("Are you sure you want to delete this subject?")) return;
    try {
      await axios.delete(`/subjects/${id}`);
      setSubjects(subjects.filter((s) => s._id !== id));
    } catch (err) {
      setError("Failed to delete subject.");
      console.error("Delete error:", err);
    }
  };

  const handleEdit = (subject) => {
    // Set the ID for the item being edited using the MongoDB '_id'
    setEditId(subject._id);
    
    // Set the individual state variables with the subject's current data
    setEditName(subject.name);
    setEditCode(subject.id);
    setEditSem(subject.sem);
    setEditCredits(subject.no_of_hours_per_week); // Assuming this corresponds to credits
    // setEditType(subject.type);
  };

  // const handleEditTeachers = (e) => {
  //   const { options } = e.target;
  //   const values = [];
  //   for (let i = 0; i < options.length; i++) {
  //     if (options[i].selected) {
  //       values.push(options[i].value);
  //     }
  //   }
  //   setEditTeachers(values);
  // };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updatedSubject = {
        name: editName,
        id: editCode,
        sem: editSem,
        no_of_hours_per_week: editCredits,
        // faculty: editTeachers
      };
      
      // Send a PUT request with the updated data
      await axios.put(`/subjects/${editId}`, updatedSubject);
      
      // Update the state with the new data from the form
      setSubjects(
        subjects.map((s) =>
          s._id === editId ? { ...s, ...updatedSubject } : s
        )
      );
      
      // Reset the edit state
      setEditId(null);
      setEditName("");
      setEditCode("");
      setEditSem("");
      setEditCredits("");
      // setEditTeachers([]);
      // setEditType("");
    } catch (err) {
      setError("Failed to update subject.");
      console.error("Update error:", err);
    }
  };

  return (
    <div className="manage-container">
      <h2>Manage Subjects</h2>
      <button onClick={handleAddSubject}>
        Add Subject
      </button>
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
              {/* <th>Teachers</th> */}
              {/* <th>Type</th> */}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject._id}>
                <td>
                  {editId === subject._id ? (
                    <input
                      type="text"
                      name="name"
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
                      name="code"
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
                      name="sem"
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
                      name="credits"
                      value={editCredits}
                      onChange={(e) => setEditCredits(e.target.value)}
                    />
                  ) : (
                    subject.no_of_hours_per_week
                  )}
                </td>
                {/* <td>
                  {editId === subject._id ? (
                    <select
                      multiple
                      value={editTeachers}
                      onChange={handleEditTeachers}
                    >
                      {teachers.map((teacher) => (
                        <option key={teacher._id} value={teacher._id}>
                          {teacher.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    subject.faculty?.map(fid =>
                      teachers.find(t => t._id === fid)?.name
                    ).join(", ")
                  )}
                </td> */}

                {/* <td>
                  {editId === subject._id ? (
                    <select
                      name="type"
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                    >
                      <option value="theory">Theory</option>
                      <option value="lab">Lab</option>
                    </select>
                  ) : (
                    subject.type
                  )}
                </td> */}
                <td>
                  {editId === subject._id ? (
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
