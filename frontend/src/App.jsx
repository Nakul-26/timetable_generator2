import React from 'react';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import FacultyManager from '../src/pages/teacher/ManageTeacher';
import SubjectManager from './pages/subject/ManageSubject';
import ClassManager from './pages/Class/ManageClass';
import Timetable from './pages/Timetable';
import AddTeacher from './pages/teacher/AddTeacher';
import AddSubject from './pages/subject/AddSubject';
import AddClass from './pages/Class/AddClass';
import AddCombo from './pages/combo/AddCombo';
import ManageCombo from './pages/combo/ManageCombo';
import Navbar from './components/Navbar2';
import './App.css';

// Styled homepage
const HomePage = () => (
  <div className="home-container">
    <h1>Welcome to the Timetable Generator Application!</h1>
    <p>
      Use the navigation bar to manage faculties, subjects, classes,
      combos, and generate beautiful timetables.
    </p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Navbar />
        <main className="main-content">
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
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
