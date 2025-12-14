import React, { useState, useEffect } from 'react';
import api from '../../api/axios';

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hours = ["1", "2", "3", "4", "5", "6", "7", "8"];

const ManualTimetable = () => {
    // Core data
    const [classes, setClasses] = useState([]);
    
    // Timetable states
    const [classTimetable, setClassTimetable] = useState({});
    const [teacherTimetable, setTeacherTimetable] = useState({});
    const [subjectHoursAssigned, setSubjectHoursAssigned] = useState({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [isAutoFilling, setIsAutoFilling] = useState({});
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false); // New state for save loading
    const [timetableId, setTimetableId] = useState(null); // New state for timetableId

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
            setValidOptions(prev => ({ ...prev, [`${classId}-${dayIndex}-${hourIndex}`]: response.data.validOptions }));
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

    const handleSave = async () => {
        if (!timetableId) return;

        const name = window.prompt("Enter a name for this timetable:");
        if (name) {
            setIsSaving(true);
            try {
                const response = await api.post('/manual/save', { timetableId, name });
                if (response.data.ok) {
                    alert(response.data.message);
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
    
    if (isLoading || timetableId === null || isDeleting) { // Add isDeleting to loading check
        return <div>Loading...</div>;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>Manual Timetable Generator</h1>
                <div>
                    <button
                        onClick={handleSave}
                        style={{ backgroundColor: 'green', color: 'white', marginRight: '10px' }}
                        disabled={isSaving || isDeleting}
                    >
                        {isSaving ? 'Saving...' : 'Save Timetable'}
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
                                    {hours.map((hour, hourIndex) => (
                                        <td key={hourIndex}>
                                            <select
                                                onFocus={() => handleGetOptions(c._id, dayIndex, hourIndex)}
                                                value={classTimetable[c._id]?.[dayIndex]?.[hourIndex] || ''}
                                                onChange={(e) => handlePlaceCombo(c._id, dayIndex, hourIndex, e.target.value)}
                                                disabled={isDeleting || isSaving} // Disable selects during save/delete
                                            >
                                                <option value="">--Select--</option>
                                                {/* Pre-populate the currently selected option if it's not in the validOptions list */}
                                                {classTimetable[c._id]?.[dayIndex]?.[hourIndex] && 
                                                 !validOptions[`${c._id}-${dayIndex}-${hourIndex}`]?.find(opt => opt.comboId === classTimetable[c._id]?.[dayIndex]?.[hourIndex]) &&
                                                    <option value={classTimetable[c._id]?.[dayIndex]?.[hourIndex]}>
                                                        Assigned
                                                    </option>
                                                }
                                                {validOptions[`${c._id}-${dayIndex}-${hourIndex}`]?.map(option => (
                                                    <option key={option.comboId} value={option.comboId}>
                                                        {option.subject} - {option.faculty}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

export default ManualTimetable;