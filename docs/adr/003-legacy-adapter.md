# ADR 003: Legacy Database Adapter

## Status
Accepted

## Context
Refactoring a live production system requires avoiding massive, high-risk migrations that modify the entire database schema in a single commit. The timetable system has legacy tables (`TeacherSubjectCombination`, `ClassSubject`, `ElectiveSubjectSetting`) that are written to by existing parts of the application. 

Rewriting every CRUD controller and UI view simultaneously would block feature delivery and introduce regression bugs. However, allowing the new scheduling domain code to directly query these legacy collections would entrench the old, fragmented shapes.

## Decision
We introduce a **Legacy Database Adapter** (`backend/services/legacy/legacyAdapter.js`) as a dedicated Anti-Corruption Layer (ACL):
1. **Single Entry Point**: The `legacyAdapter.js` file is the only file in the backend codebase allowed to import or query `TeacherSubjectCombination`, `ClassSubject`, and `ElectiveSubjectSetting`.
2. **Translation logic**: All queries to legacy collections are translated into clean, canonical `TeachingAssignment` domain objects inside the adapter before being handed off to domain services.
3. **Strict CI Rules**: The CI architecture check (`scripts/check-architecture.mjs`) fails if any file under `backend/services/manual-timetable/` or core business logic files contains references to legacy models.

## Consequences
- **Safe Transition Path**: The backend can evolve its scheduling logic using the clean `TeachingAssignment` domain model while continuing to run on top of the existing database structure.
- **Measurable Technical Debt**: The legacy code is cordoned off. The files importing legacy models are flagged in the CI guard as warnings. This makes our progress measurable and trackable.
- **Easy Deletion of Legacy Code**: When we are ready to retire the legacy collections in Phase 3/4, the changes will be localized. We will only need to rewrite the loaders inside `legacyAdapter.js` to fetch directly from a unified `TeachingAssignment` table, and then delete the legacy controllers/collections without touching the manual editor or validator logic.
