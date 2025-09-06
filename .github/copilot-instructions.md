# Copilot Instructions for ERP Timetable Project

## Overview
This project is a full-stack ERP timetable generator with a React/Vite frontend and a Node.js/Express/MongoDB backend. It automates timetable creation for classes, subjects, and faculties, enforcing constraints via a custom algorithm.

## Architecture
- **Frontend (`frontend/`)**: React (JSX), Vite, React Router, Axios for API calls. Main entry: `src/MainRouter.jsx`.
  - Pages: `FacultyManager`, `SubjectManager`, `ClassManager`, `Timetable`, etc.
  - API layer: `src/api/axios.jsx` wraps Axios for backend communication.
- **Backend (`backend/`)**: Express server (`server.js`), MongoDB via Mongoose, REST API in `models/routes/api.js`.
  - Models: `Faculty.js`, `Subject.js`, `Class.js`, `Combo.js`, `TmietableResult.js`.
  - Timetable generation logic: `models/lib/generator.js` (mirrors C algorithm in `back_tracking.c`).

## Data Flow
- Frontend calls backend REST endpoints (e.g., `/api/faculties`, `/api/subjects`, `/api/classes`, `/api/generate`, `/api/result/latest`).
- Backend persists data in MongoDB and generates timetables using the algorithm in `generator.js`.

## Developer Workflows
- **Backend**
  - Start: `npm run dev` (uses nodemon) or `npm start` in `backend/`
  - Environment: Set `MONGO_URI` in `.env` for DB connection
- **Frontend**
  - Start: `npm run dev` in `frontend/`
  - Build: `npm run build`
  - Lint: `npm run lint`

## Key Patterns & Conventions
- **API Design**: All backend routes are prefixed with `/api`. CRUD for faculties, subjects, classes; timetable generation via `/generate`.
- **State Management**: React hooks (`useState`, etc.) for local state. No global state library.
- **Error Handling**: API errors are surfaced in UI via error messages (see `ErrorMessage.jsx`).
- **Timetable Generation**: Algorithm enforces constraints (teacher gaps, subject hours, etc.) in `generator.js`. For reference, see also `back_tracking.c`.
- **Styling**: CSS modules in `src/styles/`.

## Integration Points
- **MongoDB**: Connection via Mongoose. DB name is `placementDB` (see `server.js`).
- **Environment Variables**: Use `.env` for secrets (e.g., `MONGO_URI`).
- **External Libraries**: React, Vite, Axios, Mongoose, Express, bcryptjs, jsonwebtoken.

## Examples
- To add a faculty: POST to `/api/faculties` with JSON body
- To generate timetable: POST to `/api/generate`, then GET `/api/result/latest`
- To debug backend: Check logs in `server.js` and ensure MongoDB is running

## References
- Backend API: `backend/models/routes/api.js`
- Timetable logic: `backend/models/lib/generator.js`, `back_tracking.c`
- Frontend routing: `frontend/src/MainRouter.jsx`
- API calls: `frontend/src/api/axios.jsx`

---
_If any section is unclear or missing, please provide feedback for further refinement._
