import React from "react";
import { NavLink } from "react-router-dom";
import "../styles/Sidebar.css";

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <ul className="sidebar-links"> 
        <li>
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span role="img" aria-label="home">
              🏠
            </span>{" "}
            Home
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/teacher/add"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span role="img" aria-label="add teacher">
              ➕
            </span>{" "}
            Add Teacher
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/teacher/manage"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span role="img" aria-label="teacher">
              👨‍🏫
            </span>{" "}
            Teachers
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/subject/add"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span role="img" aria-label="add subject">
              ➕
            </span>{" "}
            Add Subject
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/subject/manage"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span role="img" aria-label="subject">
              📚
            </span>{" "}
            Subjects
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/semester/add"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span role="img" aria-label="add semester">
              ➕
            </span>{" "}
            Add Semester
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/semester/manage"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span role="img" aria-label="semester">
              🗓️
            </span>{" "}
            Semesters
          </NavLink>
        </li>
      </ul>
    </aside>
  );
};

export default Sidebar;
