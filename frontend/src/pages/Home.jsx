import React from "react";
import axios from "axios";
import "../styles/Cards.css";

function Home() {
  return (
    <div>
      <div className="card" >
        <h1>Welcome to Timetable Generator</h1>
        <p>Use the sidebar to navigate and manage teachers, subjects, and semesters.</p>
        <button className="card" >Send Request</button>
      </div>
    </div>
  );
}

export default Home;