# backend/solver/app.py

#  cd backend\solver
#  python -m venv .venv
#  .\.venv\Scripts\Activate.ps1
#  pip install -r requirements.txt
#  uvicorn app:app --host 0.0.0.0 --port 8001

# FastAPI CP-SAT timetable solver service
import os
from typing import Dict, List, Any, Tuple
from fastapi import FastAPI, Request
from ortools.sat.python import cp_model

app = FastAPI()

EMPTY = -1
BREAK = "BREAK"


def _normalize_id(item: Dict[str, Any]) -> Dict[str, Any]:
    _id = item.get("_id") or item.get("id")
    return {**item, "_id": str(_id)}


def _required_hours(class_obj: Dict[str, Any], subject_obj: Dict[str, Any]) -> int:
    subj_id = subject_obj["_id"]
    subj_hours = class_obj.get("subject_hours") or {}
    if subj_id in subj_hours and subj_hours[subj_id] is not None:
        return int(subj_hours[subj_id])
    return int(subject_obj.get("no_of_hours_per_week") or 0)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"ok": "true"}


@app.post("/solve")
async def solve(request: Request) -> Dict[str, Any]:
    payload = await request.json()

    faculties = [_normalize_id(f) for f in payload.get("faculties", [])]
    subjects = [_normalize_id({**s, "type": s.get("type") or "theory"}) for s in payload.get("subjects", [])]
    classes = [_normalize_id(c) for c in payload.get("classes", [])]
    combos_raw = payload.get("combos", [])

    combos = []
    for c in combos_raw:
        combo = {
            **c,
            "_id": str(c.get("_id") or c.get("id")),
            "subject_id": str(c.get("subject_id")),
            "faculty_ids": [str(x) for x in (c.get("faculty_ids") or ([c.get("faculty_id")] if c.get("faculty_id") else []))],
            "class_ids": [str(x) for x in (c.get("class_ids") or [])],
        }
        combos.append(combo)

    DAYS_PER_WEEK = int(payload.get("DAYS_PER_WEEK") or 6)
    HOURS_PER_DAY = int(payload.get("HOURS_PER_DAY") or 8)
    BREAK_HOURS = [int(h) for h in (payload.get("BREAK_HOURS") or [])]
    break_hours_set = set(BREAK_HOURS)

    fixed_slots = payload.get("fixed_slots") or payload.get("fixedSlots") or []

    subject_by_id = {s["_id"]: s for s in subjects}
    class_by_id = {c["_id"]: c for c in classes}
    combo_by_id = {c["_id"]: c for c in combos}

    # Validate fixed slots early
    for fs in fixed_slots:
        class_id = str(fs.get("class"))
        day = int(fs.get("day"))
        hour = int(fs.get("hour"))
        combo_id = str(fs.get("combo"))
        if class_id not in class_by_id:
            return {"ok": False, "error": f"Fixed slot class not found: {class_id}"}
        if combo_id not in combo_by_id:
            return {"ok": False, "error": f"Fixed slot combo not found: {combo_id}"}
        if day < 0 or day >= int(class_by_id[class_id].get("days_per_week") or DAYS_PER_WEEK):
            return {"ok": False, "error": f"Fixed slot day out of range for class {class_id}: {day}"}
        if hour < 0 or hour >= HOURS_PER_DAY:
            return {"ok": False, "error": f"Fixed slot hour out of range: {hour}"}

    model = cp_model.CpModel()

    # Decision variables: start placement per class/day/hour/combo
    x: Dict[Tuple[str, int, int, str], cp_model.IntVar] = {}
    covers: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = {}
    teacher_covers: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = {}
    subject_covers: Dict[Tuple[str, int, int, str], List[cp_model.IntVar]] = {}

    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        allowed_combos = [str(c) for c in (cls.get("assigned_teacher_subject_combos") or [])]

        for day in range(days):
            for hour in range(HOURS_PER_DAY):
                if hour in break_hours_set:
                    continue
                for combo_id in allowed_combos:
                    combo = combo_by_id.get(combo_id)
                    if not combo:
                        continue
                    subj = subject_by_id.get(combo["subject_id"])
                    if not subj:
                        continue
                    block = 2 if subj.get("type") == "lab" else 1
                    if hour + block > HOURS_PER_DAY:
                        continue
                    if any(h in break_hours_set for h in range(hour, hour + block)):
                        continue
                    var = model.NewBoolVar(f"x_{class_id}_{day}_{hour}_{combo_id}")
                    x[(class_id, day, hour, combo_id)] = var

                    for h in range(hour, hour + block):
                        covers.setdefault((class_id, day, h), []).append(var)
                        for fid in combo.get("faculty_ids", []):
                            teacher_covers.setdefault((fid, day, h), []).append(var)
                        subject_covers.setdefault((class_id, day, h, combo["subject_id"]), []).append(var)

    # Constraint: at most one lesson per class per hour
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        for day in range(days):
            for hour in range(HOURS_PER_DAY):
                if hour in break_hours_set:
                    continue
                vars_here = covers.get((class_id, day, hour), [])
                if vars_here:
                    model.AddAtMostOne(vars_here)

    # Constraint: teacher clash
    for fid in [f["_id"] for f in faculties]:
        for day in range(DAYS_PER_WEEK):
            for hour in range(HOURS_PER_DAY):
                if hour in break_hours_set:
                    continue
                vars_here = teacher_covers.get((fid, day, hour), [])
                if vars_here:
                    model.AddAtMostOne(vars_here)

    # Constraint: required hours per subject per class
    for cls in classes:
        class_id = cls["_id"]
        for subj in subjects:
            req = _required_hours(cls, subj)
            if req <= 0:
                continue
            terms = []
            for (c_id, day, hour, combo_id), var in x.items():
                if c_id != class_id:
                    continue
                combo = combo_by_id.get(combo_id)
                if combo and combo["subject_id"] == subj["_id"]:
                    block = 2 if subj.get("type") == "lab" else 1
                    terms.append(var * block)
            if not terms:
                return {"ok": False, "error": f"No available slots for class {class_id} subject {subj['_id']}"}
            model.Add(sum(terms) == req)

    # Constraint: teacher continuity (no 3 consecutive hours)
    for fid in [f["_id"] for f in faculties]:
        for day in range(DAYS_PER_WEEK):
            for start in range(HOURS_PER_DAY - 2):
                if start in break_hours_set or (start + 1) in break_hours_set or (start + 2) in break_hours_set:
                    continue
                window = []
                for h in (start, start + 1, start + 2):
                    window += teacher_covers.get((fid, day, h), [])
                if window:
                    model.Add(sum(window) <= 2)

    # Constraint: subject continuity for class (no 3 consecutive hours)
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        for subj in subjects:
            subj_id = subj["_id"]
            for day in range(days):
                for start in range(HOURS_PER_DAY - 2):
                    if start in break_hours_set or (start + 1) in break_hours_set or (start + 2) in break_hours_set:
                        continue
                    window = []
                    for h in (start, start + 1, start + 2):
                        window += subject_covers.get((class_id, day, h, subj_id), [])
                    if window:
                        model.Add(sum(window) <= 2)

    # Fixed slots
    for fs in fixed_slots:
        class_id = str(fs.get("class"))
        day = int(fs.get("day"))
        hour = int(fs.get("hour"))
        combo_id = str(fs.get("combo"))
        var = x.get((class_id, day, hour, combo_id))
        if var is None:
            return {"ok": False, "error": f"Fixed slot invalid for class {class_id} combo {combo_id} at {day},{hour}"}
        model.Add(var == 1)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(os.getenv("SOLVER_TIME_LIMIT_SEC", "30"))
    solver.parameters.num_search_workers = max(1, int(os.getenv("SOLVER_WORKERS", "8")))

    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"ok": False, "error": "No feasible solution"}

    # Build outputs
    max_days = max([int(c.get("days_per_week") or DAYS_PER_WEEK) for c in classes] or [DAYS_PER_WEEK])

    class_timetables: Dict[str, List[List[Any]]] = {}
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        table = []
        for d in range(days):
            row = []
            for h in range(HOURS_PER_DAY):
                if h in break_hours_set:
                    row.append(BREAK)
                else:
                    row.append(EMPTY)
            table.append(row)
        class_timetables[class_id] = table

    faculty_timetables: Dict[str, List[List[Any]]] = {}
    for f in faculties:
        fid = f["_id"]
        table = []
        for d in range(max_days):
            row = []
            for h in range(HOURS_PER_DAY):
                if h in break_hours_set:
                    row.append(BREAK)
                else:
                    row.append(EMPTY)
            table.append(row)
        faculty_timetables[fid] = table

    for (class_id, day, hour, combo_id), var in x.items():
        if solver.Value(var) != 1:
            continue
        combo = combo_by_id[combo_id]
        subj = subject_by_id[combo["subject_id"]]
        block = 2 if subj.get("type") == "lab" else 1
        for h in range(hour, hour + block):
            class_timetables[class_id][day][h] = combo_id
            for fid in combo.get("faculty_ids", []):
                faculty_timetables[fid][day][h] = combo_id

    return {
        "ok": True,
        "class_timetables": class_timetables,
        "faculty_timetables": faculty_timetables,
        "classes": classes,
    }
