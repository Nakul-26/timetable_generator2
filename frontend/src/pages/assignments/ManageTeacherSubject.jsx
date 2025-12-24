import React, { useContext, useState } from "react";
import API from "../../api/axios";
import DataContext from "../../context/DataContext";
import Select from 'react-select';

const ManageTeacherSubject = () => {
    const { combos, faculties, subjects, loading, error, refetchData } = useContext(DataContext);
    const [selectedTeachers, setSelectedTeachers] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState(null);

    // State for filtering and search
    const [filterFaculty, setFilterFaculty] = useState(null);
    const [filterSubject, setFilterSubject] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this combination?")) return;
        try {
            await API.delete(`/teacher-subject-combos/${id}`);
            refetchData(['teacher-subject-combos']);
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedSubject || !selectedTeachers || selectedTeachers.length === 0) {
            return;
        }
        try {
            const newCombos = selectedTeachers.map(teacher => ({
                faculty: teacher.value,
                subject: selectedSubject.value,
            }));

            const promises = newCombos.map(combo => API.post('/teacher-subject-combos', combo));

            await Promise.all(promises);

            refetchData(['teacher-subject-combos']);
            setSelectedTeachers([]);
            setSelectedSubject(null);
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    };

    const teacherOptions = faculties.map(t => ({ value: t._id, label: t.name }));
    const subjectOptions = subjects.map(s => ({ value: s._id, label: s.name }));

    const filteredCombos = combos.filter(combo => {
        const facultyMatch = filterFaculty ? combo.faculty?._id === filterFaculty.value : true;
        const subjectMatch = filterSubject ? combo.subject?._id === filterSubject.value : true;
        const searchMatch = searchTerm ?
            (combo.faculty?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             combo.subject?.name?.toLowerCase().includes(searchTerm.toLowerCase()))
            : true;
        return facultyMatch && subjectMatch && searchMatch;
    });

    return (
        <div className="manage-container">
            <h2>Manage Teacher-Subject Combinations</h2>

            <form onSubmit={handleSubmit} className="add-form">
                <h3>Add New Combination</h3>
                {error && <div className="error-message">{error}</div>}
                <Select
                    options={teacherOptions}
                    value={selectedTeachers}
                    onChange={setSelectedTeachers}
                    placeholder="Select Teachers"
                    isMulti
                />
                <Select
                    options={subjectOptions}
                    value={selectedSubject}
                    onChange={setSelectedSubject}
                    placeholder="Select Subject"
                />
                <button type="submit" className="primary-btn">Add Combination</button>
            </form>

            <h3>Filter Combinations</h3>
            <div className="filters-container">
                <input
                    type="text"
                    placeholder="Search by teacher or subject..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="search-input"
                />
                <Select
                    options={teacherOptions}
                    value={filterFaculty}
                    onChange={setFilterFaculty}
                    placeholder="Filter by Teacher"
                    isClearable
                />
                <Select
                    options={subjectOptions}
                    value={filterSubject}
                    onChange={setFilterSubject}
                    placeholder="Filter by Subject"
                    isClearable
                />
            </div>

            {loading ? (
                <div>Loading...</div>
            ) : (
                <table className="styled-table">
                    <thead>
                        <tr>
                            <th>Teacher</th>
                            <th>Subject</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCombos.map((combo) => (
                            <tr key={combo._id}>
                                <td>{combo.faculty?.name}</td>
                                <td>{combo.subject?.name}</td>
                                <td>
                                    <button onClick={() => handleDelete(combo._id)} className="danger-btn">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default ManageTeacherSubject;
