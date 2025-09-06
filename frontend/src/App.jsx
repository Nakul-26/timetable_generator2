import React from 'react';
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import FacultyManager from '../src/pages/teacher/ManageTeacher';
import SubjectManager from './pages/subject/ManageSubject';
import ClassManager from './pages/Class/ManageClass';
import Timetable from './pages/Timetable';
import AddTeacher from './pages/teacher/AddTeacher';
import AddSubject from './pages/subject/AddSubject';
import AddClass from './pages/Class/AddClass';
import Home from './pages/Home';
import AddCombo from './pages/combo/AddCombo';
import ManageCombo from './pages/combo/ManageCombo';
import { useNavigate } from 'react-router-dom';
import './App.css';


// This is the correct Home component
const HomePage = () => (
  <div className="home-container">
    <h1>Welcome to the Timetable App!</h1>
    <p>Use the navigation bar to manage faculties, subjects, classes, and view the timetable.</p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      {/* The main app container wraps everything */}
      <div className="app-container">
        <nav className="navbar">
          <Link to="/" className="navbar-link">Home</Link>
          <Link to="/faculties" className="navbar-link">Faculties</Link>
          <Link to="/subjects" className="navbar-link">Subjects</Link>
          <Link to="/classes" className="navbar-link">Classes</Link>
          <Link to="/timetable" className="navbar-link">Timetable</Link>
          <Link to="/combos" className="navbar-link">Combos</Link>
        </nav>
        
        {/* Routes are now inside the main app container */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/faculties" element={<FacultyManager />} />
          <Route path="/subjects" element={<SubjectManager />} />
          <Route path="/classes" element={<ClassManager />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/teacher/add" element={<AddTeacher />} />
          <Route path="/subject/add" element={<AddSubject />} />
          <Route path="/class/add" element={<AddClass />} />
          <Route path="/combo/add" element={<AddCombo />} />
          <Route path="/combos" element={<ManageCombo />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;