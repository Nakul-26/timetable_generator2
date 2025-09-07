import React, { useState } from "react";
import axios from "../../api/axios";

const AddTeacher = () => {
  const [name, setName] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    console.log(`[handleChange] Field: ${name}, Value: ${value}`);
    if (name === "name") setName(value);
    if (name === "facultyId") setFacultyId(value);
  };

  const validate = () => {
    if (!name.trim()) return "Teacher name is required.";
    if (!facultyId.trim()) return "Faculty ID is required.";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("[handleSubmit] Form submitted with:", { name, facultyId });

    setError("");
    setSuccess("");
    const validationError = validate();
    if (validationError) {
      console.warn("[validate] Validation failed:", validationError);
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      console.log("[axios] Sending POST request to /faculties with:", {
        name,
        id: facultyId,
      });
      const res = await axios.post(`/faculties`, {
        name: name,
        id: facultyId,
      });
      console.log("[axios response]", res);

      setSuccess("Teacher added successfully!");
      setName("");
      setFacultyId("");
    } catch (err) {
      console.error("[axios error]", err);
      if (err.response) {
        console.error("[axios error response]", err.response);
      } else if (err.request) {
        console.error("[axios error request - no response]", err.request);
      } else {
        console.error("[axios error message]", err.message);
      }
      setError("Failed to add teacher.");
    }
    setLoading(false);
  };

  return (
    <div className="form-container">
      <h2>Add Teacher</h2>
      <form onSubmit={handleSubmit} className="styled-form">
        <div className="form-group">
          <label>Name</label>
          <input
            type="text"
            name="name"
            placeholder="Faculty Name"
            value={name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>Faculty ID</label>
          <input
            type="text"
            name="facultyId"
            placeholder="Faculty ID"
            value={facultyId}
            onChange={handleChange}
            required
          />
        </div>
        <button type="submit" disabled={loading} className="primary-btn">
          {loading ? "Adding..." : "Add Teacher"}
        </button>
      </form>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
    </div>
  );
};

export default AddTeacher;
