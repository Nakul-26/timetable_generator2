import React, { useEffect, useState } from "react";
import api from "../../api/axios";
import Select from 'react-select';

const ManageClassSubject = () => {
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Add states
    const [addClass, setAddClass] = useState(null);
    const [addSubject, setAddSubject] = useState(null);

    const fetchAssignments = async () => {
        setLoading(true);
        try {
            const [classRes, subjectRes] = await Promise.all([
                api.get("/classes"),
                api.get("/subjects"),
            ]);
            setClasses(classRes.data);
            setSubjects(subjectRes.data);
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
        if (!addClass || !addSubject) {
            setError("Please select a class and a subject.");
            return;
        }
        try {
            await api.post(`/classes/${addClass.value}/subjects`, { subjectId: addSubject.value });
            fetchAssignments();
            setAddClass(null);
            setAddSubject(null);
            setError("");
        } catch (err) {
            setError("Failed to add assignment.");
        }
    };

    const handleDelete = async (classId, subjectId) => {
        if (!window.confirm("Are you sure you want to delete this assignment?")) return;
        try {
            await api.delete(`/classes/${classId}/subjects/${subjectId}`);
            fetchAssignments();
        } catch (err) {
            setError("Failed to delete assignment.");
        }
    };

    const classOptions = classes.map(c => ({ value: c._id, label: c.name }));
    const subjectOptions = subjects.map(s => ({ value: s._id, label: s.name }));

    const assignments = classes.flatMap(c => (c.subjects || []).map(s => ({ class: c, subject: s })));

    return (
        <div className="manage-container">
            <h2>Manage Class-Subject Assignments</h2>

            <form onSubmit={handleAdd} className="add-form">
                <h3>Add New Assignment</h3>
                <Select
                    options={classOptions}
                    value={addClass}
                    onChange={setAddClass}
                    placeholder="Select Class"
                />
                <Select
                    options={subjectOptions}
                    value={addSubject}
                    onChange={setAddSubject}
                    placeholder="Select Subject"
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
                            <th>Subject</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assignments.map(({ class: c, subject: s }) => (
                            <tr key={`${c._id}-${s._id}`}>
                                <td>{c.name}</td>
                                <td>{s.name}</td>
                                <td>
                                    <button onClick={() => handleDelete(c._id, s._id)} className="danger-btn">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default ManageClassSubject;
