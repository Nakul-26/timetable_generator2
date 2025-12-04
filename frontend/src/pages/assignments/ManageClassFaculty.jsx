import React, { useContext, useState } from "react";
import api from "../../api/axios";
import Select from 'react-select';
import DataContext from "../../context/DataContext";

const ManageClassFaculty = () => {
    const { classes, faculties, loading, error, refetchData } = useContext(DataContext);
    const [addClass, setAddClass] = useState(null);
    const [addFaculties, setAddFaculties] = useState([]);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!addClass || !addFaculties || addFaculties.length === 0) {
            return;
        }
        try {
            const addPromises = addFaculties.map(faculty => {
                return api.post(`/classes/${addClass.value}/faculties`, { facultyId: faculty.value });
            });
            await Promise.all(addPromises);
            setAddClass(null);
            setAddFaculties([]);
            refetchData(['classes']);
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    };

    const handleDelete = async (classId, facultyId) => {
        if (!window.confirm("Are you sure you want to delete this assignment?")) return;
        try {
            await api.delete(`/classes/${classId}/faculties/${facultyId}`);
            refetchData(['classes']);
        } catch (err) {
            console.log(`Error: ${err.message}`);
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
                    value={addFaculties}
                    onChange={setAddFaculties}
                    placeholder="Select Faculties"
                    isMulti
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
