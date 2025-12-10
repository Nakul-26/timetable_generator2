import React, { useState, useEffect } from 'react';
import api from '../../api/axios';

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hours = ["1", "2", "3", "4", "5", "6", "7", "8"];

const ManualTimetable = () => {
    // Core data
    const [classes, setClasses] = useState([]);
    const [faculties, setFaculties] = useState([]);
    const [subjects, setSubjects] = useState([]);

    // Timetable states
    const [classTimetable, setClassTimetable] = useState({});
    const [teacherTimetable, setTeacherTimetable] = useState({});
    const [subjectHoursAssigned, setSubjectHoursAssigned] = useState({});
    
    // UI state
    const [validOptions, setValidOptions] = useState({});
    const [isLoading, setIsLoading] = useState(true);

    // Initial data fetch and state setup
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setIsLoading(true);
                const [classesRes, facultiesRes, subjectsRes] = await Promise.all([
                    api.get('/classes'),
                    api.get('/faculties'),
                    api.get('/subjects')
                ]);

                const fetchedClasses = classesRes.data;
                const fetchedFaculties = facultiesRes.data;
                const fetchedSubjects = subjectsRes.data;

                setClasses(fetchedClasses);
                setFaculties(fetchedFaculties);
                setSubjects(fetchedSubjects);

                // Initialize classTimetable
                const initialClassTimetable = {};
                fetchedClasses.forEach(c => {
                    initialClassTimetable[c._id] = Array(days.length).fill(null).map(() => Array(hours.length).fill(null));
                });
                setClassTimetable(initialClassTimetable);

                // Initialize teacherTimetable
                const initialTeacherTimetable = {};
                fetchedFaculties.forEach(f => {
                    initialTeacherTimetable[f._id] = Array(days.length).fill(null).map(() => Array(hours.length).fill(null));
                });
                setTeacherTimetable(initialTeacherTimetable);

                // Initialize subjectHoursAssigned
                const initialSubjectHours = {};
                fetchedSubjects.forEach(s => {
                    initialSubjectHours[s._id] = 0;
                });
                setSubjectHoursAssigned(initialSubjectHours);

            } catch (error) {
                console.error('Error fetching initial data:', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const handleGetOptions = async (classId, dayIndex, hourIndex) => {
        try {
            const response = await api.post(`/manual/valid-options`, {
                classId,
                day: dayIndex,
                hour: hourIndex,
                classTimetable,
                teacherTimetable,
                subjectHoursAssigned
            });
            setValidOptions({ ...validOptions, [`${classId}-${dayIndex}-${hourIndex}`]: response.data.validOptions });
        } catch (error) {
            console.error('Error fetching valid options:', error);
        }
    };

    const handlePlaceCombo = async (classId, dayIndex, hourIndex, comboId) => {
        // If user selects the "--Select--" option, do nothing or clear the cell
        if (!comboId) {
            // Optional: implement logic to clear a cell
            return;
        }

        try {
            const response = await api.post(`/manual/place`, {
                classId,
                day: dayIndex,
                hour: hourIndex,
                comboId,
                classTimetable,
                teacherTimetable,
                subjectHoursAssigned
            });

            if (response.data.ok) {
                // Update state with the new state from the backend
                setClassTimetable(response.data.classTimetable);
                setTeacherTimetable(response.data.teacherTimetable);
                setSubjectHoursAssigned(response.data.subjectHoursAssigned);
            } else {
                // If placement was invalid, show the error
                alert(`Error: ${response.data.error}`);
            }
        } catch (error) {
            console.error('Error placing combo:', error);
            alert('An unexpected error occurred while placing the combo.');
        }
    };
    
    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Manual Timetable Generator</h1>
            {classes.map(c => (
                <div key={c._id} style={{ marginBottom: '40px' }}>
                    <h2>Timetable for {c.name}</h2>
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
                                            >
                                                <option value="">--Select--</option>
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
