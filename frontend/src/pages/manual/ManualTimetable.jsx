import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hours = ["1", "2", "3", "4", "5", "6", "7", "8"];

const ManualTimetable = () => {
    const [searchParams] = useSearchParams();
    const sourceTimetableId = searchParams.get('sourceTimetableId');

    // Core data
    const [classes, setClasses] = useState([]);
    const [subjects, setSubjects] = useState([]);
    const [subjectIdToDetails, setSubjectIdToDetails] = useState({});
    const [facultyIdToName, setFacultyIdToName] = useState({});
    const [requiredHoursByClassSubject, setRequiredHoursByClassSubject] = useState({});
    
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
    const [slotSources, setSlotSources] = useState({});
    const [lockedSlots, setLockedSlots] = useState({});
    const [sourceTimetableMeta, setSourceTimetableMeta] = useState(null);
    const [editableTimetableName, setEditableTimetableName] = useState('');
    const [activeCellKey, setActiveCellKey] = useState(null);


    const [validOptions, setValidOptions] = useState({}); // { "classId-dayIndex-hourIndex": [options] }
    const isEditingGeneratedTimetable =
        Boolean(sourceTimetableId) &&
        (sourceTimetableMeta?.source === 'generator' || sourceTimetableMeta?.status === 'generated');
    const getCellKey = (classId, dayIndex, hourIndex) => `${classId}-${dayIndex}-${hourIndex}`;

    const handleToggleCellEditor = (classId, dayIndex, hourIndex) => {
        const cellKey = getCellKey(classId, dayIndex, hourIndex);
        const nextIsOpening = activeCellKey !== cellKey;
        setActiveCellKey(nextIsOpening ? cellKey : null);

        if (nextIsOpening) {
            handleGetOptions(classId, dayIndex, hourIndex);
        }
    };

    const getClassSummaryRows = (classObj) => {
        const classId = classObj._id;
        const requiredHours = requiredHoursByClassSubject[classId] || classObj.subject_hours || {};
        const assignedHours = subjectHoursAssigned[classId] || {};
        const subjectIds = Array.from(new Set([
            ...Object.keys(requiredHours),
            ...Object.keys(assignedHours),
        ]));

        return subjectIds.map((subjectId) => ({
            subjectId,
            name: subjectIdToDetails[subjectId]?.name || 'Unknown Subject',
            assignedHours: assignedHours[subjectId] || 0,
            requiredHours: requiredHours[subjectId],
        }));
    };

    const resolveComboDisplay = (combo, classId = '') => {
        const subjectId = String(combo?.subject?._id || combo?.subject || combo?.subject_id || '');
        const facultyIds = Array.isArray(combo?.faculty_ids)
            ? combo.faculty_ids.map((id) => String(id))
            : combo?.faculty_id
                ? [String(combo.faculty_id)]
                : combo?.faculty
                    ? [String(combo.faculty?._id || combo.faculty)]
                    : [];

        const subjectName =
            combo?.subject?.name ||
            combo?.subject_name ||
            subjectIdToDetails[subjectId]?.name ||
            (subjectId ? `Subject ${subjectId.slice(-4)}` : 'Unknown Subject');

        return {
            subject: subjectName,
            faculty:
                combo?.faculty?.name ||
                combo?.faculty_name ||
                facultyIds.map((facultyId) => facultyIdToName[facultyId] || `Faculty ${facultyId.slice(-4)}`).join(', ') ||
                'Unknown Teacher',
            subjectId,
            classId,
        };
    };

    // Initial data fetch and state setup
    useEffect(() => {
        const fetchAndInitialize = async () => {
            try {
                setIsLoading(true);
                // Fetch core data
                const [classesRes, facultiesRes, subjectsRes, combosRes, classSubjectRes, sourceRes] = await Promise.all([
                    api.get('/classes'),
                    api.get('/faculties'),
                    api.get('/subjects'),
                    api.get('/teacher-subject-combos'),
                    api.get('/class-subjects'),
                    sourceTimetableId ? api.get(`/timetable/${sourceTimetableId}`) : Promise.resolve({ data: null })
                ]);

                const fetchedClasses = classesRes.data;
                const fetchedFaculties = facultiesRes.data;
                const fetchedSubjects = subjectsRes.data;
                const fetchedCombos = combosRes.data || [];
                const fetchedClassSubjects = classSubjectRes.data || [];

                setClasses(fetchedClasses);
                setSubjects(fetchedSubjects);
                setFacultyIdToName(
                    fetchedFaculties.reduce((acc, faculty) => {
                        acc[String(faculty._id)] = faculty.name;
                        return acc;
                    }, {})
                );

                const subjectDetails = {};
                fetchedSubjects.forEach(s => {
                    subjectDetails[s._id] = s;
                });
                setSubjectIdToDetails(subjectDetails);

                const requiredHoursMap = {};
                fetchedClassSubjects.forEach((item) => {
                    const classId = String(item?.class?._id || item?.class || '');
                    const subjectId = String(item?.subject?._id || item?.subject || '');
                    const hoursPerWeek = Number(item?.hoursPerWeek || 0);

                    if (!classId || !subjectId) return;
                    if (!requiredHoursMap[classId]) {
                        requiredHoursMap[classId] = {};
                    }
                    requiredHoursMap[classId][subjectId] = hoursPerWeek;
                });
                setRequiredHoursByClassSubject(requiredHoursMap);

                const comboDetails = {};
                fetchedCombos.forEach(combo => {
                    const comboId = String(combo._id);
                    const resolved = resolveComboDisplay(combo);
                    comboDetails[comboId] = {
                        subject: resolved.subject,
                        faculty: resolved.faculty,
                    };
                });

                if (Array.isArray(sourceRes.data?.combos)) {
                    sourceRes.data.combos.forEach(combo => {
                        const comboId = String(combo._id);
                        const resolved = resolveComboDisplay(combo);
                        comboDetails[comboId] = {
                            subject: resolved.subject,
                            faculty: resolved.faculty,
                        };
                    });
                }

                setComboIdToDetails(comboDetails);


                const electiveGroups = JSON.parse(localStorage.getItem('classElectiveGroups')) || [];

                // Generate a unique timetableId for this session
                const currentTimetableId = `manual-${Date.now()}`;
                setTimetableId(currentTimetableId);
                setSourceTimetableMeta(sourceRes.data || null);
                setEditableTimetableName(sourceRes.data?.name || '');

                // Initialize backend state and get initial timetables
                // Pass frontend's preferred days and hours configuration
                const initStateResponse = await api.post('/manual/initialize', {
                    timetableId: currentTimetableId,
                    classes: fetchedClasses,
                    faculties: fetchedFaculties,
                    subjects: fetchedSubjects,
                    electiveGroups: electiveGroups, // Pass elective groups to the backend
                    config: { days: days.length, hours: hours.length }, // Pass config
                    sourceTimetableId,
                });
                
                if (initStateResponse.data.ok) {
                    if (sourceTimetableId) {
                        const loadResponse = await api.post('/manual/load', {
                            timetableId: currentTimetableId,
                            savedTimetableId: sourceTimetableId,
                        });

                        if (!loadResponse.data.ok) {
                            throw new Error(loadResponse.data.error || 'Failed to load source timetable.');
                        }

                        setClassTimetable(loadResponse.data.classTimetable);
                        setTeacherTimetable(loadResponse.data.teacherTimetable);
                        setSubjectHoursAssigned(loadResponse.data.subjectHoursAssigned);
                        setSlotSources(loadResponse.data.slotSources || {});
                        setLockedSlots(loadResponse.data.lockedSlots || {});
                        setSavedTimetableId(
                            sourceRes.data?.source === 'manual' && sourceRes.data?.status !== 'generated'
                                ? sourceTimetableId
                                : null
                        );
                    } else {
                        setClassTimetable(initStateResponse.data.classTimetable);
                        setTeacherTimetable(initStateResponse.data.teacherTimetable);
                        setSubjectHoursAssigned(initStateResponse.data.subjectHoursAssigned);
                        setSlotSources(initStateResponse.data.slotSources || {});
                        setLockedSlots(initStateResponse.data.lockedSlots || {});
                    }
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
    }, [sourceTimetableId]); // Empty dependency array means this runs once on mount

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
                newDetails[opt.comboId] = {
                    subject: opt.subject || (opt.subjectId ? subjectIdToDetails[String(opt.subjectId)]?.name : null) || 'Unknown Subject',
                    faculty: opt.faculty || (Array.isArray(opt.facultyIds) ? opt.facultyIds.map((facultyId) => facultyIdToName[String(facultyId)] || `Faculty ${String(facultyId).slice(-4)}`).join(', ') : 'Unknown Teacher'),
                };
            });
            setComboIdToDetails(prev => ({ ...prev, ...newDetails }));

        } catch (error) {
            console.error('Error fetching valid options:', error);
            alert(`Error fetching options: ${error.response?.data?.error || error.message}`);
        }
    };

    const handleClearSlot = async (classId, dayIndex, hourIndex) => {
        if (!timetableId) return;
        try {
            const response = await api.post('/manual/clear-slot', {
                timetableId,
                classId,
                day: dayIndex,
                hour: hourIndex
            });
            if (response.data.ok) {
                setClassTimetable(response.data.classTimetable);
                setTeacherTimetable(response.data.teacherTimetable);
                setSubjectHoursAssigned(response.data.subjectHoursAssigned);
                setSlotSources(response.data.slotSources || {});
                setLockedSlots(response.data.lockedSlots || {});
            } else {
                alert(`Error clearing slot: ${response.data.error}`);
            }
        } catch (error) {
            console.error('Error clearing slot:', error);
            alert('An unexpected error occurred while clearing the slot.');
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
                setSlotSources(response.data.slotSources || {});
                setLockedSlots(response.data.lockedSlots || {});
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
                // The backend now sends back the details for the combos it placed.
                if (response.data.comboIdToDetails) {
                    setComboIdToDetails(prev => ({ ...prev, ...response.data.comboIdToDetails }));
                }

                setClassTimetable(response.data.classTimetable);
                setTeacherTimetable(response.data.teacherTimetable);
                setSubjectHoursAssigned(response.data.subjectHoursAssigned);
                setSlotSources(response.data.slotSources || {});
                setLockedSlots(response.data.lockedSlots || {});
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
                    setSlotSources(response.data.slotSources || {});
                    setLockedSlots(response.data.lockedSlots || {});
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

        const suggestedName = sourceTimetableMeta?.name
            ? `${sourceTimetableMeta.name} (Edited)`
            : 'Edited Timetable';
        const name = isEditingGeneratedTimetable
            ? (editableTimetableName || suggestedName).trim()
            : window.prompt("Enter a name for this timetable:", suggestedName)?.trim();
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
                            const combos = selectedTimetable.class_timetables[classId][day][hour]; // It's an array of combos
                            
                            if (combos && Array.isArray(combos) && combos.length > 0) {
                                const comboIds = [];
                                combos.forEach(combo => {
                                    if (combo && combo._id) {
                                        newComboIdToDetails[combo._id] = { subject: combo.subject.name, faculty: combo.faculty.name };
                                        comboIds.push(combo._id);
                                    }
                                });
                                unpopulatedClassTimetable[classId][day][hour] = comboIds;
                            } else {
                                unpopulatedClassTimetable[classId][day][hour] = []; // Ensure empty slots are arrays
                            }
                        }
                    }
                }

                const loadResponse = await api.post('/manual/load', {
                    timetableId,
                    savedTimetableId: selectedTimetable._id,
                });

                if (loadResponse.data.ok) {
                    setComboIdToDetails(prev => ({ ...prev, ...newComboIdToDetails }));
                    // The state from the backend is now normalized and reliable
                    setClassTimetable(loadResponse.data.classTimetable);
                    setTeacherTimetable(loadResponse.data.teacherTimetable);
                    setSubjectHoursAssigned(loadResponse.data.subjectHoursAssigned);
                    setSlotSources(loadResponse.data.slotSources || {});
                    setLockedSlots(loadResponse.data.lockedSlots || {});
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

    const handleToggleLock = async (classId, dayIndex, hourIndex) => {
        if (!timetableId) return;

        try {
            const response = await api.post('/manual/toggle-lock', {
                timetableId,
                classId,
                day: dayIndex,
                hour: hourIndex,
            });

            if (response.data.ok) {
                setLockedSlots(response.data.lockedSlots || {});
            } else {
                alert(`Failed to toggle lock: ${response.data.error}`);
            }
        } catch (error) {
            console.error('Error toggling slot lock:', error);
            alert(`An unexpected error occurred while toggling the lock: ${error.response?.data?.error || error.message}`);
        }
    };

    if (isLoading || timetableId === null || isDeleting) { // Add isDeleting to loading check
        return <div>Loading...</div>;
    }

    return (
        <div className="manage-container manual-page">
            <div className="manual-header">
                <h1>{isEditingGeneratedTimetable ? 'Edit Generated Timetable' : 'Manual Timetable Generator'}</h1>
                {sourceTimetableMeta && (
                    isEditingGeneratedTimetable ? (
                        <div className="manual-edit-meta">
                            <label className="manual-edit-name">
                                <span>Timetable Name</span>
                                <input
                                    type="text"
                                    value={editableTimetableName}
                                    onChange={(e) => setEditableTimetableName(e.target.value)}
                                    placeholder="Enter timetable name"
                                    disabled={isSaving || isDeleting}
                                />
                            </label>
                            <p>
                                Editing generated timetable
                                {sourceTimetableMeta.status ? ` | ${sourceTimetableMeta.status}` : ''}
                            </p>
                        </div>
                    ) : (
                        <p>
                            Editing generated timetable: <strong>{sourceTimetableMeta.name}</strong>
                            {sourceTimetableMeta.status ? ` | ${sourceTimetableMeta.status}` : ''}
                        </p>
                    )
                )}
                <div className="manual-header-actions">
                    <button
                        onClick={() => handleSave()}
                        className="manual-action-btn manual-action-save"
                        disabled={isSaving || isDeleting}
                    >
                        {isSaving ? 'Saving...' : 'Save Timetable'}
                    </button>
                    {!isEditingGeneratedTimetable && (
                        <>
                            <button
                                onClick={handleLoad}
                                className="manual-action-btn manual-action-load"
                                disabled={isSaving || isDeleting}
                            >
                                Load Timetable
                            </button>
                            <button
                                onClick={() => handleSave(true)}
                                className="manual-action-btn manual-action-save-as"
                                disabled={isSaving || isDeleting}
                            >
                                Save As...
                            </button>
                            <button
                                onClick={handleClearAll}
                                className="manual-action-btn manual-action-clear"
                                disabled={isSaving || isDeleting}
                            >
                                Clear All Timetables
                            </button>
                            <button
                                onClick={handleDeleteTimetable}
                                className="manual-action-btn manual-action-delete"
                                disabled={isSaving || isDeleting}
                            >
                                {isDeleting ? 'Deleting...' : 'Delete Timetable'}
                            </button>
                        </>
                    )}
                </div>
            </div>
            {classes.map(c => (
                <div key={c._id} className="manual-class-block">
                    <div className="manual-class-header">
                        <h2>Timetable for {c.name}</h2>
                        <button 
                            onClick={() => handleAutoFill(c._id)}
                            className="manual-autofill-btn"
                            disabled={isAutoFilling[c._id] || isDeleting || isSaving}
                        >
                            {isAutoFilling[c._id] ? 'Filling...' : 'Auto-Fill'}
                        </button>
                    </div>
                    <div className="table-responsive">
                    <table className="styled-table manual-table">
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
                                        const comboIdsInSlot = classTimetable[c._id]?.[dayIndex]?.[hourIndex];
                                        const options = validOptions[`${c._id}-${dayIndex}-${hourIndex}`];
                                        const hasLoadedOptions = options !== undefined;
                                        const slotSource = slotSources[c._id]?.[dayIndex]?.[hourIndex];
                                        const isLocked = !!lockedSlots[c._id]?.[dayIndex]?.[hourIndex];
                                        const cellKey = getCellKey(c._id, dayIndex, hourIndex);
                                        const isActive = activeCellKey === cellKey;
                                        const cellClassName = [
                                            'manual-slot',
                                            isLocked ? 'is-locked' : '',
                                            slotSource === 'manual' ? 'is-manual' : '',
                                            comboIdsInSlot && comboIdsInSlot.length > 0 ? 'has-value' : 'is-empty',
                                            isActive ? 'is-active' : '',
                                        ].filter(Boolean).join(' ');

                                        return (
                                            <td key={hourIndex} className="manual-slot-cell">
                                                <div className={cellClassName}>
                                                    <button
                                                        type="button"
                                                        className="manual-slot-summary-btn"
                                                        onClick={() => handleToggleCellEditor(c._id, dayIndex, hourIndex)}
                                                    >
                                                        <div className="manual-slot-topline">
                                                            <span className="manual-slot-hour">H{hour}</span>
                                                            {isLocked && <span className="manual-slot-badge">Locked</span>}
                                                        </div>
                                                        <div className="manual-slot-content">
                                                            {comboIdsInSlot?.map(comboId => {
                                                                const details = comboIdToDetails[comboId];
                                                                return (
                                                                    <div key={comboId} className="manual-slot-entry">
                                                                        <strong>{details?.subject || 'Loading...'}</strong>
                                                                        <span>{details?.faculty || ''}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {(!comboIdsInSlot || comboIdsInSlot.length === 0) && (
                                                                <div className="manual-slot-empty">Empty slot</div>
                                                            )}
                                                        </div>
                                                    </button>
                                                    {isActive && (
                                                        <div className="manual-slot-editor">
                                                            <div className="manual-slot-editor-actions">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleToggleLock(c._id, dayIndex, hourIndex)}
                                                                    className={`manual-slot-icon-btn ${isLocked ? 'is-locked' : ''}`}
                                                                >
                                                                    {isLocked ? 'Unlock' : 'Lock'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearSlot(c._id, dayIndex, hourIndex)}
                                                                    disabled={isLocked || !comboIdsInSlot || comboIdsInSlot.length === 0}
                                                                    className="manual-slot-icon-btn is-danger"
                                                                >
                                                                    Clear
                                                                </button>
                                                            </div>
                                                            <select
                                                                onChange={(e) => {
                                                                    if (e.target.value) {
                                                                        handlePlaceCombo(c._id, dayIndex, hourIndex, e.target.value);
                                                                        setActiveCellKey(null);
                                                                    }
                                                                }}
                                                                disabled={isLocked}
                                                                className="manual-slot-select"
                                                                defaultValue=""
                                                            >
                                                                <option value="">Select subject</option>
                                                                {hasLoadedOptions && options.length === 0 && (
                                                                    <option value="">No options available</option>
                                                                )}
                                                                {options?.map(option => (
                                                                    <option key={option.comboId} value={option.comboId}>
                                                                        {option.subject} - {option.faculty}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                    <div className="manual-summary">
                        <h3>Subject Allocation Summary</h3>
                        <div className="table-responsive">
                        <table className="styled-table manual-summary-table">
                            <thead>
                                <tr>
                                    <th>Subject</th>
                                    <th>Assigned Hours</th>
                                    <th>Required Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                {getClassSummaryRows(c).length > 0 ? (
                                    getClassSummaryRows(c).map(({ subjectId, name, assignedHours, requiredHours }) => (
                                        <tr key={subjectId}>
                                            <td>{name}</td>
                                            <td>{assignedHours}</td>
                                            <td>{requiredHours ?? '—'}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="manual-summary-empty">
                                            No subject requirement data is available for this class yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ManualTimetable;
