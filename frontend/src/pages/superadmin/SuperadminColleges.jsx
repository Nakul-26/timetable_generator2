import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios.jsx';
import useBulkSelection from '../../hooks/useBulkSelection';
import './SuperadminDashboard.css';

const SuperadminColleges = () => {
  const navigate = useNavigate();
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const collegeIds = useMemo(() => colleges.map((college) => college._id), [colleges]);
  const selection = useBulkSelection(collegeIds);

  useEffect(() => {
    fetchColleges();
  }, []);

  const fetchColleges = async () => {
    try {
      const res = await api.get('/superadmin/colleges');
      setColleges(res.data.colleges || []);
    } catch (err) {
      setError('Failed to load colleges');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCollege = async (collegeId) => {
    if (!window.confirm('Delete this college? This cannot be undone.')) return;
    try {
      setActionMessage("Deleting college. Please wait...");
      await api.delete(`/superadmin/colleges/${collegeId}`);
      selection.remove(collegeId);
      fetchColleges();
    } catch (err) {
      alert(err?.response?.data?.error || 'Delete failed');
    } finally {
      setActionMessage("");
    }
  };

  const handleBulkDelete = async () => {
    if (selection.selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selection.selectedIds.length} selected college(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      setActionMessage("Deleting selected colleges. Please wait...");
      await Promise.allSettled(selection.selectedIds.map((collegeId) => api.delete(`/superadmin/colleges/${collegeId}`)));
      selection.clear();
      fetchColleges();
    } catch (err) {
      alert(err?.response?.data?.error || 'Delete failed');
    } finally {
      setBulkDeleting(false);
      setActionMessage("");
    }
  };

  if (loading) return <div className="loading">Loading colleges...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="superadmin-dashboard">
      <div className="header">
        <h1>College Management</h1>
        <div className="toolbar">
          <span className="count-badge">{colleges.length} colleges</span>
          <button className="btn btn-edit" onClick={() => navigate('/superadmin/create-college')}>
            New college
          </button>
        </div>
      </div>
      {selection.selectedIds.length > 0 ? (
        <div className="bulk-actions-bar">
          <label className="bulk-select-all">
            <input
              type="checkbox"
              checked={selection.allVisibleSelected}
              ref={(input) => {
                if (input) input.indeterminate = !selection.allVisibleSelected && selection.someVisibleSelected;
              }}
              onChange={(e) => selection.setAllVisible(e.target.checked)}
            />
            Select all visible
          </label>
          <span className="bulk-selection-count">{selection.selectedIds.length} selected</span>
          <button className="btn btn-delete" onClick={handleBulkDelete} disabled={bulkDeleting || Boolean(actionMessage)}>
            Delete selected
          </button>
          <button className="btn btn-edit" onClick={selection.clear} disabled={bulkDeleting || Boolean(actionMessage)}>
            Clear selection
          </button>
        </div>
      ) : null}
      {actionMessage ? <div className="loading-message" style={{ marginBottom: 12 }}>{actionMessage}</div> : null}
      <div className="colleges-list">
        <h2>Colleges</h2>
        {colleges.length === 0 ? (
          <p>No colleges found.</p>
        ) : (
          <div className="colleges-grid">
            {colleges.map(college => (
              <div key={college._id} className={`college-card selectable-card ${selection.isSelected(college._id) ? "row-selected" : ""}`}>
                <label className="card-select-checkbox">
                  <input
                    type="checkbox"
                    checked={selection.isSelected(college._id)}
                    onChange={(e) => selection.toggle(college._id, e.target.checked)}
                  />
                  Select
                </label>
                <h3>{college.name}</h3>
                <p><strong>Code:</strong> {college.code}</p>
                <p><strong>College ID:</strong> {college.collegeId}</p>
                <p><strong>Created:</strong> {new Date(college.createdAt).toLocaleDateString()}</p>
                <div className="actions">
                  <button className="btn btn-edit" onClick={async () => {
                    const name = window.prompt('New name', college.name) || college.name;
                    const code = window.prompt('New code', college.code) || college.code;
                    const cid = window.prompt('New collegeId', college.collegeId) || college.collegeId;
                    try {
                      setActionMessage("Updating college. Please wait...");
                      await api.put(`/superadmin/colleges/${college._id}`, { name, code, collegeId: cid });
                      fetchColleges();
                    } catch (err) { alert(err?.response?.data?.error || 'Update failed'); }
                    finally { setActionMessage(""); }
                  }}>Edit</button>
                  <button className="btn btn-delete" onClick={() => handleDeleteCollege(college._id)} disabled={bulkDeleting || Boolean(actionMessage)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperadminColleges;
