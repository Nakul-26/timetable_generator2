import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import DataContext from "../../context/DataContext";
import useBulkSelection from "../../hooks/useBulkSelection";
import useExcelImport from "../../hooks/useExcelImport";
import { downloadTemplate, exportRows, getCellValue } from "../../utils/excelIO";

const ManageTeacher = () => {
  const { faculties, classes, subjects, combos, loading, error, refetchData } = useContext(DataContext);
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const [editId, setEditId] = useState(null);
  const [mutationMessage, setMutationMessage] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Edit form states
  const [editName, setEditName] = useState("");
  const [editFacultyId, setEditFacultyId] = useState("");

  // 🔍 Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterFacultyId, setFilterFacultyId] = useState("");

  const navigate = useNavigate();

  const handleDownloadTemplate = () => {
    excelImport.clearExcelStatus();
    downloadTemplate(["name", "id"], ["", ""], "Teachers", "teachers_template.xlsx");
    excelImport.setExcelMessage("Template downloaded.");
  };

  const handleExportTeachers = () => {
    excelImport.clearExcelStatus();
    const rows = faculties.map((teacher) => {
      const assignedClassNames = classes
        .filter((cls) => cls.faculties?.some((f) => f._id === teacher._id))
        .map((cls) => cls.name)
        .join(", ");
      const assignedSubjectNames = combos
        .filter((combo) => (combo.teacherIds || []).includes(String(teacher._id)))
        .map((combo) => combo.subjectName || subjectById.get(String(combo.subjectId))?.name)
        .filter(Boolean)
        .join(", ");

      return {
        name: teacher.name || "",
        id: teacher.id || "",
        assignedClasses: assignedClassNames,
        assignedSubjects: assignedSubjectNames
      };
    });

    exportRows(rows, "Teachers", "teachers_export.xlsx");
    excelImport.setExcelMessage("Teachers exported.");
  };

  const existingById = new Map(
    faculties.filter((f) => f?.id).map((f) => [String(f.id).toLowerCase(), f])
  );

  const excelImport = useExcelImport({
    entityLabel: "teacher",
    requiredColumnsHint: "name and id",
    normalizeRow: (row) => ({
      name: getCellValue(row, ["name", "Name", "teacherName", "Teacher Name"]),
      id: getCellValue(row, ["id", "ID", "facultyId", "Faculty ID", "teacherId", "Teacher ID"])
    }),
    isValidRow: (row) => Boolean(row.name && row.id),
    upsertRow: async (row) => {
      const existing = existingById.get(row.id.toLowerCase());
      if (existing) {
        await api.put(`/faculties/${existing._id}`, { name: row.name, id: row.id });
        return true;
      }
      await api.post("/faculties", { name: row.name, id: row.id });
      return false;
    },
    onDone: () => refetchData(["faculties"])
  });

  const handleAddTeacher = () => {
    navigate("/teacher/add");
  };

  const handleEditAvailability = () => {
    navigate("/teacher-availability");
  };

  const handleEditPreferences = () => {
    navigate("/teacher-preferences");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this teacher?")) return;
    setMutationMessage("Deleting teacher. Please wait...");
    try {
      await api.delete(`/faculties/${id}`);
      selection.remove(id);
      refetchData(['faculties']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
    }
  };

  const handleBulkDelete = async () => {
    if (selection.selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selection.selectedIds.length} selected teacher(s)?`)) return;
    setBulkDeleting(true);
    setMutationMessage("Deleting selected teachers. Please wait...");
    try {
      await Promise.allSettled(selection.selectedIds.map((id) => api.delete(`/faculties/${id}`)));
      selection.clear();
      refetchData(['faculties']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
      setBulkDeleting(false);
    }
  };

  const handleEdit = (teacher) => {
    setEditId(teacher._id);
    setEditName(teacher.name);
    setEditFacultyId(teacher.id);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setMutationMessage("Saving teacher changes. Please wait...");
    try {
      const updatedTeacher = { name: editName, id: editFacultyId };
      await api.put(`/faculties/${editId}`, updatedTeacher);

      setEditId(null);
      setEditName("");
      setEditFacultyId("");
      refetchData(['faculties']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
    }
  };

  // 🔎 Apply filters
  const filteredTeachers = faculties.filter((t) => {
    return (
      (!filterName || (t.name && t.name.toLowerCase().includes(filterName.toLowerCase()))) &&
      (!filterFacultyId ||
        (t.id && t.id.toLowerCase().includes(filterFacultyId.toLowerCase())))
    );
  });
  const filteredTeacherIds = filteredTeachers.map((teacher) => teacher._id);
  const selection = useBulkSelection(filteredTeacherIds);

  const resetFilters = () => {
    setFilterName("");
    setFilterFacultyId("");
  };

  return (
    <div className="manage-container">
      <h2>Manage Teachers</h2>
      <div className="actions-bar">
        <button onClick={handleAddTeacher}>Add Teacher</button>
        <button onClick={handleEditAvailability} className="secondary-btn">Edit Availability</button>
        <button onClick={handleEditPreferences} className="secondary-btn">Edit Preferences</button>
        <button onClick={handleDownloadTemplate} className="secondary-btn">Download Excel Template</button>
        <button onClick={excelImport.triggerExcelUpload} className="secondary-btn" disabled={excelImport.uploadingExcel}>
          {excelImport.uploadingExcel ? "Uploading..." : "Upload Filled Excel"}
        </button>
        <button onClick={handleExportTeachers} className="secondary-btn">Export Teachers Excel</button>
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

      {excelImport.uploadingExcel ? <div className="success-message">Uploading teachers from Excel. Please wait...</div> : null}
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
            placeholder="Search by Faculty ID"
            value={filterFacultyId}
            onChange={(e) => setFilterFacultyId(e.target.value)}
          />
          <button onClick={resetFilters} className="secondary-btn">
            Reset
          </button>
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
              <th>Faculty ID</th>
              <th>Assigned Classes</th>
              <th>Assigned Subjects</th>
              <th>Blocked Slots</th>
              <th>Preferences</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredTeachers) &&
              filteredTeachers.map((teacher) => (
                <tr key={teacher._id} className={selection.isSelected(teacher._id) ? "row-selected" : ""}>
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(teacher._id)}
                      onChange={(e) => selection.toggle(teacher._id, e.target.checked)}
                    />
                  </td>
                  <td>
                    {editId === teacher._id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      teacher.name
                    )}
                  </td>
                  <td>
                    {editId === teacher._id ? (
                      <input
                        type="text"
                        value={editFacultyId}
                        onChange={(e) => setEditFacultyId(e.target.value)}
                      />
                    ) : (
                      teacher.id
                    )}
                  </td>
                  <td>
                    {classes
                        .filter(cls => cls.faculties?.some(f => f._id === teacher._id))
                        .map(cls => (
                            <div key={cls._id}><strong>{cls.name}</strong></div>
                        ))}
                  </td>
                  <td>
                    {combos
                        .filter(c => (c.teacherIds || []).includes(String(teacher._id)))
                        .map(c => (
                            <div key={c.id || c._id}>{c.subjectName || subjectById.get(String(c.subjectId))?.name}</div>
                        ))}
                  </td>
                  <td>{Array.isArray(teacher.unavailableSlots) ? teacher.unavailableSlots.length : 0}</td>
                  <td>
                    {teacher.preferences?.avoidFirstPeriod || teacher.preferences?.avoidLastPeriod || teacher.preferences?.maxConsecutive || (teacher.preferences?.preferredDays || []).length > 0
                      ? "Configured"
                      : "Default"}
                  </td>
                  <td className="actions-cell">
                    {editId === teacher._id ? (
                      <div className="actions-buttons">
                        <button
                          onClick={handleEditSubmit}
                          className="primary-btn"
                          disabled={Boolean(mutationMessage)}
                        >
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
                          onClick={() => handleEdit(teacher)}
                          className="primary-btn"
                          disabled={Boolean(mutationMessage)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(teacher._id)}
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
};

export default ManageTeacher;
