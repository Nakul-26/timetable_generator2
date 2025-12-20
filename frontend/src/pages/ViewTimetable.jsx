import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/axios';

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hours = ["1", "2", "3", "4", "5", "6", "7", "8"];

const ViewTimetable = () => {
    const { id } = useParams();
    const [timetable, setTimetable] = useState(null);
    const [classes, setClasses] = useState([]);
    const [combos, setCombos] = useState([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const [classMap, setClassMap] = useState({});
    const [comboMap, setComboMap] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const [ttRes, classesRes, combosRes] = await Promise.all([
                    api.get(`/timetable/${id}`),
                    api.get('/classes'),
                    api.get('/teacher-subject-combos')
                ]);

                setTimetable(ttRes.data);
                setClasses(classesRes.data);
                setCombos(combosRes.data);
                
                setError(null);
            } catch (err) {
                setError('Failed to fetch data. Please try again later.');
                console.error('Error fetching data:', err);
            } finally {
                setIsLoading(false);
            }
        };

        if (id) {
            fetchData();
        }
    }, [id]);

    useEffect(() => {
        if (classes.length && combos.length) {
            const newClassMap = classes.reduce((acc, c) => ({ ...acc, [c._id]: c.name }), {});
            
            const newComboMap = combos.reduce((acc, combo) => ({
                ...acc,
                [combo._id]: {
                    subject: combo.subject.name || 'N/A',
                    faculty: combo.faculty.name || 'N/A'
                }
            }), {});

            setClassMap(newClassMap);
            setComboMap(newComboMap);
        }
    }, [classes, combos]);

    if (isLoading) {
        return <div>Loading timetable...</div>;
    }

    if (error) {
        return <div style={{ color: 'red' }}>{error}</div>;
    }

    if (!timetable) {
        return <div>Timetable not found.</div>;
    }

    const classIds = Object.keys(timetable.class_timetables);

    return (
        <div className="manage-container">
            <h2>{timetable.name}</h2>
            <p><strong>Saved At:</strong> {new Date(timetable.createdAt).toLocaleString()}</p>

            {classIds.map(classId => (
                <div key={classId} style={{ marginBottom: '40px' }}>
                    <h3>{classMap[classId] || 'Unknown Class'}</h3>
                    <table className="styled-table">
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
                                        const comboId = timetable.class_timetables[classId]?.[dayIndex]?.[hourIndex];
                                        const cellData = comboId ? comboMap[comboId] : null;
                                        return (
                                            <td key={hourIndex}>
                                                {cellData ? (
                                                    <div>
                                                        <div><strong>{cellData.subject}</strong></div>
                                                        <div><em>{cellData.faculty}</em></div>
                                                    </div>
                                                ) : '--'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

export default ViewTimetable;
