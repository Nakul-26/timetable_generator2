import React, { useState } from 'react';
import api from '../../api/axios';

const ProcessInputs = () => {
    const [status, setStatus] = useState('idle'); // idle, processing, success, error
    const [message, setMessage] = useState('');
    const [classAssignments, setClassAssignments] = useState([]);

    const handleProcess = async () => {
        setStatus('processing');
        setMessage('');
        setClassAssignments([]);
        try {
            const response = await api.post('/process-new-input');
            setStatus('success');
            setMessage(response.data.message);
            setClassAssignments(response.data.classAssignments || []);
        } catch (error) {
            setStatus('error');
            setMessage(error.response?.data?.error || 'An unexpected error occurred.');
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

            {classAssignments.length > 0 && (
                <div>
                    <h2>Resultant Teacher-Subject Combinations by Class</h2>
                    {classAssignments.map(assignment => (
                        <div key={assignment.classId} style={{ marginBottom: '20px' }}>
                            <h3>{assignment.className}</h3>
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
                    ))}
                </div>
            )}
        </div>
    );
};

export default ProcessInputs;

