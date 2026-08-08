# ADR 001: TeachingAssignment is Canonical

## Status
Accepted

## Context
Previously, teacher-subject-class relationships and allocations were scattered across multiple disjointed collections and concepts in the database and code:
- `TeacherSubjectCombination` (TSC) for pairing teachers and subjects.
- `ClassSubject` for pairing subjects with classes (with hours/settings).
- `TeachingAllocation` for the actual assignment details.
- Various ad-hoc concepts like `Combo`, `SavedCombo`, `GeneratorCombo`, and route response objects.

This led to at least five different object shapes representing the same logical entity at different stages of the application lifecycle, causing frequent data consistency issues, property lookup failures (e.g., `combo.subject?._id` vs `combo.subjectId` vs `combo.subject_id`), and brittle code where changing a relation broke unrelated pages.

## Decision
We establish `TeachingAssignment` (persisted in the database as `TeachingAllocation`) as the single canonical domain entity. All other concepts are either:
1. Inputs used to construct a `TeachingAssignment` (e.g., teacher preferences, class curriculum).
2. Derivations or outputs of `TeachingAssignment` (e.g., scheduled slots in a timetable).

A `TeachingAssignment` is defined as:
```typescript
interface TeachingAssignment {
  id: string; // Map to database _id
  collegeId: string;
  classIds: string[];
  subjectId: string;
  teacherIds: string[];
  weeklyHours: number;
  type: 'regular' | 'lab' | 'elective';
  // Additional configuration such as combined class metadata
}
```

All services, utilities, and routes (other than the designated legacy adapter and generator solver boundaries) must consume and output this canonical shape.

## Consequences
- **Improved Type Safety & Consistency**: Developer errors due to shape mismatches are caught early. Lookups of attributes use consistent field names (`teacherIds`, `subjectId`, `classIds`).
- **Unified Domain Logic**: Domain rules (like co-teaching or elective allocation) are defined on a single entity instead of being scattered across different entity states.
- **Migration Path**: Legacy tables will be retained only as transient inputs or historical adapters. Over time, the application will read directly from the `TeachingAssignment` model.
- **Architectural Guardrails**: The CI architecture guard (`scripts/check-architecture.mjs`) enforces that no core manual-timetable files or route handlers may import legacy models directly, maintaining this boundary.
