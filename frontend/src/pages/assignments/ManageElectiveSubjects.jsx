import React, { useState, useEffect, useContext, useMemo } from 'react';
import DataContext from '../../context/DataContext';
import api from '../../api/axios';

const ManageElectiveSubjects = () => {
    const { classes, subjects, combos, assignments: classSubjects } = useContext(DataContext);
    
    const [selectedClass, setSelectedClass] = useState('');
    const [subjectsForClass, setSubjectsForClass] = useState([]);
    // New state structure: { subjectId: { required_subject_id: count } }
    const [electiveSettings, setElectiveSettings] = useState({});

    // Memoize the count of teachers who can teach each subject (for validation)
    const teacherCountPerSubject = useMemo(() => {
        if (!combos) return {};
        return combos.reduce((acc, combo) => {
            const subjectId = combo.subject?._id;
            if (subjectId) {
                acc[subjectId] = (acc[subjectId] || 0) + 1;
            }
            return acc;
        }, {});
    }, [combos]);

    // The list of "categories" is now the list of all subjects
    const subjectCategories = useMemo(() => subjects, [subjects]);

    useEffect(() => {
        if (selectedClass && classSubjects && subjects) {
            const relatedClassSubjects = classSubjects.filter(cs => cs.class?._id === selectedClass);
            const subjectDetails = relatedClassSubjects.map(cs => ({
                ...cs.subject,
                hoursPerWeek: cs.hoursPerWeek
            })).filter(s => s.isElective); // Only show electives
            setSubjectsForClass(subjectDetails);
        } else {
            setSubjectsForClass([]);
        }
    }, [selectedClass, classSubjects, subjects]);

    useEffect(() => {
        if (selectedClass) {
            const fetchElectiveSettings = async () => {
                try {
                    const response = await api.get(`/elective-settings/${selectedClass}`);
                    const settingsMap = response.data.reduce((acc, setting) => {
                        acc[setting.subjectId] = setting.teacherCategoryRequirements;
                        return acc;
                    }, {});
                    setElectiveSettings(settingsMap);
                } catch (error) {
                    console.error("Error fetching elective settings:", error);
                    setElectiveSettings({});
                }
            };
            fetchElectiveSettings();
        } else {
            setElectiveSettings({});
        }
    }, [selectedClass]);

    const handleRequirementCountChange = (electiveSubjectId, requiredSubjectId, count) => {
        const value = Number(count);
        setElectiveSettings(prev => {
            const newSettings = { ...prev };
            if (!newSettings[electiveSubjectId]) newSettings[electiveSubjectId] = {};
            if (value > 0) {
                newSettings[electiveSubjectId][requiredSubjectId] = value;
            } else {
                delete newSettings[electiveSubjectId][requiredSubjectId];
            }
            return newSettings;
        });
    };

    const handleSave = async () => {
        if (!selectedClass) {
            alert("Please select a class.");
            return;
        }

        let validationError = null;

        const settingsToSave = Object.entries(electiveSettings)
            .map(([subjectId, requirements]) => {
                const totalTeachers = Object.values(requirements).reduce((a, b) => a + b, 0);
                if (totalTeachers === 0) return null;

                for (const [requiredSubId, requiredNum] of Object.entries(requirements)) {
                    const available = teacherCountPerSubject[requiredSubId] || 0;
                    if (requiredNum > available) {
                        const electiveSub = subjects.find(s => s._id === subjectId);
                        const requiredSub = subjects.find(s => s._id === requiredSubId);
                        validationError = `For elective "${electiveSub?.name}", you require ${requiredNum} teachers with expertise in "${requiredSub?.name}", but only ${available} are available.`;
                        return null;
                    }
                }
                
                return { subjectId, teacherCategoryRequirements: requirements };
            })
            .filter(Boolean);
        
        if (validationError) {
            alert(validationError);
            return;
        }

        try {
            await api.post('/elective-settings', {
                classId: selectedClass,
                settings: settingsToSave
            });
            alert('Elective settings saved successfully!');
        } catch (error) {
            console.error('Error saving elective settings:', error);
            alert('Failed to save settings.');
        }
    };
    
    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Manage Elective Teacher Requirements</h1>

            <div className="mb-4">
                <label htmlFor="class-select" className="block text-sm font-medium text-gray-700">Select Class</label>
                <select
                    id="class-select"
                    value={selectedClass}
                    onChange={(e) => setSelectedClass(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                    <option value="">-- Select a Class --</option>
                    {classes.map(c => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {selectedClass && (
                <div>
                    <h2 className="text-xl font-semibold mb-2">Configure Electives for {classes.find(c => c._id === selectedClass)?.name}</h2>
                    <div className="space-y-4">
                        {subjectsForClass.map(subject => {
                             const currentRequirements = electiveSettings[subject._id] || {};
                             const totalTeachers = Object.values(currentRequirements).reduce((a, b) => a + b, 0);

                            return (
                            <div key={subject._id} className="p-4 border rounded-md shadow-sm bg-white">
                                <div className="font-semibold text-lg">{subject.name}</div>
                                <div className="text-sm text-gray-500 mb-3 flex justify-between">
                                    <span>Hours per week: {subject.hoursPerWeek}</span>
                                    <span className="font-bold">Total teachers per slot: {totalTeachers}</span>
                                </div>
                                
                                <div>
                                    <h4 className="text-md font-medium mb-2">Required Teacher Expertise (based on other subjects they can teach):</h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {subjectCategories.map(categorySubject => (
                                            <div key={categorySubject._id} className="flex items-center space-x-2">
                                                <label htmlFor={`count-${subject._id}-${categorySubject._id}`} className="text-sm capitalize w-32">{categorySubject.name}:</label>
                                                <input
                                                    type="number"
                                                    id={`count-${subject._id}-${categorySubject._id}`}
                                                    min="0"
                                                    max={teacherCountPerSubject[categorySubject._id] || 0}
                                                    value={currentRequirements[categorySubject._id] || 0}
                                                    onChange={(e) => handleRequirementCountChange(subject._id, categorySubject._id, e.target.value)}
                                                    className="w-20 p-1 border-gray-300 rounded-md"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            )
                        })}
                    </div>
                    <div className="mt-6">
                        <button
                            onClick={handleSave}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Save Settings
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageElectiveSubjects;