import React from "react";
import "../styles/Cards.css";

const SubjectCard = ({ subject }) => {
  return (
    <div className="card subject-card">
      <div className="card-header">
        <h3>{subject.name}</h3>
      </div>
      <div className="card-body">
        <p><strong>Code:</strong> {subject.code}</p>
      </div>
    </div>
  );
};

export default SubjectCard;
