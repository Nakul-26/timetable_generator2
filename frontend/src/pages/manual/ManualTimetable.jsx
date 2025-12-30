import React, { useState, useEffect } from 'react';
import api from '../../api/axios';

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hours = ["1", "2", "3", "4", "5", "6", "7", "8"];

const ManualTimetable = () => {
    // Core data
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [subjectIdToDetails, setSubjectIdToDetails] = useState({});
    
    // Timetable states
    const [classTimetable, setClassTimetable] = useState({});
    const [teacherTimetable, setTeacherTimetable] = useState({});
    const [subjectHoursAssigned, setSubjectHoursAssigned] = useState({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [isAutoFilling, setIsAutoFilling] = useState({});
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // New state for save loading
    const [timetableId, setTimetableId] = useState(null); // New state for timetableId
    const [savedTimetableId, setSavedTimetableId] = useState(null); // For tracking loaded timetable
    const [comboIdToDetails, setComboIdToDetails] = useState({});


    const [validOptions, setValidOptions] = useState({}); // { "classId-dayIndex-hourIndex": [options] }

    // Initial data fetch and state setup
    useEffect(() => {
        const fetchAndInitialize = async () => {
            try {
                setIsLoading(true);
                // Fetch core data
                const [classesRes, facultiesRes, subjectsRes] = await Promise.all([
                    api.get('/classes'),
                    api.get('/faculties'),
                    api.get('/subjects')
                ]);

                const fetchedClasses = classesRes.data;
                const fetchedFaculties = facultiesRes.data;
                const fetchedSubjects = subjectsRes.data;

                setClasses(fetchedClasses);
                setSubjects(fetchedSubjects);

                const subjectDetails = {};
                fetchedSubjects.forEach(s => {
                    subjectDetails[s._id] = s;
                });
                setSubjectIdToDetails(subjectDetails);


                // Generate a unique timetableId for this session
                const currentTimetableId = `manual-${Date.now()}`;
                setTimetableId(currentTimetableId);

                // Initialize backend state and get initial timetables
                // Pass frontend's preferred days and hours configuration
                const initStateResponse = await api.post('/manual/initialize', {
                    timetableId: currentTimetableId,
                    classes: fetchedClasses,
                    faculties: fetchedFaculties,
                    subjects: fetchedSubjects,
                    config: { days: days.length, hours: hours.length } // Pass config
                });
                
                if (initStateResponse.data.ok) {
                    setClassTimetable(initStateResponse.data.classTimetable);
                    setTeacherTimetable(initStateResponse.data.teacherTimetable);
                    setSubjectHoursAssigned(initStateResponse.data.subjectHoursAssigned);
                } else {
                    throw new Error("Failed to initialize timetable state on the server.");
                }

            } catch (error) {
                console.error('Error during initial setup:', error);
                alert('There was an error setting up the timetable. Please refresh the page.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchAndInitialize();
    }, []); // Empty dependency array means this runs once on mount

        const handleGetOptions = async (classId, dayIndex, hourIndex) => {
        if (!timetableId) return; // Ensure timetableId is set

        try {
            const response = await api.post(`/manual/valid-options`, {
                timetableId,
                classId,
                day: dayIndex,
                hour: hourIndex
            });
            const options = response.data.validOptions;
            setValidOptions(prev => ({ ...prev, [`${classId}-${dayIndex}-${hourIndex}`]: options }));
            
            const newDetails = {};
            options.forEach(opt => {
                newDetails[opt.comboId] = { subject: opt.subject, faculty: opt.faculty };
            });
            setComboIdToDetails(prev => ({ ...prev, ...newDetails }));

        } catch (error) {
            console.error('Error fetching valid options:', error);
            alert(`Error fetching options: ${error.response?.data?.error || error.message}`);
        }
    };

    const handlePlaceCombo = async (classId, dayIndex, hourIndex, comboId) => {
        if (!timetableId) return; // Ensure timetableId is set

        try {
            const response = await api.post(`/manual/place`, {
                timetableId,
                classId,
                day: dayIndex,
                hour: hourIndex,
                comboId // Can be "" to clear
            });

            if (response.data.ok) {
                // Update state with the new, authoritative state from the backend
                setClassTimetable(response.data.classTimetable);
                setTeacherTimetable(response.data.teacherTimetable);
                setSubjectHoursAssigned(response.data.subjectHoursAssigned);
            } else {
                // If placement was invalid, show the error from the backend
                alert(`Error: ${response.data.error || 'The requested placement is invalid.'}`);
                // Re-fetch options to ensure the UI reflects the actual valid choices
                handleGetOptions(classId, dayIndex, hourIndex);
            }
        } catch (error) {
            console.error('Error placing combo:', error);
            alert(`An unexpected error occurred while placing the combo: ${error.response?.data?.error || error.message}`);
        }
    };

        const handleAutoFill = async (classId) => {
        if (!timetableId) return; // Ensure timetableId is set

        setIsAutoFilling(prev => ({ ...prev, [classId]: true }));
        try {
            const response = await api.post('/manual/auto-fill', { 
                timetableId,
                classId 
            });
            if (response.data.ok) {
                setClassTimetable(response.data.classTimetable);
                setTeacherTimetable(response.data.teacherTimetable);
                setSubjectHoursAssigned(response.data.subjectHoursAssigned);

                const newTimetable = response.data.classTimetable;
                if (newTimetable[classId]) {
                    newTimetable[classId].forEach((row, dayIndex) => {
                        row.forEach((comboId, hourIndex) => {
                            if (comboId) {
                                handleGetOptions(classId, dayIndex, hourIndex);
                            }
                        });
                    });
                }

            } else {
                alert(`Auto-fill failed: ${response.data.error}`);
            }
        } catch (error) {
            console.error('Error during auto-fill:', error);
            alert(`An unexpected error occurred during auto-fill: ${error.response?.data?.error || error.message}`);
        } finally {
            setIsAutoFilling(prev => ({ ...prev, [classId]: false }));
        }
    };

    const handleClearAll = async () => {
        if (!timetableId) return; // Ensure timetableId is set

        if (window.confirm("Are you sure you want to clear the entire timetable? This action cannot be undone.")) {
            try {
                const response = await api.post('/manual/clear-all', { 
                    timetableId,
                    config: { days: days.length, hours: hours.length } // Pass config for re-initialization
                });
                if (response.data.ok) {
                    setClassTimetable(response.data.classTimetable);
                    setTeacherTimetable(response.data.teacherTimetable);
                    setSubjectHoursAssigned(response.data.subjectHoursAssigned);
                } else {
                    alert(`Failed to clear timetable: ${response.data.error}`);
                }
            } catch (error) {
                console.error('Error clearing timetable:', error);
                alert(`An unexpected error occurred while clearing the timetable: ${error.response?.data?.error || error.message}`);
            }
        }
    };

    const handleDeleteTimetable = async () => {
        if (!timetableId) return; // Ensure timetableId is set

        if (window.confirm(`Are you sure you want to delete this timetable (ID: ${timetableId})? This action cannot be undone.`)) {
            setIsDeleting(true);
            try {
                const response = await api.post('/manual/delete', { timetableId });
                if (response.data.ok) {
                    alert(response.data.message);
                    // Reset frontend state entirely as the timetable no longer exists on the backend
                    setClassTimetable({});
                    setTeacherTimetable({});
                    setSubjectHoursAssigned({});
                    setTimetableId(null); // Crucially unset the ID
                    setValidOptions({});
                    setIsAutoFilling({});
                } else {
                    alert(`Failed to delete timetable: ${response.data.error}`);
                }
            } catch (error) {
                console.error('Error deleting timetable:', error);
                alert(`An unexpected error occurred while deleting the timetable: ${error.response?.data?.error || error.message}`);
            } finally {
                setIsDeleting(false);
            }
        }
    };

    const handleSave = async (isSaveAs = false) => {
        if (!timetableId) return;

        const name = window.prompt("Enter a name for this timetable:");
        if (name) {
            setIsSaving(true);
            try {
                const payload = {
                    timetableId,
                    name,
                    savedTimetableId: isSaveAs ? null : savedTimetableId,
                };
                const response = await api.post('/manual/save', payload);
                if (response.data.ok) {
                    alert(response.data.message);
                    if (response.data.id) {
                        setSavedTimetableId(response.data.id);
                    }
                } else {
                    alert(`Failed to save timetable: ${response.data.error}`);
                }
            } catch (error) {
                console.error('Error saving timetable:', error);
                alert(`An unexpected error occurred while saving: ${error.response?.data?.error || error.message}`);
            } finally {
                setIsSaving(false);
            }
        }
    };
    
    const handleLoad = async () => {
        try {
            const response = await api.get('/manual/processed-assignments');
            const savedTimetables = response.data.savedTimetables.filter(t => t.source === 'manual');

            if (savedTimetables.length === 0) {
                alert("No saved timetables found.");
                return;
            }

            const selection = window.prompt(
                "Select a timetable to load:\n\n" +
                savedTimetables.map((t, i) => `${i + 1}. ${t.name}`).join("\n")
            );

            const selectedIndex = parseInt(selection, 10) - 1;

            if (!isNaN(selectedIndex) && savedTimetables[selectedIndex]) {
                const selectedTimetable = savedTimetables[selectedIndex];
                
                // Fron the populated data, create the comboIdToDetails map
                const newComboIdToDetails = {};
                const unpopulatedClassTimetable = {};

                for (const classId in selectedTimetable.class_timetables) {
                    unpopulatedClassTimetable[classId] = [];
                    for (const day in selectedTimetable.class_timetables[classId]) {
                        unpopulatedClassTimetable[classId][day] = [];
                        for (const hour in selectedTimetable.class_timetables[classId][day]) {
                            const combo = selectedTimetable.class_timetables[classId][day][hour];
                            if (combo) {
                                newComboIdToDetails[combo._id] = { subject: combo.subject.name, faculty: combo.faculty.name };
                                unpopulatedClassTimetable[classId][day][hour] = combo._id;
                            } else {
                                unpopulatedClassTimetable[classId][day][hour] = null;
                            }
                        }
                    }
                }

                const loadResponse = await api.post('/manual/load', {
                    timetableId,
                    savedTimetableId: selectedTimetable._id,
                });

                if (loadResponse.data.ok) {
                    setComboIdToDetails(newComboIdToDetails);
                    setClassTimetable(unpopulatedClassTimetable);
                    setTeacherTimetable(loadResponse.data.teacherTimetable);
                    setSubjectHoursAssigned(loadResponse.data.subjectHoursAssigned);
                    setSavedTimetableId(selectedTimetable._id);
                    alert(`Timetable "${selectedTimetable.name}" loaded successfully.`);
                } else {
                    alert(`Failed to load timetable: ${loadResponse.data.error}`);
                }
            }
        } catch (error) {
            console.error('Error loading timetables:', error);
            alert('Failed to fetch saved timetables.');
        }
    };

    if (isLoading || timetableId === null || isDeleting) { // Add isDeleting to loading check
        return <div>Loading...</div>;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>Manual Timetable Generator</h1>
                <div>
                    <button
                        onClick={handleLoad}
                        style={{ backgroundColor: 'blue', color: 'white', marginRight: '10px', padding: '20px', fontSize: '24px' }}
                        disabled={isSaving || isDeleting}
                    >
                        Load Timetable
                    </button>
                    <button
                        onClick={() => handleSave()}
                        style={{ backgroundColor: 'green', color: 'white', marginRight: '10px', padding: '20px', fontSize: '24px' }}
                        disabled={isSaving || isDeleting}
                    >
                        {isSaving ? 'Saving...' : 'Save Timetable'}
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        style={{ backgroundColor: 'purple', color: 'white', marginRight: '10px', padding: '20px', fontSize: '24px' }}
                        disabled={isSaving || isDeleting}
                    >
                        Save As...
                    </button>
                    <button 
                        onClick={handleClearAll}
                        style={{ backgroundColor: 'orange', color: 'white', marginRight: '10px' }}
                        disabled={isSaving || isDeleting}
                    >
                        Clear All Timetables
                    </button>
                    <button 
                        onClick={handleDeleteTimetable}
                        style={{ backgroundColor: 'red', color: 'white' }}
                        disabled={isSaving || isDeleting}
                    >
                        {isDeleting ? 'Deleting...' : 'Delete Timetable'}
                    </button>
                </div>
            </div>
            {classes.map(c => (
                <div key={c._id} style={{ marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h2>Timetable for {c.name}</h2>
                        <button 
                            onClick={() => handleAutoFill(c._id)}
                            disabled={isAutoFilling[c._id] || isDeleting || isSaving}
                        >
                            {isAutoFilling[c._id] ? 'Filling...' : 'Auto-Fill'}
                        </button>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Day</th>
                                {hours.map(hour => <th key={hour}>Hour {hour}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {days.map((day, dayIndex) => (
                                <tr key={day}>
                                    <td>{day}</td>
                                    {hours.map((hour, hourIndex) => {
                                        const comboIdInSlot = classTimetable[c._id]?.[dayIndex]?.[hourIndex];
                                        const tdStyle = {
                                            backgroundColor: comboIdInSlot ? 'lightgreen' : 'lightcoral',
                                            padding: '5px', // Add some padding for better visual
                                        };
                                        return (
                                            <td key={hourIndex} style={tdStyle}>
                                                <select
                                                    onFocus={() => handleGetOptions(c._id, dayIndex, hourIndex)}
                                                    value={comboIdInSlot || ''}
                                                    onChange={(e) => handlePlaceCombo(c._id, dayIndex, hourIndex, e.target.value)}
                                                    disabled={isDeleting || isSaving} // Disable selects during save/delete
                                                    style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }} // Ensure select doesn't hide TD background
                                                >
                                                    <option value="">--Select--</option>
                                                    {/* Pre-populate the currently selected option if it's not in the validOptions list */}
                                                    {(comboIdInSlot && 
                                                     !validOptions[`${c._id}-${dayIndex}-${hourIndex}`]?.find(opt => opt.comboId === comboIdInSlot)) &&
                                                        (() => {
                                                            const details = comboIdToDetails[comboIdInSlot];
                                                            return (
                                                                <option value={comboIdInSlot}>
                                                                    {details ? `${details.subject} - ${details.faculty}` : 'Loading...'}
                                                                </option>
                                                            );
                                                        })()
                                                    }
                                                    {validOptions[`${c._id}-${dayIndex}-${hourIndex}`]?.map(option => (
                                                        <option key={option.comboId} value={option.comboId}>
                                                            {option.subject} - {option.faculty}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div style={{ marginTop: '20px' }}>
                        <h3>Subject Allocation Summary</h3>
                        <table style={{ width: '50%' }}>
                            <thead>
                                <tr>
                                    <th>Subject</th>
                                    <th>Assigned Hours</th>
                                    <th>Required Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                {c.subject_hours && Object.keys(c.subject_hours).map(subjectId => (
                                    <tr key={subjectId}>
                                        <td>{subjectIdToDetails[subjectId]?.name || 'Unknown Subject'}</td>
                                        <td>{subjectHoursAssigned[c._id]?.[subjectId] || 0}</td>
                                        <td>{c.subject_hours[subjectId]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ManualTimetable;