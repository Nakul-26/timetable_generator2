import React, { useState, useEffect } from 'react';
import api from '../../api/axios';

const ProcessInputs = () => {
    const [status, setStatus] = useState('idle'); // idle, processing, success, error
    const [message, setMessage] = useState('');
    const [classAssignments, setClassAssignments] = useState([]); // For newly processed assignments
    const [existingSavedTimetables, setExistingSavedTimetables] = useState([]); // For already saved timetables
    const [loadingExisting, setLoadingExisting] = useState(true); // Loading state for existing data

    // Fetch existing saved timetables on component mount
    useEffect(() => {
        const fetchExistingTimetables = async () => {
            try {
                const response = await api.get('/processed-assignments'); // New endpoint
                setExistingSavedTimetables(response.data.savedTimetables || []);
            } catch (error) {
                console.error("Error fetching existing timetables:", error);
                // Optionally set an error message for existing assignments
            } finally {
                setLoadingExisting(false);
            }
        };
        fetchExistingTimetables();
    }, []); // Empty dependency array means this runs once on mount

    const handleProcess = async () => {
        setStatus('processing');
        setMessage('');
        setClassAssignments([]); // Clear previous "new" results at the start

        try {
            // --- Step 1: Process the inputs ---
            const processResponse = await api.post('/process-new-input');
            
            setStatus('success');
            setMessage(processResponse.data.message || 'Processing successful!');
            setClassAssignments(processResponse.data.classAssignments || []);

            // --- Step 2: Try to refresh the list of saved timetables after the main action ---
            try {
                const refreshedResponse = await api.get('/processed-assignments');
                setExistingSavedTimetables(refreshedResponse.data.savedTimetables || []);
            } catch (refreshError) {
                console.error("Failed to refresh saved assignments after processing:", refreshError);
                // The main action succeeded, so we don't show a scary error.
                // We can add a small, secondary message if needed, but for now, logging is sufficient.
            }

        } catch (processError) {
            setStatus('error');
            // If the main processing fails, set an error message and ensure no new results are shown.
            setMessage(processError.response?.data?.error || 'An unexpected error occurred during processing.');
            setClassAssignments([]); 
        }
    };

    return (
        <div className="manage-container">
            <h2>Process and Save Assignments</h2>
            <p>
                Click the button below to process the existing data (classes, subjects, teachers, etc.) 
                and automatically assign teacher-subject combinations to each class.
            </p>
            <p>
                This will populate the data needed for the Manual Timetable Generator.
            </p>
            
            <button onClick={handleProcess} disabled={status === 'processing'}>
                {status === 'processing' ? 'Processing...' : 'Process and Save Assignments'}
            </button>

            {message && (
                <div className={status === 'error' ? 'error-message' : 'success-message'}>
                    {message}
                </div>
            )}

            {/* Display Existing Saved Assignments */}
            <div style={{ marginTop: '40px' }}>
                <h3>Previously Saved Assignments</h3>
                {loadingExisting ? (
                    <p>Loading previously saved assignments...</p>
                ) : existingSavedTimetables.length > 0 ? (
                    existingSavedTimetables.map(savedResult => (
                        <div key={savedResult._id} style={{ marginBottom: '30px', border: '1px solid #eee', padding: '15px', borderRadius: '8px' }}>
                            <h4>{savedResult.name}</h4>
                            <p>Type: <strong>{savedResult.source}</strong> | Created: {new Date(savedResult.createdAt).toLocaleString()}</p>
                            
                            {/* Render based on the source type */}
                            {savedResult.source === 'assignments' ? (
                                // --- Render Assignment-Only Result ---
                                Object.entries(savedResult.populated_assignments || {}).map(([classId, combos]) => (
                                    <div key={classId} style={{ marginBottom: '20px', marginLeft: '10px' }}>
                                        <h5>Class ID: {classId}</h5>
                                        {combos && combos.length > 0 ? (
                                            <table className="styled-table">
                                                <thead>
                                                    <tr style={{ borderBottom: '2px solid black' }}>
                                                        <th style={{ textAlign: 'left', padding: '8px' }}>Teacher</th>
                                                        <th style={{ textAlign: 'left', padding: '8px' }}>Subject</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {combos.map(combo => (
                                                        <tr key={combo._id} style={{ borderBottom: '1px solid #ccc' }}>
                                                            <td style={{ padding: '8px' }}>{combo.faculty.name}</td>
                                                            <td style={{ padding: '8px' }}>{combo.subject.name}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <p>No combinations assigned to this class.</p>
                                        )}
                                    </div>
                                ))
                            ) : (
                                // --- Render Full Timetable Result ---
                                Object.entries(savedResult.class_timetables || {}).map(([classId, classTimetable]) => {
                                    const uniqueCombos = new Map();
                                    Object.values(classTimetable).forEach(day => {
                                        Object.values(day).forEach(combo => {
                                            if (combo && !uniqueCombos.has(combo._id)) {
                                                uniqueCombos.set(combo._id, combo);
                                            }
                                        });
                                    });
                                    const combos = Array.from(uniqueCombos.values());

                                    return (
                                        <div key={classId} style={{ marginBottom: '20px', marginLeft: '10px' }}>
                                            <h5>Class ID: {classId}</h5>
                                            {combos.length > 0 ? (
                                                <table className="styled-table">
                                                    <thead>
                                                        <tr style={{ borderBottom: '2px solid black' }}>
                                                            <th style={{ textAlign: 'left', padding: '8px' }}>Teacher</th>
                                                            <th style={{ textAlign: 'left', padding: '8px' }}>Subject</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {combos.map(combo => (
                                                            <tr key={combo._id} style={{ borderBottom: '1px solid #ccc' }}>
                                                                <td style={{ padding: '8px' }}>{combo.faculty.name}</td>
                                                                <td style={{ padding: '8px' }}>{combo.subject.name}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <p>No combinations assigned to this class in this timetable.</p>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    ))
                ) : (
                    <p>No previously saved assignments found.</p>
                )}
            </div>

            {/* Display newly processed assignments below existing ones */}
            {classAssignments.length > 0 && (
                <div style={{ marginTop: '40px' }}>
                    <h3>Newly Processed Teacher-Subject Combinations</h3>
                    {classAssignments.map(assignment => (
                        <div key={`new-${assignment.classId}`} style={{ marginBottom: '20px' }}>
                            <h4>Class Name: {assignment.className}</h4>
                            {assignment.combos.length > 0 ? (
                                <table className="styled-table">
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid black' }}>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Teacher</th>
                                            <th style={{ textAlign: 'left', padding: '8px' }}>Subject</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assignment.combos.map(combo => (
                                            <tr key={`new-combo-${combo._id}`} style={{ borderBottom: '1px solid #ccc' }}>
                                                <td style={{ padding: '8px' }}>{combo.faculty.name}</td>
                                                <td style={{ padding: '8px' }}>{combo.subject.name}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p>No combinations assigned to this class.</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ProcessInputs;


