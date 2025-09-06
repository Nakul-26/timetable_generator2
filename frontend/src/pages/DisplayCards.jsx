import React, { useEffect, useState } from "react";
import api from "../api/axios";
import TeacherCard from "../components/TeacherCard";
import SubjectCard from "../components/SubjectCard";

function DisplayCards() {
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tRes = await api.get("/teachers");
        const sRes = await api.get("/subjects");
        setTeachers(tRes.data);
        setSubjects(sRes.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  return (
    <div>
      <h2>Teachers</h2>
      <div className="card-container">
        {teachers.map((t) => <TeacherCard key={t._id} name={t.name} />)}
      </div>
      <h2>Subjects</h2>
      <div className="card-container">
        {subjects.map((s) => <SubjectCard key={s._id} name={s.name} />)}
      </div>
    </div>
  );
}

export default DisplayCards;
