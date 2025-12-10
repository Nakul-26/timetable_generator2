import React, { useState, useContext, useEffect } from "react";
import Select from 'react-select';
import DataContext from "../../context/DataContext";

const ManageElectiveSubjects = () => {
    const { classes, subjects } = useContext(DataContext);
    const [electiveGroups, setElectiveGroups] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [selectedSubjects, setSelectedSubjects] = useState([]);

    useEffect(() => {
        const storedElectiveGroups = JSON.parse(localStorage.getItem('classElectiveGroups')) || [];
        setElectiveGroups(storedElectiveGroups);
    }, []);

    const handleAdd = (e) => {
        e.preventDefault();
        if (!selectedClass || selectedSubjects.length < 2) {
            alert("Please select a class and at least two subjects.");
            return;
        }

        const newGroup = {
            classId: selectedClass.value,
            subjects: selectedSubjects.map(s => s.value)
        };

        const updatedGroups = [...electiveGroups, newGroup];
        setElectiveGroups(updatedGroups);
        localStorage.setItem('classElectiveGroups', JSON.stringify(updatedGroups));

        setSelectedClass(null);
        setSelectedSubjects([]);
    };

    const handleDelete = (index) => {
        if (!window.confirm("Are you sure you want to delete this elective group?")) return;

        const updatedGroups = electiveGroups.filter((_, i) => i !== index);
        setElectiveGroups(updatedGroups);
        localStorage.setItem('classElectiveGroups', JSON.stringify(updatedGroups));
    };

    const classOptions = classes.map(c => ({ value: c._id, label: c.name }));
    const subjectOptions = subjects.map(s => ({ value: s._id, label: s.name }));

    const getClassName = (classId) => classes.find(c => c._id === classId)?.name || 'Unknown Class';
    const getSubjectNames = (subjectIds) => subjectIds.map(id => subjects.find(s => s._id === id)?.name || 'Unknown Subject').join(', ');

    return (
        <div className="manage-container">
            <h2>Manage Elective Subject Groups</h2>

            <form onSubmit={handleAdd} className="add-form">
                <h3>Add New Elective Group</h3>
                <Select
                    options={classOptions}
                    value={selectedClass}
                    onChange={setSelectedClass}
                    placeholder="Select Class"
                />
                <Select
                    options={subjectOptions}
                    isMulti
                    value={selectedSubjects}
                    onChange={setSelectedSubjects}
                    placeholder="Select Elective Subjects"
                />
                <button type="submit" className="primary-btn">Add Group</button>
            </form>

            <table className="styled-table">
                <thead>
                    <tr>
                        <th>Class</th>
                        <th>Elective Subjects</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {electiveGroups.map((group, index) => (
                        <tr key={index}>
                            <td>{getClassName(group.classId)}</td>
                            <td>{getSubjectNames(group.subjects)}</td>
                            <td>
                                <button onClick={() => handleDelete(index)} className="danger-btn">Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ManageElectiveSubjects;
