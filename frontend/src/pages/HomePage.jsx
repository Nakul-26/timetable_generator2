import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  const sections = [
    {
      title: "Step 1: Setup Masters",
      description: "Define the building blocks of your college.",
      cards: [
        { title: "Faculties", description: "Manage teachers and staff", path: "/faculties", icon: "👥" },
        { title: "Subjects", description: "Define all courses offered", path: "/subjects", icon: "📚" },
        { title: "Classes", description: "Manage student groups", path: "/classes", icon: "🏫" },
      ]
    },
    {
      title: "Step 2: Assign & Map",
      description: "Pick a class, then configure everything it has in one place.",
      cards: [
        { title: "Class Workspace", description: "Subjects, teachers, combos, electives & class teacher", path: "/class-workspace", icon: "🧩" },
      ]
    },
    {
      title: "Step 3: Constraints",
      description: "Set rules for the generator to follow.",
      cards: [
        { title: "Availability", description: "Block teacher leave/busy times", path: "/teacher-availability", icon: "📅" },
        { title: "Preferences", description: "Teacher slot preferences", path: "/teacher-preferences", icon: "⭐" },
      ]
    },
    {
      title: "Step 4: Generate & Refine",
      description: "Run the solver and finalize results.",
      cards: [
        { title: "Generator", description: "Run health checks and solve", path: "/timetable", icon: "⚡" },
        { title: "Generations", description: "Manage past solver runs & progress", path: "/generations", icon: "⚙️" },
        { title: "Manual Editor", description: "Fine-tune slots with drag-and-drop", path: "/manual-timetable", icon: "🖱️" },
        { title: "History", description: "View and export saved results", path: "/saved-timetables", icon: "📂" },
      ]
    }
  ];

  return (
    <div className="home-dashboard">
      <header className="home-header">
        <h1>Timetable Dashboard</h1>
        <p>Manage your college schedule efficiently with automated generation and manual control.</p>
      </header>

      <div className="dashboard-grid">
        {sections.map((section, idx) => (
          <section key={idx} className="dashboard-section">
            <div className="section-info">
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
            <div className="cards-container">
              {section.cards.map((card, cidx) => (
                <div 
                  key={cidx} 
                  className="feature-card" 
                  onClick={() => navigate(card.path)}
                >
                  <div className="card-icon">{card.icon}</div>
                  <div className="card-content">
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="home-quick-guide">
        <h2>Quick Start Tips</h2>
        <div className="tips-grid">
          <div className="tip-item">
            <strong>Order Matters:</strong> Start with Masters, then Mappings, then Generation.
          </div>
          <div className="tip-item">
            <strong>Health Check:</strong> Always run the "Pre-Generation Audit" on the Generator page to catch data errors.
          </div>
          <div className="tip-item">
            <strong>Class Workspace:</strong> Select a class to add subjects, teachers, combos, electives and its class teacher in one place.
          </div>
          <div className="tip-item">
            <strong>Manual Adjust:</strong> If the generator is 95% there, use the Manual Editor to fix the last few slots.
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
