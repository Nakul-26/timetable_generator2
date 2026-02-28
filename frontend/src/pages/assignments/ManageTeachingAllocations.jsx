import React, { useContext, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import api from "../../api/axios";
import DataContext from "../../context/DataContext";

const ManageTeachingAllocations = () => {
  const { classes, subjects, faculties } = useContext(DataContext);

  const [selectedClasses, setSelectedClasses] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [selectedTeachers, setSelectedTeachers] = useState([]);
  const [hoursPerWeek, setHoursPerWeek] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const [calcSummary, setCalcSummary] = useState(null);

  const [filterClassId, setFilterClassId] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");

  const fetchAllocations = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/teaching-allocations");
      setAllocations(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError("Failed to fetch teaching allocations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllocations();
  }, []);

  const filteredAllocations = useMemo(() => {
    return allocations.filter((item) => {
      const classMatch = !filterClassId || String(item?.class?._id) === String(filterClassId);
      const subjectMatch = !filterSubjectId || String(item?.subject?._id) === String(filterSubjectId);
      const teacherMatch = !filterTeacherId || String(item?.teacher?._id) === String(filterTeacherId);
      return classMatch && subjectMatch && teacherMatch;
    });
  }, [allocations, filterClassId, filterSubjectId, filterTeacherId]);

  const classOptions = useMemo(
    () =>
      classes.map((c) => ({
        value: c._id,
        label: `${c.name} (Sem ${c.sem}, ${c.section})`,
      })),
    [classes]
  );

  const subjectOptions = useMemo(
    () =>
      subjects.map((s) => ({
        value: s._id,
        label: `${s.name} (${s.type || "theory"})`,
      })),
    [subjects]
  );

  const teacherOptions = useMemo(
    () =>
      faculties.map((f) => ({
        value: f._id,
        label: f.name,
      })),
    [faculties]
  );

  const handleAdd = async (e) => {
    e.preventDefault();
    if (
      selectedClasses.length === 0 ||
      selectedSubjects.length === 0 ||
      selectedTeachers.length === 0 ||
      Number(hoursPerWeek) < 1
    ) {
      setError("Please select at least one class, subject, teacher and valid hours/week.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const requests = [];
      for (const cls of selectedClasses) {
        for (const subject of selectedSubjects) {
          for (const teacher of selectedTeachers) {
            requests.push(
              api.post("/teaching-allocations", {
                classId: cls.value,
                subjectId: subject.value,
                teacherId: teacher.value,
                hoursPerWeek: Number(hoursPerWeek),
              })
            );
          }
        }
      }

      const results = await Promise.allSettled(requests);
      const failedCount = results.filter((r) => r.status === "rejected").length;
      if (failedCount > 0) {
        setError(`${failedCount} combo(s) failed to save. Others were saved.`);
      }

      setSelectedClasses([]);
      setSelectedSubjects([]);
      setSelectedTeachers([]);
      setHoursPerWeek("");
      await fetchAllocations();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to save teaching allocation.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm("Delete this class-subject-teacher allocation?")) return;
    try {
      await api.delete("/teaching-allocations", {
        data: {
          classId: item.class?._id,
          subjectId: item.subject?._id,
          teacherId: item.teacher?._id,
        },
      });
      await fetchAllocations();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to delete allocation.");
    }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError("");
    try {
      const res = await api.post("/teaching-allocations/calculate");
      setCalcSummary(res.data || null);
      await fetchAllocations();
    } catch (e) {
      setError(e?.response?.data?.error || "Failed to calculate combos.");
    } finally {
      setCalculating(false);
    }
  };

  return (
    <div className="manage-container">
      <h2>Manage Class - Subject - Teacher Combos</h2>
      <p>Direct entry for Class + Subject + Teacher + Hours. This updates normalized mappings behind the scenes.</p>
      <div className="actions-bar">
        <button className="secondary-btn" onClick={handleCalculate} disabled={calculating}>
          {calculating ? "Calculating..." : "Calculate Combos From Existing Mappings"}
        </button>
        <button
          className="secondary-btn"
          onClick={() => setShowFilters((prev) => !prev)}
          type="button"
        >
          {showFilters ? "Hide Filters" : "Show Filters"}
        </button>
      </div>

      {calcSummary ? (
        <div className="success-message" style={{ marginBottom: 12 }}>
          {calcSummary.message} Total generated combos: {calcSummary.totalGeneratedCombos}.
        </div>
      ) : null}

      <form onSubmit={handleAdd} className="add-form cst-combo-form">
        <h3>Add Class - Subject - Teacher Combo</h3>
        <div className="cst-combo-grid">
          <div className="form-group cst-field">
            <label>Select Classes</label>
            <Select
              options={classOptions}
              value={selectedClasses}
              onChange={(value) => setSelectedClasses(value || [])}
              placeholder="Select Classes"
              isMulti
            />
          </div>

          <div className="form-group cst-field">
            <label>Select Subjects</label>
            <Select
              options={subjectOptions}
              value={selectedSubjects}
              onChange={(value) => setSelectedSubjects(value || [])}
              placeholder="Select Subjects"
              isMulti
            />
          </div>

          <div className="form-group cst-field">
            <label>Select Teachers</label>
            <Select
              options={teacherOptions}
              value={selectedTeachers}
              onChange={(value) => setSelectedTeachers(value || [])}
              placeholder="Select Teachers"
              isMulti
            />
          </div>

          <div className="form-group cst-field cst-hours-field">
            <label>Hours per week</label>
            <input
              type="number"
              min="1"
              className="hours-input"
              placeholder="Hours per week"
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(e.target.value)}
              required
            />
          </div>

          <div className="cst-actions">
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? "Saving..." : "Add Combo"}
            </button>
          </div>
        </div>
      </form>

      {showFilters ? (
        <div className="add-form cst-filter-form">
          <h3>Filter Class - Subject - Teacher Combos</h3>
          <div className="cst-filter-grid">
            <div className="form-group cst-field">
              <label>Class</label>
              <select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}>
                <option value="">All Classes</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group cst-field">
              <label>Subject</label>
              <select value={filterSubjectId} onChange={(e) => setFilterSubjectId(e.target.value)}>
                <option value="">All Subjects</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group cst-field">
              <label>Teacher</label>
              <select value={filterTeacherId} onChange={(e) => setFilterTeacherId(e.target.value)}>
                <option value="">All Teachers</option>
                {faculties.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="cst-actions">
              <button
                type="button"
                className="reset-btn"
                onClick={() => {
                  setFilterClassId("");
                  setFilterSubjectId("");
                  setFilterTeacherId("");
                }}
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="error-message">{error}</div> : null}

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="styled-table">
          <thead>
            <tr>
              <th>Class</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Hours/Week</th>
              <th>Type</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAllocations.map((item) => (
              <tr key={item.id}>
                <td>{item?.class?.name}</td>
                <td>{item?.subject?.name}</td>
                <td>{item?.teacher?.name}</td>
                <td>{item?.hoursPerWeek ?? 0}</td>
                <td>{item?.isLab ? "Lab" : "Theory"}</td>
                <td>{item?.status || "active"}</td>
                <td>
                  <button className="danger-btn" onClick={() => handleDelete(item)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filteredAllocations.length === 0 ? (
              <tr>
                <td colSpan="7">No allocations found.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ManageTeachingAllocations;
