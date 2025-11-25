import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import FacultyManager from '../src/pages/teacher/ManageTeacher';
import SubjectManager from './pages/subject/ManageSubject';
import ClassManager from './pages/Class/ManageClass';
import Timetable from './pages/Timetable';
import AddTeacher from './pages/teacher/AddTeacher';
import AddSubject from './pages/subject/AddSubject';
import AddClass from './pages/Class/AddClass';
import ManageClassSubject from './pages/assignments/ManageClassSubject';
import ManageClassFaculty from './pages/assignments/ManageClassFaculty';
import ManageTeacherSubject from './pages/combo/ManageTeacherSubject';
import Navbar from './components/Navbar2';
import Login from './pages/Login';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import './App.css';

// Styled homepage
const HomePage = () => (
  <div className="home-container">
    <h1>Welcome to the Timetable Generator!</h1>
    <p>Here’s a simple guide to get you started:</p>
    
    <div className="guide-section">
      <h2>Step 1: Manage Your Core Data</h2>
      <p>Before generating a timetable, make sure you have added all the necessary information:</p>
      <ul>
        <li><strong>Faculties:</strong> Go to the <a href="/faculties">Faculties</a> page to add and manage teachers.</li>
        <li><strong>Subjects:</strong> Use the <a href="/subjects">Subjects</a> page to define all the subjects offered.</li>
        <li><strong>Classes:</strong> Add and manage classes, including their semester and section, on the <a href="/classes">Classes</a> page.</li>
        <li><strong>Teacher-Subject Combos:</strong> Use the <a href="/teacher-subject-combos">Teacher-Subject-Combos</a> page to define all the Teacher-Subject-Combos offered.</li>
      </ul>
    </div>

    <div className="guide-section">
      <h2>Step 2: Assign Subjects and Teachers to Classes</h2>
      <p>Once your core data is set up, you can manage assignments globally or per-class:</p>
      <ul>
        <li><strong>Global View:</strong> Use the <a href="/class-subjects">Class-Subjects</a> and <a href="/class-faculties">Class-Faculties</a> pages to manage all assignments in one place.</li>
        <li><strong>Per-Class View:</strong> Go to the <a href="/classes">Classes</a> page and use the `Assignments` button for a specific class.</li>
      </ul>
    </div>

    <div className="guide-section">
      <h2>Step 3: Generate the Timetable</h2>
      <p>With everything in place, you’re ready to generate the timetable!</p>
      <ul>
        <li>Navigate to the <a href="/timetable">Timetable</a> page.</li>
        <li>Click the "Generate Timetable" button to see the magic happen.</li>
      </ul>
    </div>

    <div className="guide-section">
      <h2>Advanced Features</h2>
      <p>Take your timetable to the next level with these powerful features:</p>
      <ul>
        <li><strong>Fix Slots:</strong> Need a specific lecture at a specific time? On the <a href="/timetable">Timetable</a> page, you can lock a subject to a particular time slot before generating the timetable.</li>
        <li><strong>Regenerate:</strong> Not satisfied with the generated timetable? Use the "Regenerate" button to create a new version. (Note: This feature is experimental and may not always produce a better result).</li>
        <li><strong>Filters:</strong> Easily find the information you need by using the filters on the <a href="/faculties">Faculties</a>, <a href="/subjects">Subjects</a>, and <a href="/classes">Classes </a> pages.</li>
      </ul>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<PrivateRoute />}>
            <Route
              path="/*"
              element={
                <div className="app-container">
                  <Navbar />
                  <main className="main-content">
                    <Routes>
                      <Route path="/" element={ <HomePage /> } />
                      <Route path="/home" element={<HomePage />} />
                      <Route path="/faculties" element={<FacultyManager />} />
                      <Route path="/subjects" element={<SubjectManager />} />
                      <Route path="/classes" element={<ClassManager />} />
                      <Route path="/class-subjects" element={<ManageClassSubject />} />
                      <Route path="/class-faculties" element={<ManageClassFaculty />} />
                      <Route path="/timetable" element={<Timetable />} />
                      <Route path="/teacher/add" element={<AddTeacher />} />
                      <Route path="/subject/add" element={<AddSubject />} />
                      <Route path="/class/add" element={<AddClass />} />
                      <Route path="/teacher-subject-combos" element={<ManageTeacherSubject />} />
                    </Routes>
                  </main>
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
