import React, { useContext, useState } from "react";
import api from "../../api/axios";
import Select from 'react-select';
import DataContext from "../../context/DataContext";

const ManageClassSubject = () => {
    const { assignments, classes, subjects, loading, error, refetchData } = useContext(DataContext);
    const [addClass, setAddClass] = useState(null);
    const [addSubject, setAddSubject] = useState(null);
    const [addHours, setAddHours] = useState(5); // Default to 5 hours

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!addClass || !addSubject || !addHours) {
            return;
        }
        try {
            await api.post('/class-subjects', {
                classId: addClass.value,
                subjectId: addSubject.value,
                hoursPerWeek: addHours
            });
            refetchData(['class-subjects']);
            setAddClass(null);
            setAddSubject(null);
            setAddHours(5);
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    };

    const handleDelete = async (assignmentId) => {
        if (!window.confirm("Are you sure you want to delete this assignment?")) return;
        try {
            await api.delete(`/class-subjects/${assignmentId}`);
            refetchData(['class-subjects']);
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    };

    const classOptions = classes.map(c => ({ value: c._id, label: c.name }));
    const subjectOptions = subjects.map(s => ({ value: s._id, label: s.name }));

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
                <input
                    type="number"
                    value={addHours}
                    onChange={(e) => setAddHours(e.target.value)}
                    placeholder="Hours per week"
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
                            <th>Hours per Week</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {assignments.map((assignment) => (
                            <tr key={assignment._id}>
                                <td>{assignment.class?.name}</td>
                                <td>{assignment.subject?.name}</td>
                                <td>{assignment.hoursPerWeek}</td>
                                <td>
                                    <button onClick={() => handleDelete(assignment._id)} className="danger-btn">Delete</button>
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
