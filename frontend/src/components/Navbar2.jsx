import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "../styles/Navbar.css";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  if (loading || !user) {
    return null;
  }

  return (
    <nav className="navbar">
      <div className="navbar-logo">TimeTable Generator</div>
      <div className="navbar-links">
        <NavLink to="/" className="nav-item">Home</NavLink>
        <NavLink to="/faculties" className="nav-item">Faculties</NavLink>
        <NavLink to="/subjects" className="nav-item">Subjects</NavLink>
        <NavLink to="/classes" className="nav-item">Classes</NavLink>
        <NavLink to="/class-subjects" className="nav-item">Class Subjects</NavLink>
        <NavLink to="/class-faculties" className="nav-item">Class Faculties</NavLink>
        <NavLink to="/class-elective-subjects" className="nav-item">Elective Subjects</NavLink>
        <NavLink to="/teacher-subject-combos" className="nav-item">Teacher Subjects</NavLink>
        {/* <NavLink to="/process-inputs" className="nav-item">Process Inputs</NavLink> */}
        <NavLink to="/timetable" className="nav-item">Timetable</NavLink>
        {/* <NavLink to="/manual-timetable" className="nav-item">Manual Timetable</NavLink> */}
        <NavLink to="/saved-timetables" className="nav-item">Generated Timetables</NavLink>
        <button onClick={handleLogout} className="nav-item-logout">
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
