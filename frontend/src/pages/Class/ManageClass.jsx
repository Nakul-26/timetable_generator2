import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import DataContext from "../../context/DataContext";
import useBulkSelection from "../../hooks/useBulkSelection";
import useExcelImport from "../../hooks/useExcelImport";
import { downloadTemplate, exportRows, getCellValue } from "../../utils/excelIO";

function ManageClass() {
  const { classes, assignments, loading, error, refetchData } = useContext(DataContext);
  const [editId, setEditId] = useState(null);
  const [mutationMessage, setMutationMessage] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // State variables for editing a class
  const [editName, setEditName] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editClassId, setEditClassId] = useState("");
  const [editDaysPerWeek, setEditDaysPerWeek] = useState(5);

  // 🔍 Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [filterClassId, setFilterClassId] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterSemester, setFilterSemester] = useState("");

  const navigate = useNavigate();

  const parseDaysPerWeek = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 5;
    const rounded = Math.round(parsed);
    return Math.max(1, Math.min(7, rounded));
  };

  const handleDownloadTemplate = () => {
    excelImport.clearExcelStatus();
    downloadTemplate(
      ["id", "name", "sem", "section", "days_per_week"],
      ["", "", "", "", "5"],
      "Classes",
      "classes_template.xlsx"
    );
    excelImport.setExcelMessage("Template downloaded.");
  };

  const handleExportClasses = () => {
    excelImport.clearExcelStatus();
    const rows = classes.map((classItem) => {
      const assignedSubjects = assignments
        .filter((a) => a.class?._id === classItem._id)
        .map((a) => a.subject?.name)
        .filter(Boolean)
        .join(", ");
      const assignedFaculties = (classItem.faculties || [])
        .map((f) => f?.name)
        .filter(Boolean)
        .join(", ");

      return {
        id: classItem.id || "",
        name: classItem.name || "",
        sem: classItem.sem || "",
        section: classItem.section || "",
        days_per_week: classItem.days_per_week || 5,
        assignedSubjects,
        assignedFaculties
      };
    });

    exportRows(rows, "Classes", "classes_export.xlsx");
    excelImport.setExcelMessage("Classes exported.");
  };

  const existingByClassId = new Map(
    classes.filter((c) => c?.id).map((c) => [String(c.id).toLowerCase(), c])
  );

  const excelImport = useExcelImport({
    entityLabel: "class",
    requiredColumnsHint: "id, name, sem, section",
    normalizeRow: (row) => ({
      id: getCellValue(row, ["id", "ID", "classId", "Class ID"]),
      name: getCellValue(row, ["name", "Name", "className", "Class Name"]),
      sem: getCellValue(row, ["sem", "Sem", "semester", "Semester", "class", "Class"]),
      section: getCellValue(row, ["section", "Section"]),
      days_per_week: parseDaysPerWeek(getCellValue(row, ["days_per_week", "daysPerWeek", "Days Per Week"]))
    }),
    isValidRow: (row) => Boolean(row.id && row.name && row.sem && row.section),
    upsertRow: async (row) => {
      const existing = existingByClassId.get(row.id.toLowerCase());
      if (existing) {
        await api.put(`/classes/${existing._id}`, row);
        return true;
      }
      await api.post("/classes", row);
      return false;
    },
    onDone: () => refetchData(["classes"])
  });

  const handleAddClass = () => {
    navigate("/class/add");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this class?")) return;
    setMutationMessage("Deleting class. Please wait...");
    try {
      await api.delete(`/classes/${id}`);
      selection.remove(id);
      refetchData(['classes']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
    }
  };

  const handleBulkDelete = async () => {
    if (selection.selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selection.selectedIds.length} selected class(es)?`)) return;
    setBulkDeleting(true);
    setMutationMessage("Deleting selected classes. Please wait...");
    try {
      await Promise.allSettled(selection.selectedIds.map((id) => api.delete(`/classes/${id}`)));
      selection.clear();
      refetchData(['classes']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
      setBulkDeleting(false);
    }
  };

  const handleEdit = (classItem) => {
    setEditId(classItem._id);
    setEditName(classItem.name);
    setEditSection(classItem.section);
    setEditSemester(classItem.sem);
    setEditClassId(classItem.id);
    setEditDaysPerWeek(classItem.days_per_week || 5);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setMutationMessage("Saving class changes. Please wait...");
    try {
      const updatedData = {
        name: editName,
        sem: editSemester,
        section: editSection,
        id: editClassId,
        days_per_week: editDaysPerWeek,
      };
      await api.put(`/classes/${editId}`, updatedData);
      setEditId(null);
      refetchData(['classes']);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      setMutationMessage("");
    }
  };

  // 🔎 Apply filters
  const filteredClasses = classes.filter((c) => {
    return (
      (!filterClassId || (c.id && c.id.toLowerCase().includes(filterClassId.toLowerCase()))) &&
      (!filterName || (c.name && c.name.toLowerCase().includes(filterName.toLowerCase()))) &&
      (!filterSection || (c.section && c.section.toLowerCase().includes(filterSection.toLowerCase()))) &&
      (!filterSemester || (c.sem && String(c.sem).toLowerCase().includes(filterSemester.toLowerCase())))
    );
  });
  const filteredClassIds = filteredClasses.map((classItem) => classItem._id);
  const selection = useBulkSelection(filteredClassIds);

  const resetFilters = () => {
    setFilterClassId("");
    setFilterName("");
    setFilterSection("");
    setFilterSemester("");
  };

  return (
    <div className="manage-container">
      <h2>Manage Classes</h2>
      <div className="actions-bar">
        <button onClick={handleAddClass}>Add new class</button>
        <button onClick={handleDownloadTemplate} className="secondary-btn">Download Excel Template</button>
        <button onClick={excelImport.triggerExcelUpload} className="secondary-btn" disabled={excelImport.uploadingExcel}>
          {excelImport.uploadingExcel ? "Uploading..." : "Upload Filled Excel"}
        </button>
        <button onClick={handleExportClasses} className="secondary-btn">Export Classes Excel</button>
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

      {excelImport.uploadingExcel ? <div className="success-message">Uploading classes from Excel. Please wait...</div> : null}
      {mutationMessage ? <div className="loading-message">{mutationMessage}</div> : null}
      {excelImport.excelMessage ? <div className="success-message">{excelImport.excelMessage}</div> : null}
      {excelImport.excelError ? <div className="error-message">{excelImport.excelError}</div> : null}

      {/* 🔽 Filters */}
      {showFilters && (
        <div className="filters-container">
          <input
            type="text"
            placeholder="Search by Class ID"
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Name"
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Section"
            value={filterSection}
            onChange={(e) => setFilterSection(e.target.value)}
          />
          <input
            type="text"
            placeholder="Search by Semester/Class"
            value={filterSemester}
            onChange={(e) => setFilterSemester(e.target.value)}
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
          <button
            type="button"
            className="danger-btn"
            onClick={handleBulkDelete}
            disabled={bulkDeleting || Boolean(mutationMessage)}
          >
            Delete selected
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={selection.clear}
            disabled={bulkDeleting || Boolean(mutationMessage)}
          >
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
              <th>Class ID</th>
              <th>Name</th>
              <th>Section</th>
              <th>Semester/Class</th>
              <th>Days/Week (Optional)</th>
              <th>Assigned Subjects</th>
              <th>Assigned Faculties</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(filteredClasses) &&
              filteredClasses.map((classItem) => (
                <tr key={classItem._id} className={selection.isSelected(classItem._id) ? "row-selected" : ""}>
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(classItem._id)}
                      onChange={(e) => selection.toggle(classItem._id, e.target.checked)}
                    />
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editClassId}
                        onChange={(e) => setEditClassId(e.target.value)}
                      />
                    ) : (
                      classItem.id
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    ) : (
                      classItem.name
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editSection}
                        onChange={(e) => setEditSection(e.target.value)}
                      />
                    ) : (
                      classItem.section
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="text"
                        value={editSemester}
                        onChange={(e) => setEditSemester(e.target.value)}
                      />
                    ) : (
                      classItem.sem
                    )}
                  </td>
                  <td>
                    {editId === classItem._id ? (
                      <input
                        type="number"
                        value={editDaysPerWeek}
                        onChange={(e) => setEditDaysPerWeek(e.target.value)}
                      />
                    ) : (
                      classItem.days_per_week || 5
                    )}
                  </td>
                  <td>
                    {assignments
                      .filter(a => a.class?._id === classItem._id)
                      .map(a => (
                        <div key={a._id}>{a.subject?.name}</div>
                      ))}
                  </td>
                  <td>
                      {(classItem.faculties || []).map(f => (
                          <div key={f._id}>{f.name}</div>
                      ))}
                  </td>
                  <td className="actions-cell">
                    {editId === classItem._id ? (
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
                          onClick={() => navigate(`/class-workspace/${classItem._id}`)}
                          className="secondary-btn"
                          disabled={Boolean(mutationMessage)}
                        >
                          🧩 Assignments
                        </button>
                        <button
                          onClick={() => handleEdit(classItem)}
                          className="primary-btn"
                          disabled={Boolean(mutationMessage)}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(classItem._id)}
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

export default ManageClass;
