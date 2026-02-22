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
    const [subjects, setSubjects] = useState([]);
    const [faculties, setFaculties] = useState([]);
    const [classSubjects, setClassSubjects] = useState([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedFaculty, setSelectedFaculty] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');

    const [classMap, setClassMap] = useState({});
    const [comboMap, setComboMap] = useState({});
    const [subjectMap, setSubjectMap] = useState({});
    const [facultyMap, setFacultyMap] = useState({});
    const [classSubjectMap, setClassSubjectMap] = useState({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                setIsLoading(true);
                const [ttRes, classesRes, combosRes, subjectsRes, facultiesRes, classSubjectsRes] = await Promise.all([
                    api.get(`/timetable/${id}`),
                    api.get('/classes'),
                    api.get('/teacher-subject-combos'),
                    api.get('/subjects'),
                    api.get('/faculties'),
                    api.get('/class-subjects')
                ]);

                setTimetable(ttRes.data);
                setClasses(classesRes.data);
                setCombos(combosRes.data);
                setSubjects(subjectsRes.data);
                setFaculties(facultiesRes.data);
                setClassSubjects(classSubjectsRes.data);
                
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
        if (classes.length) {
            const newClassMap = classes.reduce((acc, c) => ({ ...acc, [String(c._id)]: c.name }), {});
            setClassMap(newClassMap);
        }
    }, [classes]);

    useEffect(() => {
        if (subjects.length) {
            const next = subjects.reduce((acc, s) => {
                acc[String(s._id)] = s.name;
                return acc;
            }, {});
            setSubjectMap(next);
        } else {
            setSubjectMap({});
        }
    }, [subjects]);

    useEffect(() => {
        if (classSubjects.length) {
            const next = classSubjects.reduce((acc, item) => {
                const classId = String(item?.class?._id || item?.class || '');
                const subjectId = String(item?.subject?._id || item?.subject || '');
                const subjectName = item?.subject?.name || '';
                if (classId && subjectId && subjectName) {
                    acc[`${classId}|${subjectId}`] = subjectName;
                }
                return acc;
            }, {});
            setClassSubjectMap(next);
        } else {
            setClassSubjectMap({});
        }
    }, [classSubjects]);

    useEffect(() => {
        if (faculties.length) {
            const next = faculties.reduce((acc, f) => {
                acc[String(f._id)] = f.name;
                return acc;
            }, {});
            setFacultyMap(next);
        } else {
            setFacultyMap({});
        }
    }, [faculties]);

    useEffect(() => {
        if (combos.length) {
            const newComboMap = combos.reduce((acc, combo) => {
                const subjectId = combo?.subject?._id || combo?.subject || combo?.subject_id;
                const subjectName =
                    combo?.subject?.name ||
                    combo?.subject_name ||
                    subjectMap[String(subjectId)] ||
                    'N/A';

                let facultyName = 'N/A';
                if (combo?.faculty?.name) {
                    facultyName = combo.faculty.name;
                } else if (combo?.faculty) {
                    facultyName = facultyMap[String(combo.faculty)] || 'N/A';
                } else if (Array.isArray(combo?.faculty_ids) && combo.faculty_ids.length > 0) {
                    facultyName = combo.faculty_ids
                        .map((fid) => facultyMap[String(fid)] || `Faculty ${String(fid).slice(-4)}`)
                        .join(', ');
                } else if (combo?.faculty_id) {
                    facultyName = facultyMap[String(combo.faculty_id)] || `Faculty ${String(combo.faculty_id).slice(-4)}`;
                }

                acc[String(combo._id)] = {
                    subject: subjectName,
                    faculty: facultyName,
                    subjectId: subjectId ? String(subjectId) : '',
                    facultyIds: Array.isArray(combo?.faculty_ids)
                        ? combo.faculty_ids.map((fid) => String(fid))
                        : combo?.faculty_id
                            ? [String(combo.faculty_id)]
                            : combo?.faculty
                                ? [String(combo.faculty?._id || combo.faculty)]
                                : []
                };
                return acc;
            }, {});
            setComboMap(newComboMap);
        } else {
            setComboMap({});
        }
    }, [combos, subjectMap, facultyMap]);

    const resolveVirtualElectiveName = (subjectId) => {
        const value = String(subjectId || '');
        if (!value.startsWith('VIRTUAL_ELECTIVE_')) return null;
        const ids = value.split('_').slice(3).filter(Boolean);
        if (!ids.length) return 'Elective';

        const names = ids.map((id) => subjectMap[String(id)]).filter(Boolean);
        if (!names.length) return 'Elective';
        return `Elective (${names.join(' + ')})`;
    };

    const getCellData = (classId, dayIndex, hourIndex) => {
        const rawSlot = timetable.class_timetables[classId]?.[dayIndex]?.[hourIndex];
        const comboId = Array.isArray(rawSlot) ? rawSlot[0] : rawSlot;
        if (!comboId || comboId === -1 || comboId === "BREAK") return null;

        if (comboMap[String(comboId)]) {
            return comboMap[String(comboId)];
        }

        const embeddedCombo = Array.isArray(timetable?.combos)
            ? timetable.combos.find((c) => String(c._id) === String(comboId))
            : null;

        if (!embeddedCombo) return null;

        const subjectId = String(embeddedCombo?.subject_id || embeddedCombo?.subject || '');

        const subjectName =
            embeddedCombo?.subject?.name ||
            embeddedCombo?.subject_name ||
            embeddedCombo?.subjectName ||
            classSubjectMap[`${String(classId)}|${subjectId}`] ||
            resolveVirtualElectiveName(subjectId) ||
            subjectMap[subjectId] ||
            (embeddedCombo?.subject_id ? `Subject ${String(embeddedCombo.subject_id).slice(-4)}` : 'N/A');

        let facultyName = 'N/A';
        let facultyIds = [];
        if (embeddedCombo?.faculty?.name) {
            facultyName = embeddedCombo.faculty.name;
            facultyIds = [String(embeddedCombo.faculty?._id || embeddedCombo.faculty)];
        } else if (embeddedCombo?.faculty) {
            facultyName = facultyMap[String(embeddedCombo.faculty)] || 'N/A';
            facultyIds = [String(embeddedCombo.faculty)];
        } else if (Array.isArray(embeddedCombo?.faculty_ids) && embeddedCombo.faculty_ids.length > 0) {
            facultyName = embeddedCombo.faculty_ids
                .map((fid) => facultyMap[String(fid)] || `Faculty ${String(fid).slice(-4)}`)
                .join(', ');
            facultyIds = embeddedCombo.faculty_ids.map((fid) => String(fid));
        } else if (embeddedCombo?.faculty_id) {
            facultyName = facultyMap[String(embeddedCombo.faculty_id)] || `Faculty ${String(embeddedCombo.faculty_id).slice(-4)}`;
            facultyIds = [String(embeddedCombo.faculty_id)];
        }

        return {
            subject: subjectName,
            faculty: facultyName,
            subjectId,
            facultyIds
        };
    };

    const isCellMatching = (cellData) => {
        const hasFilter = selectedFaculty || selectedSubject;
        if (!hasFilter) return true;
        if (!cellData) return false;

        const subjectMatch = !selectedSubject || String(cellData.subjectId) === String(selectedSubject);
        const facultyMatch = !selectedFaculty || (cellData.facultyIds || []).includes(String(selectedFaculty));
        return subjectMatch && facultyMatch;
    };

    const resetFilters = () => {
        setSelectedClass('');
        setSelectedFaculty('');
        setSelectedSubject('');
    };

    const escapeHtml = (value) =>
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

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
    const filteredClassIds = selectedClass
        ? classIds.filter((classId) => String(classId) === String(selectedClass))
        : classIds;

    const buildPdfHtml = (filtered) => {
        const sourceClassIds = filtered ? filteredClassIds : classIds;
        const filtersText = [
            selectedClass ? `Class: ${classMap[String(selectedClass)] || selectedClass}` : null,
            selectedFaculty ? `Faculty: ${facultyMap[String(selectedFaculty)] || selectedFaculty}` : null,
            selectedSubject ? `Subject: ${subjectMap[String(selectedSubject)] || selectedSubject}` : null,
        ].filter(Boolean).join(" | ");

        const classSections = sourceClassIds.map((classId) => {
            const rows = days.map((day, dayIndex) => {
                const cells = hours.map((_, hourIndex) => {
                    const cellData = getCellData(classId, dayIndex, hourIndex);
                    const matches = filtered ? isCellMatching(cellData) : true;

                    if (!cellData) {
                        return `<td class="${matches ? "" : "dim"}">--</td>`;
                    }

                    return `<td class="${matches ? "" : "dim"}"><div class="subject">${escapeHtml(cellData.subject)}</div><div class="faculty">${escapeHtml(cellData.faculty)}</div></td>`;
                }).join("");

                return `<tr><td class="day">${day}</td>${cells}</tr>`;
            }).join("");

            return `<div class="class-block"><h3>${escapeHtml(classMap[String(classId)] || "Unknown Class")}</h3><table><thead><tr><th>Day</th>${hours.map((h) => `<th>Hour ${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
        }).join("");

        return `<div class="pdf-root"><h1>${filtered ? "Filtered Timetable" : "Timetable"}</h1><div class="meta">Generated on: ${escapeHtml(new Date().toLocaleString())}</div>${filtered && filtersText ? `<div class="meta">Filters: ${escapeHtml(filtersText)}</div>` : ""}${classSections}</div>`;
    };

    const downloadPdfFromHtml = (html, title) => {
        const popup = window.open("", "_blank", "noopener,noreferrer");
        if (!popup) {
            alert("Unable to open download window. Please allow popups for this site.");
            return;
        }

        popup.document.open();
        popup.document.write(`
          <!doctype html>
          <html>
            <head>
              <meta charset="UTF-8" />
              <title>${escapeHtml(title)}</title>
              <style>
                @page { size: A4 portrait; margin: 10mm; }
                body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #111; }
                .pdf-root h1 { margin: 0 0 10px 0; }
                .pdf-root .meta { margin: 0 0 8px 0; font-size: 13px; color: #444; }
                .pdf-root .class-block { margin-top: 18px; page-break-inside: avoid; }
                .pdf-root .class-block h3 { margin: 0 0 8px 0; font-size: 16px; }
                .pdf-root table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                .pdf-root th, .pdf-root td { border: 1px solid #d0d0d0; padding: 6px; font-size: 10px; vertical-align: top; word-wrap: break-word; }
                .pdf-root th { background: #f2f2f2; }
                .pdf-root .day { font-weight: 700; width: 95px; }
                .pdf-root .subject { font-weight: 700; }
                .pdf-root .faculty { margin-top: 3px; color: #333; }
                .pdf-root .dim { opacity: 0.35; }
              </style>
            </head>
            <body>${html}</body>
          </html>
        `);
        popup.document.close();
        popup.focus();
        popup.print();
    };

    const handleDownloadFull = () => {
        if (!classIds.length) return;
        downloadPdfFromHtml(buildPdfHtml(false), "Timetable PDF");
    };

    const handleDownloadFiltered = () => {
        if (!filteredClassIds.length) return;
        downloadPdfFromHtml(buildPdfHtml(true), "Filtered Timetable PDF");
    };

    return (
        <div className="manage-container">
            <h2>{timetable.name}</h2>
            <p><strong>Saved At:</strong> {new Date(timetable.createdAt).toLocaleString()}</p>

            <div className="actions-bar">
                <button className="secondary-btn" onClick={handleDownloadFull}>
                    Download Full PDF
                </button>
                <button className="secondary-btn" onClick={handleDownloadFiltered}>
                    Download Filtered PDF
                </button>
            </div>

            <div className="filters-container">
                <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                    <option value="">All Classes</option>
                    {classIds.map((classId) => (
                        <option key={classId} value={classId}>
                            {classMap[String(classId)] || classId}
                        </option>
                    ))}
                </select>

                <select value={selectedFaculty} onChange={(e) => setSelectedFaculty(e.target.value)}>
                    <option value="">All Faculties</option>
                    {faculties.map((f) => (
                        <option key={f._id} value={f._id}>
                            {f.name}
                        </option>
                    ))}
                </select>

                <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
                    <option value="">All Subjects</option>
                    {subjects.map((s) => (
                        <option key={s._id} value={s._id}>
                            {s.name}
                        </option>
                    ))}
                </select>

                <button onClick={resetFilters} className="secondary-btn">
                    Reset
                </button>
            </div>

            {filteredClassIds.length === 0 && <p>No classes match the selected filters.</p>}

            {filteredClassIds.map(classId => (
                <div key={classId} style={{ marginBottom: '40px' }}>
                    <h3>{classMap[String(classId)] || 'Unknown Class'}</h3>
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
                                        const cellData = getCellData(classId, dayIndex, hourIndex);
                                        const matches = isCellMatching(cellData);
                                        return (
                                            <td key={hourIndex} style={{ opacity: matches ? 1 : 0.3 }}>
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
