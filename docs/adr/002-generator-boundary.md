# ADR 002: Generator Solver Decoupling and Boundary

## Status
Accepted

## Context
The core timetable solver/generator has its own internal data structures (using snake_case properties like `faculty_ids`, `subject_id`, and `class_ids`, and treating relationships as lists of IDs). Historically, these solver-specific shapes leaked out of the generator and permeated the REST API responses, database storage formats, and frontend manual editing pages. 

This leakage created an anti-pattern where frontend and backend components had to parse and format object properties depending on whether the timetable was "generated" or "manually placed", creating high cognitive load and code duplication.

## Decision
We enforce a strict boundary around the timetable generator using the **Adapter Pattern**:
1. The timetable generator engine and its direct input/output preparers (e.g., `services/generator/prepareGeneratorData.js`) are isolated behind a **Generator Adapter**.
2. This adapter is the ONLY component allowed to convert the canonical domain model (`TeachingAssignment`) into the solver's internal representation (`GeneratorCombo`).
3. When the solver returns a result, the adapter immediately translates the solver-specific output back into the canonical format (using `assignmentId` references in slot cells) before returning it to the application services or database.

## Consequences
- **Decoupled Engine**: The core scheduling solver can be rewritten, optimized, or replaced (e.g., migrating from a custom JS scheduler to a Python/OptaPlanner solver or a WASM-compiled engine) without modifying the frontend or standard backend CRUD APIs.
- **Zero Shape Leakage**: No snake_case property identifiers or engine-specific data schemas (`faculty_ids`, `subject_id`) are permitted in the web routes, manual timetable editors, or persistence services.
- **Cleaner Interfaces**: Core validation logic (like detecting teacher double-booking) operates on the standard `TeachingAssignment` shape, regardless of whether the timetable was generated or manually created.
