import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "../styles/Navbar.css";
import { useAuth } from "../context/AuthContext";

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="navbar-logo">TimeTable Generator</div>
      <div className="navbar-links">
        <NavLink to="/" className="nav-item">Home</NavLink>
        <NavLink to="/faculties" className="nav-item">Faculties</NavLink>
        <NavLink to="/subjects" className="nav-item">Subjects</NavLink>
        <NavLink to="/classes" className="nav-item">Classes</NavLink>
        <NavLink to="/class-subjects" className="nav-item">Class-Subjects</NavLink>
        <NavLink to="/class-faculties" className="nav-item">Class-Faculties</NavLink>
        <NavLink to="/teacher-subject-combos" className="nav-item">Teacher-Subject Combos</NavLink>
        <NavLink to="/timetable" className="nav-item">Timetable</NavLink>
        {user && (
          <button onClick={handleLogout} className="nav-item-logout">
            Logout
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
