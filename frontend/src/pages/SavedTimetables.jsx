import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';

const SavedTimetables = () => {
    const [timetables, setTimetables] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchTimetables = async () => {
            try {
                setIsLoading(true);
                const response = await api.get('/timetables');
                setTimetables(response.data);
                setError(null);
            } catch (err) {
                setError('Failed to fetch saved timetables. Please try again later.');
                console.error('Error fetching timetables:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTimetables();
    }, []);

    if (isLoading) {
        return <div>Loading timetables...</div>;
    }

    if (error) {
        return <div style={{ color: 'red' }}>{error}</div>;
    }

    const handleViewClick = (id) => {
        navigate(`/timetable/${id}`);
    };

    return (
        <div className="manage-container">
            <h2>Saved Timetables</h2>
            {timetables.length === 0 ? (
                <p>No saved timetables found.</p>
            ) : (
                <table className="styled-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Saved At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {timetables.map((tt) => (
                            <tr key={tt._id}>
                                <td>{tt.name}</td>
                                <td>{new Date(tt.createdAt).toLocaleString()}</td>
                                <td>
                                    <button
                                        className="primary-btn"
                                        onClick={() => handleViewClick(tt._id)}
                                    >
                                        View
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

export default SavedTimetables;
