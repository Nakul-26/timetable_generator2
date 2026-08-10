import React, { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Select from "react-select";
import api from "../../api/axios";
import DataContext from "../../context/DataContext";

const createElectiveRow = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  subject: null,
  teacher: null,
  teachers: [],
});

const resolveSelectedHours = (selectedSubjectItems, subjects) => {
  if (!selectedSubjectItems.length) return "";
  const values = selectedSubjectItems.map((item) => {
    const subject = subjects.find((s) => String(s._id) === String(item.value));
    const parsed = Number(subject?.classesPerWeek);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
  });
  if (values.some((value) => value === null)) return "";
  const uniqueValues = [...new Set(values)];
  return uniqueValues.length === 1 ? String(uniqueValues[0]) : "";
};

const modeLabel = (assignment) => {
  if (assignment.mode === "NO_TEACHER") return "No Teacher";
  if (assignment.mode === "LAB") return "Lab";
  if (assignment.mode === "ELECTIVE") return "Elective";
  return "Theory";
};

const ClassWorkspace = () => {
  const { classId: classIdParam } = useParams();
  const navigate = useNavigate();
  const { classes, loading: classesLoading } = useContext(DataContext);

  const [selectedClassOption, setSelectedClassOption] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [savingClassTeacher, setSavingClassTeacher] = useState(false);
  const [classTeacherOption, setClassTeacherOption] = useState(null);

  const [allocationMode, setAllocationMode] = useState("normal");
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [selectedLabSubject, setSelectedLabSubject] = useState(null);
  const [selectedLabTeachers, setSelectedLabTeachers] = useState([]);
  const [electiveRows, setElectiveRows] = useState([createElectiveRow()]);
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [extraClasses, setExtraClasses] = useState([]);
  const [combinedClassGroupId, setCombinedClassGroupId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const classOptions = useMemo(
    () =>
      classes.map((c) => ({
        value: c._id,
        label: `${c.name} (Sem ${c.sem}, ${c.section})`,
      })),
    [classes]
  );

  useEffect(() => {
    if (!classIdParam) {
      setSelectedClassOption(null);
      return;
    }
    const match = classOptions.find((option) => option.value === classIdParam);
    setSelectedClassOption(match || null);
  }, [classIdParam, classOptions]);

  const loadWorkspace = async (classId) => {
    setLoadingWorkspace(true);
    setError("");
    try {
      const res = await api.get(`/classes/${classId}/workspace`);
      setWorkspace(res.data || null);
      setClassTeacherOption(
        res.data?.classTeacher
          ? { value: res.data.classTeacher._id, label: res.data.classTeacher.name }
          : null
      );
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to load class workspace.");
      setWorkspace(null);
    } finally {
      setLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    if (classIdParam) {
      loadWorkspace(classIdParam);
    } else {
      setWorkspace(null);
    }
  }, [classIdParam]);

  const handleClassChange = (option) => {
    setMessage("");
    setError("");
    if (option) {
      navigate(`/class-workspace/${option.value}`);
    } else {
      navigate("/class-workspace");
    }
  };

  const availableSubjects = useMemo(() => workspace?.availableSubjects || [], [workspace]);
  const availableTeachers = useMemo(() => workspace?.availableTeachers || [], [workspace]);

  const subjectOptions = useMemo(
    () =>
      availableSubjects.map((s) => ({
        value: s._id,
        label: `${s.name} (${s.type || "theory"})`,
      })),
    [availableSubjects]
  );
  const teacherOptions = useMemo(
    () => availableTeachers.map((f) => ({ value: f._id, label: f.name })),
    [availableTeachers]
  );
  const otherClassOptions = useMemo(
    () => classOptions.filter((option) => option.value !== classIdParam),
    [classOptions, classIdParam]
  );

  const allSelectedSubjectsNoTeacher =
    selectedSubjects.length > 0 &&
    selectedSubjects.every((subjectOption) => {
      const subject = availableSubjects.find((s) => String(s._id) === String(subjectOption.value));
      return String(subject?.type || "").toLowerCase() === "no_teacher";
    });

  useEffect(() => {
    const subjectItems =
      allocationMode === "elective" || allocationMode === "elective_lab"
        ? electiveRows.map((row) => row.subject).filter(Boolean)
        : allocationMode === "lab"
          ? selectedLabSubject
            ? [selectedLabSubject]
            : []
          : selectedSubjects;
    setHoursPerWeek(resolveSelectedHours(subjectItems, availableSubjects));
  }, [allocationMode, electiveRows, selectedLabSubject, selectedSubjects, availableSubjects]);

  useEffect(() => {
    if (allocationMode === "normal") {
      setSelectedLabSubject(null);
      setSelectedLabTeachers([]);
      setElectiveRows([createElectiveRow()]);
    } else if (allocationMode === "lab") {
      setSelectedSubjects([]);
      setSelectedTeachers([]);
      setElectiveRows([createElectiveRow()]);
    } else {
      setSelectedSubjects([]);
      setSelectedTeachers([]);
      setSelectedLabSubject(null);
      setSelectedLabTeachers([]);
    }
  }, [allocationMode]);

  const resetForm = () => {
    setAllocationMode("normal");
    setSelectedSubjects([]);
    setSelectedTeachers([]);
    setSelectedLabSubject(null);
    setSelectedLabTeachers([]);
    setElectiveRows([createElectiveRow()]);
    setHoursPerWeek("");
    setExtraClasses([]);
    setCombinedClassGroupId("");
  };

  const handleSaveClassTeacher = async () => {
    if (!classIdParam) return;
    setSavingClassTeacher(true);
    setError("");
    setMessage("");
    try {
      await api.put(`/classes/${classIdParam}/class-teacher`, {
        facultyId: classTeacherOption?.value || null,
      });
      setMessage("Class teacher updated.");
      await loadWorkspace(classIdParam);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to update class teacher.");
    } finally {
      setSavingClassTeacher(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm("Remove this assignment from the class?")) return;
    setDeletingId(assignmentId);
    setError("");
    setMessage("");
    try {
      await api.delete("/teaching-allocations", { data: { allocationId: assignmentId } });
      await loadWorkspace(classIdParam);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to delete assignment.");
    } finally {
      setDeletingId("");
    }
  };

  const handleAddAssignment = async (e) => {
    e.preventDefault();
    if (!classIdParam) return;

    const classIds = [classIdParam, ...extraClasses.map((c) => c.value)];
    if (classIds.length > 1 && !combinedClassGroupId.trim()) {
      setError("Combination ID is required when combining with other classes.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const requests = [];

      if (allocationMode === "elective" || allocationMode === "elective_lab") {
        if (electiveRows.length < 2) {
          setError("Add at least two subject-teacher rows for an elective block.");
          setSubmitting(false);
          return;
        }
        if (allocationMode === "elective_lab") {
          const invalidSubject = electiveRows.some((row) => {
            const subject = availableSubjects.find((item) => String(item._id) === String(row.subject?.value));
            return !row.subject || String(subject?.type || "").toLowerCase() !== "lab";
          });
          if (invalidSubject) {
            setError("Each elective lab option must use a lab subject.");
            setSubmitting(false);
            return;
          }
          if (electiveRows.some((row) => !Array.isArray(row.teachers) || row.teachers.length === 0)) {
            setError("Each elective lab option must have at least one teacher.");
            setSubmitting(false);
            return;
          }
        } else if (electiveRows.some((row) => !row.subject || !row.teacher)) {
          setError("Each elective row must have both a subject and a teacher.");
          setSubmitting(false);
          return;
        }
        const subjectPayload = allocationMode === "elective_lab"
          ? electiveRows.map((row) => ({
              subjectId: row.subject.value,
              teacherIds: row.teachers.map((teacher) => teacher.value),
            }))
          : electiveRows.map((row) => ({
              subjectId: row.subject.value,
              teacherId: row.teacher.value,
            }));
        const teacherIds = subjectPayload.flatMap((row) => row.teacherIds || [row.teacherId]);
        requests.push(api.post("/teaching-allocations", {
          classIds,
          type: allocationMode === "elective_lab" ? "ELECTIVE_LAB" : "ELECTIVE",
          subjects: subjectPayload,
          subjectId: subjectPayload[0]?.subjectId,
          teacherIds,
          hoursPerWeek: hoursPerWeek === "" ? undefined : Number(hoursPerWeek),
          combinedClassGroupId: classIds.length > 1 ? combinedClassGroupId : null,
        }));
      } else if (allocationMode === "lab") {
        if (!selectedLabSubject) {
          setError("Please select a lab subject.");
          setSubmitting(false);
          return;
        }
        if (selectedLabTeachers.length === 0) {
          setError("Please select at least one teacher for the lab block.");
          setSubmitting(false);
          return;
        }
        requests.push(api.post("/teaching-allocations", {
          classIds,
          type: "LAB",
          subjectId: selectedLabSubject.value,
          teacherIds: selectedLabTeachers.map((teacher) => teacher.value),
          hoursPerWeek: hoursPerWeek === "" ? undefined : Number(hoursPerWeek),
          combinedClassGroupId: classIds.length > 1 ? combinedClassGroupId : null,
        }));
      } else {
        if (selectedSubjects.length === 0 || (!allSelectedSubjectsNoTeacher && selectedTeachers.length === 0)) {
          setError("Please select at least one subject. Teachers are optional only for no-teacher subjects.");
          setSubmitting(false);
          return;
        }
        for (const subject of selectedSubjects) {
          const subjectData = availableSubjects.find((s) => String(s._id) === String(subject.value));
          const isNoTeacher = String(subjectData?.type || "").toLowerCase() === "no_teacher";
          requests.push(
            api.post("/teaching-allocations", {
              classIds,
              subjectId: subject.value,
              teacherIds: isNoTeacher ? [] : selectedTeachers.map((teacher) => teacher.value),
              hoursPerWeek: hoursPerWeek === "" ? undefined : Number(hoursPerWeek),
              combinedClassGroupId: classIds.length > 1 ? combinedClassGroupId : null,
            })
          );
        }
      }

      const results = await Promise.allSettled(requests);
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        setError(failed[0].reason?.response?.data?.error || `${failed.length} assignment(s) failed to save.`);
      } else {
        setMessage("Assignment saved.");
      }
      resetForm();
      await loadWorkspace(classIdParam);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to save assignment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="manage-container">
      <h2>Class Workspace</h2>
      <p>Select a class to review and edit everything it has — subjects, teachers, combos, electives, and its class teacher — in one place.</p>

      <div className="form-group" style={{ maxWidth: 420, marginBottom: 20 }}>
        <label>Class</label>
        <Select
          options={classOptions}
          value={selectedClassOption}
          onChange={handleClassChange}
          placeholder="Select a class..."
          isLoading={classesLoading}
          isClearable
        />
      </div>

      {error ? <div className="error-message">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      {!classIdParam ? (
        <p>Pick a class above to see its configuration.</p>
      ) : loadingWorkspace ? (
        <div>Loading class workspace...</div>
      ) : !workspace ? null : (
        <>
          <div className="add-form" style={{ marginBottom: 20 }}>
            <h3>{workspace.class?.name} — Sem {workspace.class?.sem}, {workspace.class?.section}</h3>
            <div className="form-group cst-field" style={{ maxWidth: 420 }}>
              <label>Class Teacher</label>
              <Select
                options={teacherOptions}
                value={classTeacherOption}
                onChange={(value) => setClassTeacherOption(value || null)}
                placeholder="No class teacher assigned"
                isClearable
              />
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={handleSaveClassTeacher}
              disabled={savingClassTeacher}
              style={{ marginTop: 10 }}
            >
              {savingClassTeacher ? "Saving..." : "Save Class Teacher"}
            </button>
          </div>

          <h3>Current Assignments</h3>
          <table className="styled-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Teacher(s)</th>
                <th>Type</th>
                <th>Hours/Week</th>
                <th>Combined With</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(workspace.assignments || []).map((assignment) => (
                <tr key={assignment.id}>
                  <td>{assignment.subjectName}</td>
                  <td>{assignment.teacherNames?.length ? assignment.teacherNames.join(" & ") : "No Teacher"}</td>
                  <td>{modeLabel(assignment)}</td>
                  <td>{assignment.hoursPerWeek}</td>
                  <td>
                    {assignment.classIds?.length > 1
                      ? `${assignment.classIds.length} classes`
                      : "—"}
                  </td>
                  <td className="actions-cell">
                    <button
                      className="danger-btn"
                      onClick={() => handleDeleteAssignment(assignment.id)}
                      disabled={deletingId === assignment.id}
                    >
                      {deletingId === assignment.id ? "..." : "🗑️ Remove"}
                    </button>
                  </td>
                </tr>
              ))}
              {(workspace.assignments || []).length === 0 ? (
                <tr>
                  <td colSpan="6">No subjects or teachers assigned to this class yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <form onSubmit={handleAddAssignment} className="add-form cst-combo-form">
            <h3>Add Assignment</h3>
            <div className="cst-combo-grid">
              <div className="form-group cst-field">
                <label>Allocation Type</label>
                <select value={allocationMode} onChange={(e) => setAllocationMode(e.target.value)}>
                  <option value="normal">Theory (Standard Class)</option>
                  <option value="lab">Lab (Block Session)</option>
                  <option value="elective">Elective (Option Group)</option>
                  <option value="elective_lab">Elective Lab (Option Group)</option>
                </select>
              </div>

              {allocationMode === "elective" || allocationMode === "elective_lab" ? (
                <div className="form-group cst-field" style={{ gridColumn: "1 / -1" }}>
                  <label>{allocationMode === "elective_lab" ? "Elective Lab Options" : "Elective Options"}</label>
                  <div className="elective-option-list">
                    {electiveRows.map((row, index) => (
                      <div key={row.id} className="elective-option-row">
                        <div className="elective-option-index">Option {index + 1}</div>
                        <div className="elective-option-fields">
                          <div className="elective-option-field">
                            <label>Subject</label>
                            <Select
                              options={allocationMode === "elective_lab"
                                ? subjectOptions.filter((subject) => {
                                    const subjectData = availableSubjects.find((item) => String(item._id) === String(subject.value));
                                    return String(subjectData?.type || "").toLowerCase() === "lab";
                                  })
                                : subjectOptions}
                              value={row.subject}
                              onChange={(value) =>
                                setElectiveRows((prev) =>
                                  prev.map((item) => (item.id === row.id ? { ...item, subject: value || null } : item))
                                )
                              }
                              placeholder="Select subject"
                            />
                          </div>
                          <div className="elective-option-field">
                            <label>{allocationMode === "elective_lab" ? "Teachers" : "Teacher"}</label>
                            <Select
                              options={teacherOptions}
                              value={allocationMode === "elective_lab" ? row.teachers || [] : row.teacher}
                              onChange={(value) =>
                                setElectiveRows((prev) =>
                                  prev.map((item) => (
                                    item.id === row.id
                                      ? allocationMode === "elective_lab"
                                        ? { ...item, teachers: value || [] }
                                        : { ...item, teacher: value || null }
                                      : item
                                  ))
                                )
                              }
                              placeholder={allocationMode === "elective_lab" ? "Select one or more teachers" : "Select teacher"}
                              isMulti={allocationMode === "elective_lab"}
                            />
                          </div>
                        </div>
                        <div className="elective-option-actions">
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => setElectiveRows((prev) => prev.length > 1 ? prev.filter((item) => item.id !== row.id) : prev)}
                            disabled={electiveRows.length <= 1}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="elective-option-add-row">
                    <button type="button" className="secondary-btn" onClick={() => setElectiveRows((prev) => [...prev, createElectiveRow()])}>
                      + Add Option
                    </button>
                  </div>
                </div>
              ) : allocationMode === "lab" ? (
                <>
                  <div className="form-group cst-field">
                    <label>Select Lab Subject</label>
                    <Select
                      options={subjectOptions.filter((subject) => {
                        const subjectData = availableSubjects.find((item) => String(item._id) === String(subject.value));
                        return String(subjectData?.type || "").toLowerCase() === "lab";
                      })}
                      value={selectedLabSubject}
                      onChange={(value) => setSelectedLabSubject(value || null)}
                      placeholder="Select lab subject"
                    />
                  </div>
                  <div className="form-group cst-field">
                    <label>Select Lab Teachers</label>
                    <Select
                      options={teacherOptions}
                      value={selectedLabTeachers}
                      onChange={(value) => setSelectedLabTeachers(value || [])}
                      placeholder="Select one or more teachers"
                      isMulti
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group cst-field">
                    <label>Select Subjects</label>
                    <Select
                      options={subjectOptions}
                      value={selectedSubjects}
                      onChange={(value) => setSelectedSubjects(value || [])}
                      placeholder="Select subject(s)"
                      isMulti
                    />
                  </div>
                  <div className="form-group cst-field">
                    <label>Select Teacher</label>
                    <Select
                      options={teacherOptions}
                      value={selectedTeachers[0] || null}
                      onChange={(value) => setSelectedTeachers(value ? [value] : [])}
                      placeholder={allSelectedSubjectsNoTeacher ? "Not required" : "Select Teacher"}
                      isDisabled={allSelectedSubjectsNoTeacher}
                    />
                  </div>
                </>
              )}

              <div className="form-group cst-field cst-hours-field">
                <label>Hours per week</label>
                <input
                  type="number"
                  min="1"
                  className="hours-input"
                  placeholder="Hours per week"
                  value={hoursPerWeek}
                  onChange={(e) => setHoursPerWeek(e.target.value)}
                />
              </div>

              <div className="form-group cst-field">
                <label>Combine with other classes (optional)</label>
                <Select
                  options={otherClassOptions}
                  value={extraClasses}
                  onChange={(value) => setExtraClasses(value || [])}
                  placeholder="These classes attend together"
                  isMulti
                />
              </div>

              {extraClasses.length > 0 && (
                <div className="form-group cst-field">
                  <label>Combination ID</label>
                  <input
                    type="text"
                    className="hours-input"
                    placeholder="e.g. CSE-3AB-PHYS"
                    value={combinedClassGroupId}
                    onChange={(e) => setCombinedClassGroupId(e.target.value)}
                  />
                </div>
              )}

              <div className="cst-actions">
                <button type="submit" className="primary-btn" disabled={submitting}>
                  {submitting ? "Saving..." : "Add Assignment"}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export default ClassWorkspace;
