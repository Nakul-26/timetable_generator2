import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import api from '../../api/axios';

const AssignModal = ({ klass, subjects, faculties, onClose, onSave }) => {
    const [selectedSubjects, setSelectedSubjects] = useState([]);
    const [selectedFaculties, setSelectedFaculties] = useState([]);

    useEffect(() => {
        if (klass) {
            setSelectedSubjects(klass.subjects.map(s => ({ value: s._id, label: `${s.name} (${s.id})` })));
            setSelectedFaculties(klass.faculties.map(f => ({ value: f._id, label: `${f.name} (${f.id})` })));
        }
    }, [klass]);

    const subjectOptions = subjects.map(s => ({ value: s._id, label: `${s.name} (${s.id})` }));
    const facultyOptions = faculties.map(f => ({ value: f._id, label: `${f.name} (${f.id})` }));

    const handleSave = async () => {
        if (!klass) return;

        const originalSubjectIds = klass.subjects.map(s => s._id);
        const newSubjectIds = selectedSubjects.map(s => s.value);
        const subjectsToAdd = newSubjectIds.filter(id => !originalSubjectIds.includes(id));
        const subjectsToRemove = originalSubjectIds.filter(id => !newSubjectIds.includes(id));

        const originalFacultyIds = klass.faculties.map(f => f._id);
        const newFacultyIds = selectedFaculties.map(f => f.value);
        const facultiesToAdd = newFacultyIds.filter(id => !originalFacultyIds.includes(id));
        const facultiesToRemove = originalFacultyIds.filter(id => !newFacultyIds.includes(id));

        try {
            const promises = [];
            subjectsToAdd.forEach(subjectId => promises.push(api.post(`/classes/${klass._id}/subjects`, { subjectId })));
            subjectsToRemove.forEach(subjectId => promises.push(api.delete(`/classes/${klass._id}/subjects/${subjectId}`)));
            facultiesToAdd.forEach(facultyId => promises.push(api.post(`/classes/${klass._id}/faculties`, { facultyId })));
            facultiesToRemove.forEach(facultyId => promises.push(api.delete(`/classes/${klass._id}/faculties/${facultyId}`)));
            
            await Promise.all(promises);
            onSave();
        } catch (error) {
            console.error("Failed to save assignments", error);
        }
    };

    if (!klass) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>Manage Assignments for {klass.name}</h2>
                
                <div className="form-group">
                    <label>Subjects</label>
                    <Select
                        isMulti
                        options={subjectOptions}
                        value={selectedSubjects}
                        onChange={setSelectedSubjects}
                    />
                </div>

                <div className="form-group">
                    <label>Faculties</label>
                    <Select
                        isMulti
                        options={facultyOptions}
                        value={selectedFaculties}
                        onChange={setSelectedFaculties}
                    />
                </div>

                <div className="modal-actions">
                    <button onClick={handleSave} className="primary-btn">Save</button>
                    <button onClick={onClose} className="secondary-btn">Cancel</button>
                </div>
            </div>
        </div>
    );
};

export default AssignModal;
