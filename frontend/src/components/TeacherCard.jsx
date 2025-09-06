import React from "react";
import "../styles/Cards.css";

const TeacherCard = ({ teacher }) => {
  return (
    <div className="card teacher-card">
      <div className="card-header">
        <h3>{teacher.name}</h3>
      </div>
      <div className="card-body">
        <p><strong>Email:</strong> {teacher.email}</p>
      </div>
    </div>
  );
};

export default TeacherCard;
