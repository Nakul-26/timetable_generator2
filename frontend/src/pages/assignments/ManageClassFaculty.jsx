import React, { useEffect, useState } from "react";
import api from "../../api/axios";
import Select from 'react-select';

const ManageClassFaculty = () => {
    const [classes, setClasses] = useState([]);
    const [faculties, setFaculties] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Add states
    const [addClass, setAddClass] = useState(null);
    const [addFaculty, setAddFaculty] = useState(null);

    const fetchAssignments = async () => {
        setLoading(true);
        try {
            const [classRes, facultyRes] = await Promise.all([
                api.get("/classes"),
                api.get("/faculties"),
            ]);
            setClasses(classRes.data);
            setFaculties(facultyRes.data);
        } catch (err) {
            setError("Failed to fetch data.");
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAssignments();
    }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!addClass || !addFaculty) {
            setError("Please select a class and a faculty.");
            return;
        }
        try {
            await api.post(`/classes/${addClass.value}/faculties`, { facultyId: addFaculty.value });
            fetchAssignments();
            setAddClass(null);
            setAddFaculty(null);
            setError("");
        } catch (err) {
            setError("Failed to add assignment.");
        }
    };

    const handleDelete = async (classId, facultyId) => {
        if (!window.confirm("Are you sure you want to delete this assignment?")) return;
        try {
            await api.delete(`/classes/${classId}/faculties/${facultyId}`);
            fetchAssignments();
        } catch (err) {
            setError("Failed to delete assignment.");
        }
    };

    const classOptions = classes.map(c => ({ value: c._id, label: c.name }));
    const facultyOptions = faculties.map(f => ({ value: f._id, label: f.name }));

    const assignments = classes.flatMap(c => (c.faculties || []).map(f => ({ class: c, faculty: f })));

    return (
        <div className="manage-container">
            <h2>Manage Class-Faculty Assignments</h2>

            <form onSubmit={handleAdd} className="add-form">
                <h3>Add New Assignment</h3>
                <Select
                    options={classOptions}
                    value={addClass}
                    onChange={setAddClass}
                    placeholder="Select Class"
                />
                <Select
                    options={facultyOptions}
                    value={addFaculty}
                    onChange={setAddFaculty}
                    placeholder="Select Faculty"
                />
                <button type="submit" className="primary-btn">Add</button>
                {error && <div className="error-message">{error}</div>}
            </form>

            {loading ? (
                <div>Loading...</div>
            ) : (
                <table className="styled-table">
                    <thead>
                        <tr>
                            <th>Class</th>
                            <th>Faculty</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assignments.map(({ class: c, faculty: f }) => (
                            <tr key={`${c._id}-${f._id}`}>
                                <td>{c.name}</td>
                                <td>{f.name}</td>
                                <td>
                                    <button onClick={() => handleDelete(c._id, f._id)} className="danger-btn">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default ManageClassFaculty;
