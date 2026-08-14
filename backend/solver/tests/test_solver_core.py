from __future__ import annotations

import unittest

from solver_core import solve_instance


class TestSolverCoreFeasible(unittest.TestCase):
    def test_places_all_required_hours_when_capacity_allows(self):
        payload = {
            "classes": [
                {
                    "id": "c1",
                    "name": "Class 1",
                    "days_per_week": 5,
                    "subject_hours": {"s1": 4},
                }
            ],
            "subjects": [{"id": "s1", "name": "Subject 1", "type": "theory"}],
            "faculties": [{"id": "f1", "name": "Faculty 1"}],
            "combos": [
                {
                    "id": "combo1",
                    "subject_id": "s1",
                    "faculty_ids": ["f1"],
                    "class_ids": ["c1"],
                }
            ],
            "DAYS_PER_WEEK": 5,
            "HOURS_PER_DAY": 8,
            "solver_time_limit_sec": 5,
        }

        result = solve_instance(payload)

        self.assertTrue(result["ok"], result.get("error"))
        self.assertEqual(result["unmet_requirements"], [])

        placed = sum(
            1
            for day in result["class_timetables"]["c1"]
            for slot in day
            if slot == "combo1"
        )
        self.assertEqual(placed, 4)

    def test_respects_fixed_slot_placement(self):
        payload = {
            "classes": [
                {
                    "id": "c1",
                    "name": "Class 1",
                    "days_per_week": 2,
                    "subject_hours": {"s1": 2},
                }
            ],
            "subjects": [{"id": "s1", "name": "Subject 1", "type": "theory"}],
            "faculties": [{"id": "f1", "name": "Faculty 1"}],
            "combos": [
                {
                    "id": "combo1",
                    "subject_id": "s1",
                    "faculty_ids": ["f1"],
                    "class_ids": ["c1"],
                }
            ],
            "fixed_slots": [{"class": "c1", "combo": "combo1", "day": 0, "hour": 2}],
            "DAYS_PER_WEEK": 2,
            "HOURS_PER_DAY": 4,
            "solver_time_limit_sec": 5,
        }

        result = solve_instance(payload)

        self.assertTrue(result["ok"], result.get("error"))
        self.assertEqual(result["class_timetables"]["c1"][0][2], "combo1")


class TestSolverCoreInfeasible(unittest.TestCase):
    def test_reports_failure_when_teacher_fully_unavailable(self):
        payload = {
            "classes": [
                {
                    "id": "c1",
                    "name": "Class 1",
                    "days_per_week": 1,
                    "subject_hours": {"s1": 1},
                }
            ],
            "subjects": [{"id": "s1", "name": "Subject 1", "type": "theory"}],
            "faculties": [{"id": "f1", "name": "Faculty 1"}],
            "combos": [
                {
                    "id": "combo1",
                    "subject_id": "s1",
                    "faculty_ids": ["f1"],
                    "class_ids": ["c1"],
                }
            ],
            "DAYS_PER_WEEK": 1,
            "HOURS_PER_DAY": 2,
            "BREAK_HOURS": [],
            "constraintConfig": {
                "weeklySubjectHours": {"hard": True},
                "teacherAvailability": {
                    "enabled": True,
                    "hard": True,
                    "globallyUnavailableSlots": [
                        {"day": 0, "hour": 0},
                        {"day": 0, "hour": 1},
                    ],
                },
            },
            "solver_time_limit_sec": 5,
        }

        result = solve_instance(payload)

        self.assertFalse(result["ok"])
        self.assertIn("error", result)
        self.assertIn("failure_analysis", result)


if __name__ == "__main__":
    unittest.main()
