import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import DataContext from "../../context/DataContext";
import useBulkSelection from "../../hooks/useBulkSelection";
import useExcelImport from "../../hooks/useExcelImport";
import { downloadTemplate, exportRows, getCellValue } from "../../utils/excelIO";

function ManageSubject() {
  const { subjects, classes, faculties, assignments, combos, loading, error, refetchData } = useContext(DataContext);
  const classById = new Map(classes.map((c) => [String(c._id), c]));
  const facultyById = new Map(faculties.map((f) => [String(f._id), f]));
  const [editId, setEditId] = useState(null);
  const [mutationMessage, setMutationMessage] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Edit states
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSem, setEditSem] = useState("");
  const [editType, setEditType] = useState("");
  const [editClassesPerWeek, setEditClassesPerWeek] = useState("");
  const [editIsElective, setEditIsElective] = useState(false);

  // 🔍 Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [filterSem, setFilterSem] = useState("");

  const navigate = useNavigate();

  const parseOptionalPositiveNumber = (value) => {
    if (value === "") return undefined;
    if (value === undefined || value === null) return undefined;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) && parsedValue >= 1 ? parsedValue : null;
  };

  const handleDownloadTemplate = () => {
    excelImport.clearExcelStatus();
    downloadTemplate(
      ["name", "id", "sem", "type", "classesPerWeek", "isElective"],
      ["", "", "", "theory", "", "false"],
      "Subjects",
      "subjects_template.xlsx"
    );
    excelImport.setExcelMessage("Template downloaded.");
  };

  const handleExportSubjects = () => {
    excelImport.clearExcelStatus();
    const rows = subjects.map((subject) => {
      const assignedClassNames = assignments
        .filter((a) => String(a.subject) === String(subject._id))
        .map((a) => classById.get(String(a.class))?.name)
        .filter(Boolean)
        .join(", ");
      const assignedFacultyNames = combos
        .filter((c) => String(c.subjectId) === String(subject._id))
        .flatMap((c) => c.teacherNames?.length ? c.teacherNames : (c.teacherIds || []).map((tid) => facultyById.get(String(tid))?.name))
        .filter(Boolean)
        .join(", ");

      return {
        name: subject.name || "",
        id: subject.id || "",
        sem: subject.sem || "",
        type: subject.type || "theory",
        classesPerWeek: subject.classesPerWeek ?? "",
        isElective: subject.isElective ?? false,
        assignedClasses: assignedClassNames,
        assignedFaculties: assignedFacultyNames
      };
    });

    exportRows(rows, "Subjects", "subjects_export.xlsx");
    excelImport.setExcelMessage("Subjects exported.");
  };

  const existingByCode = new Map(
    subjects.filter((s) => s?.id).map((s) => [String(s.id).toLowerCase(), s])
  );

  const excelImport = useExcelImport({
    entityLabel: "subject",
    requiredColumnsHint: "name, id, sem",
    normalizeRow: (row) => {
      const name = getCellValue(row, ["name", "Name", "subjectName", "Subject Name"]);
      const id = getCellValue(row, ["id", "ID", "code", "Code", "subjectCode", "Subject Code"]);
      const sem = getCellValue(row, ["sem", "Sem", "semester", "Semester", "class", "Class"]);
      const typeRaw = getCellValue(row, ["type", "Type"]) || "theory";
      const normalizedType = typeRaw.toLowerCase();
      const type = ["lab", "no_teacher"].includes(normalizedType) ? normalizedType : "theory";
      const classesPerWeekRaw = getCellValue(row, ["classesPerWeek", "classes_per_week", "Classes per Week", "hoursPerWeek", "weeklyClasses"]);
      const parsedClassesPerWeek = parseOptionalPositiveNumber(classesPerWeekRaw);

      const isElectiveRaw = getCellValue(row, ["isElective", "is_elective", "Is Elective", "elective"]);
      const isElective = String(isElectiveRaw).toLowerCase() === "true" || isElectiveRaw === true;

      if (parsedClassesPerWeek === null) {
        throw new Error(`Invalid classesPerWeek value for subject "${name || id}".`);
      }

      return { name, id, sem, type, classesPerWeek: parsedClassesPerWeek, isElective };
    },
    isValidRow: (row) => Boolean(row.name && row.id && row.sem),
    upsertRow: async (row) => {
      const existing = existingByCode.get(row.id.toLowerCase());
      const payload = {
        name: row.name,
        sem: row.sem,
        type: row.type,
        classesPerWeek: row.classesPerWeek,
        isElective: row.isElective,
      };
      if (existing) {
        await api.put(`/subjects/${existing._id}`, payload);
        return true;
      }
      await api.post("/subjects", { ...payload, id: row.id });
      return false;
    },
    onDone: () => refetchData(["subjects"])
  });

  const handleAddSubject = () => {
    navigate("/subject/add");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this subject?")) return;
    setMutationMessage("Deleting subject. Please wait...");
    try {
      await api.delete(`/subjects/${id}`);
      selection.remove(id);
      refetchData(['subjects']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
    }
  };

  const handleBulkDelete = async () => {
    if (selection.selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selection.selectedIds.length} selected subject(s)?`)) return;
    setBulkDeleting(true);
    setMutationMessage("Deleting selected subjects. Please wait...");
    try {
      await Promise.allSettled(selection.selectedIds.map((id) => api.delete(`/subjects/${id}`)));
      selection.clear();
      refetchData(['subjects']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
      setBulkDeleting(false);
    }
  };

  const handleEdit = (subject) => {
    setEditId(subject._id);
    setEditName(subject.name);
    setEditCode(subject.id);
    setEditSem(subject.sem);
    setEditType(subject.type);
    setEditClassesPerWeek(subject.classesPerWeek ?? "");
    setEditIsElective(subject.isElective ?? false);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const classesPerWeekValue =
      editClassesPerWeek === ""
        ? null
        : parseOptionalPositiveNumber(editClassesPerWeek);
    if (classesPerWeekValue === null && editClassesPerWeek !== "") {
      setMutationMessage("");
      excelImport.setExcelError("");
      excelImport.setExcelMessage("");
      alert("Classes per week must be a positive number.");
      return;
    }
    setMutationMessage("Saving subject changes. Please wait...");
    try {
      const updatedSubject = {
        name: editName,
        id: editCode,
        sem: editSem,
        type: editType,
        classesPerWeek: classesPerWeekValue,
        isElective: editIsElective,
      };
      await api.put(`/subjects/${editId}`, updatedSubject);
      setEditId(null);
      setEditName("");
      setEditCode("");
      setEditSem("");
      setEditType("theory");
      setEditClassesPerWeek("");
      setEditIsElective(false);
      refetchData();
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
    }
  };

  // 🔎 Filtered data
  const filteredSubjects = subjects.filter((s) => {
    return (
      (!filterName || (s.name && s.name.toLowerCase().includes(filterName.toLowerCase()))) &&
      (!filterCode || (s.id && s.id.toLowerCase().includes(filterCode.toLowerCase()))) &&
      (!filterSem || (s.sem && String(s.sem) === filterSem))
    );
  });
  const filteredSubjectIds = filteredSubjects.map((subject) => subject._id);
  const selection = useBulkSelection(filteredSubjectIds);

  return (
    <div className="manage-container">
      <h2>Manage Subjects</h2>
      <div className="actions-bar">
        <button onClick={handleAddSubject}>Add Subject</button>
        <button onClick={handleDownloadTemplate} className="secondary-btn">Download Excel Template</button>
        <button onClick={excelImport.triggerExcelUpload} className="secondary-btn" disabled={excelImport.uploadingExcel}>
          {excelImport.uploadingExcel ? "Uploading..." : "Upload Filled Excel"}
        </button>
        <button onClick={handleExportSubjects} className="secondary-btn">Export Subjects Excel</button>
        <button onClick={() => setShowFilters(!showFilters)}>
          {showFilters ? "Hide Search" : "Show Search"}
        </button>
      </div>
      <input
        ref={excelImport.fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={excelImport.handleExcelUpload}
      />

      {excelImport.uploadingExcel ? <div className="success-message">Uploading subjects from Excel. Please wait...</div> : null}
      {mutationMessage ? <div className="loading-message">{mutationMessage}</div> : null}
      {excelImport.excelMessage ? <div className="success-message">{excelImport.excelMessage}</div> : null}
      {excelImport.excelError ? <div className="error-message">{excelImport.excelError}</div> : null}

      {/* 🔽 Filters */}
      {showFilters && (
        <div className="filters-container">
          <input
            type="text"
            placeholder="Search by Name"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Code"
            value={filterCode}
            onChange={(e) => setFilterCode(e.target.value)}
          />
          <select
            value={filterSem}
            onChange={(e) => setFilterSem(e.target.value)}
          >
            <option value="">All Semester/Class</option>
            {[...new Set(subjects.map((s) => s.sem))].map((sem) => (
              <option key={sem} value={sem}>
                Semester/Class {sem}
              </option>
            ))}
          </select>
        </div>
      )}

      {selection.selectedIds.length > 0 ? (
        <div className="bulk-actions-bar">
          <label className="bulk-select-all">
            <input
              type="checkbox"
              checked={selection.allVisibleSelected}
              ref={(input) => {
                if (input) input.indeterminate = !selection.allVisibleSelected && selection.someVisibleSelected;
              }}
              onChange={(e) => selection.toggleAllVisible(e.target.checked)}
            />
            Select all visible
          </label>
          <span className="bulk-selection-count">{selection.selectedIds.length} selected</span>
          <button type="button" className="danger-btn" onClick={handleBulkDelete} disabled={bulkDeleting || Boolean(mutationMessage)}>
            Delete selected
          </button>
          <button type="button" className="secondary-btn" onClick={selection.clear} disabled={bulkDeleting || Boolean(mutationMessage)}>
            Clear selection
          </button>
        </div>
      ) : null}

      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="table-responsive">
          <table className="styled-table">
          <thead>
            <tr>
              <th className="selection-column">
                <input
                  type="checkbox"
                  checked={selection.allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = !selection.allVisibleSelected && selection.someVisibleSelected;
                  }}
                  onChange={(e) => selection.setAllVisible(e.target.checked)}
                />
              </th>
              <th>Name</th>
              <th>Code</th>
              <th>Semester/Class</th>
              <th>Subject Type</th>
              <th>Elective? (Optional)</th>
              <th>Classes/Week (Optional)</th>
              <th>Assigned Classes</th>
              <th>Assigned Faculties</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredSubjects) &&
              filteredSubjects.map((subject) => (
                <tr key={subject._id} className={selection.isSelected(subject._id) ? "row-selected" : ""}>
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(subject._id)}
                      onChange={(e) => selection.toggle(subject._id, e.target.checked)}
                    />
                  </td>
                  <td style={{ width: '10%' }}>
                    {editId === subject._id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      subject.name
                    )}
                  </td>
                  <td style={{ width: '10%' }}>
                    {editId === subject._id ? (
                      <input
                        type="text"
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                      />
                    ) : (
                      subject.id
                    )}
                  </td>
                  <td>
                    {editId === subject._id ? (
                      <input
                        type="text"
                        value={editSem}
                        onChange={(e) => setEditSem(e.target.value)}
                      />
                    ) : (
                      subject.sem
                    )}
                  </td>
                  <td>
                    {editId === subject._id ? (
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                        required
                      >
                        <option value="theory">Theory</option>
                        <option value="lab">Lab</option>
                        <option value="no_teacher">Not Single Teacher</option>
                      </select>
                    ) : (
                      subject.type
                    )}
                  </td>
                  <td>
                    {editId === subject._id ? (
                      <input
                        type="checkbox"
                        checked={editIsElective}
                        onChange={(e) => setEditIsElective(e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                    ) : (
                      subject.isElective ? "Yes" : "No"
                    )}
                  </td>
                  <td>
                    {editId === subject._id ? (
                      <input
                        type="number"
                        min="1"
                        value={editClassesPerWeek}
                        onChange={(e) => setEditClassesPerWeek(e.target.value)}
                        placeholder="Optional"
                      />
                    ) : (
                      subject.classesPerWeek ?? "—"
                    )}
                  </td>
                  <td>
                    {assignments
                      .filter(a => String(a.subject) === String(subject._id))
                      .map(a => (
                        <div key={`${a.class}-${a.subject}`}>{classById.get(String(a.class))?.name}</div>
                      ))}
                  </td>
                  <td>
                    {combos
                        .filter(c => String(c.subjectId) === String(subject._id))
                        .map(c => (
                            <div key={c.id || c._id}>
                              {c.teacherNames?.length
                                ? c.teacherNames.join(", ")
                                : (c.teacherIds || []).map((tid) => facultyById.get(String(tid))?.name).filter(Boolean).join(", ")}
                            </div>
                        ))}
                  </td>
                  <td className="actions-cell">
                    {editId === subject._id ? (
                      <div className="actions-buttons">
                        <button onClick={handleEditSubmit} className="primary-btn" disabled={Boolean(mutationMessage)}>
                          {mutationMessage ? "..." : "💾 Save"}
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="secondary-btn"
                          disabled={Boolean(mutationMessage)}
                        >
                          ❌ Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="actions-buttons">
                        <button
                          onClick={() => handleEdit(subject)}
                          className="primary-btn"
                          disabled={Boolean(mutationMessage)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(subject._id)}
                          className="danger-btn"
                          disabled={Boolean(mutationMessage) || bulkDeleting}
                        >
                          {mutationMessage ? "..." : "🗑️ Delete"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

export default ManageSubject;
