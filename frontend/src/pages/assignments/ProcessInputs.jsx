import React, { useState } from 'react';
import api from '../../api/axios';

const ProcessInputs = () => {
    const [status, setStatus] = useState('idle'); // idle, processing, success, error
    const [message, setMessage] = useState('');

    const handleProcess = async () => {
        setStatus('processing');
        setMessage('');
        try {
            const response = await api.post('/process-new-input');
            setStatus('success');
            setMessage(response.data.message);
        } catch (error) {
            setStatus('error');
            setMessage(error.response?.data?.error || 'An unexpected error occurred.');
        }
    };

    return (
        <div>
            <h1>Process and Save Assignments</h1>
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
                <div style={{ marginTop: '20px', color: status === 'error' ? 'red' : 'green' }}>
                    {message}
                </div>
            )}
        </div>
    );
};

export default ProcessInputs;
