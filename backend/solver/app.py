# backend/solver/app.py

#  cd backend\solver
#  python -m venv .venv
#  .\.venv\Scripts\Activate.ps1
#  pip install -r requirements.txt (only if not working)
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
    random_seed = int(payload.get("random_seed") or os.getenv("SOLVER_RANDOM_SEED", "1"))

    subject_by_id = {s["_id"]: s for s in subjects}
    class_by_id = {c["_id"]: c for c in classes}
    combo_by_id = {c["_id"]: c for c in combos}
    required_hours_by_class_subject: Dict[str, Dict[str, int]] = {}
    for cls in classes:
        cid = cls["_id"]
        required_hours_by_class_subject[cid] = {}
        for subj in subjects:
            required_hours_by_class_subject[cid][subj["_id"]] = _required_hours(
                cls, subj
            )

    # Validate fixed slots early (non-fatal): keep only valid ones and continue.
    valid_fixed_slots: List[Dict[str, Any]] = []
    fixed_slot_warnings: List[str] = []
    for fs in fixed_slots:
        class_id = str(fs.get("class"))
        combo_id = str(fs.get("combo"))
        try:
            day = int(fs.get("day"))
            hour = int(fs.get("hour"))
        except Exception:
            fixed_slot_warnings.append(f"Fixed slot has non-numeric day/hour: {fs}")
            continue

        if class_id not in class_by_id:
            fixed_slot_warnings.append(f"Fixed slot class not found: {class_id}")
            continue
        if combo_id not in combo_by_id:
            fixed_slot_warnings.append(f"Fixed slot combo not found: {combo_id}")
            continue
        if day < 0 or day >= int(class_by_id[class_id].get("days_per_week") or DAYS_PER_WEEK):
            fixed_slot_warnings.append(
                f"Fixed slot day out of range for class {class_id}: {day}"
            )
            continue
        if hour < 0 or hour >= HOURS_PER_DAY:
            fixed_slot_warnings.append(f"Fixed slot hour out of range: {hour}")
            continue
        if hour in break_hours_set:
            fixed_slot_warnings.append(
                f"Fixed slot falls in break hour for class {class_id} at {day},{hour}"
            )
            continue
        valid_fixed_slots.append(
            {"class": class_id, "day": day, "hour": hour, "combo": combo_id}
        )

    model = cp_model.CpModel()

    # Decision variables: start placement per class/day/hour/combo
    x: Dict[Tuple[str, int, int, str], cp_model.IntVar] = {}
    covers: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = {}
    teacher_covers: Dict[Tuple[str, int, int], List[cp_model.IntVar]] = {}
    subject_covers: Dict[Tuple[str, int, int, str], List[cp_model.IntVar]] = {}
    unmet_requirements: List[Dict[str, Any]] = []

    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        # Use both explicit class assignment list and combo.class_ids mapping.
        # This makes the solver robust to stale/incomplete assigned_teacher_subject_combos.
        allowed_combo_ids = set(
            str(c) for c in (cls.get("assigned_teacher_subject_combos") or [])
        )
        for combo in combos:
            class_ids = combo.get("class_ids") or []
            if class_id in class_ids:
                allowed_combo_ids.add(combo["_id"])
        allowed_combos = list(allowed_combo_ids)

        for day in range(days):
            for hour in range(HOURS_PER_DAY):
                if hour in break_hours_set:
                    continue
                for combo_id in allowed_combos:
                    combo = combo_by_id.get(combo_id)
                    if not combo:
                        continue
                    if combo.get("class_ids") and class_id not in combo.get(
                        "class_ids", []
                    ):
                        continue
                    subj = subject_by_id.get(combo["subject_id"])
                    if not subj:
                        continue
                    if (
                        required_hours_by_class_subject[class_id].get(
                            combo["subject_id"], 0
                        )
                        <= 0
                    ):
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

    # Occupancy variables per class and faculty per slot (0/1)
    class_occ: Dict[Tuple[str, int, int], cp_model.IntVar] = {}
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        for day in range(days):
            for hour in range(HOURS_PER_DAY):
                if hour in break_hours_set:
                    continue
                occ = model.NewBoolVar(f"class_occ_{class_id}_{day}_{hour}")
                vars_here = covers.get((class_id, day, hour), [])
                if vars_here:
                    model.Add(occ == sum(vars_here))
                else:
                    model.Add(occ == 0)
                class_occ[(class_id, day, hour)] = occ

    teacher_occ: Dict[Tuple[str, int, int], cp_model.IntVar] = {}
    for fid in [f["_id"] for f in faculties]:
        for day in range(DAYS_PER_WEEK):
            for hour in range(HOURS_PER_DAY):
                if hour in break_hours_set:
                    continue
                occ = model.NewBoolVar(f"teacher_occ_{fid}_{day}_{hour}")
                vars_here = teacher_covers.get((fid, day, hour), [])
                if vars_here:
                    model.Add(occ == sum(vars_here))
                else:
                    model.Add(occ == 0)
                teacher_occ[(fid, day, hour)] = occ

    # Constraint: required hours per subject per class
    x_by_class_subject: Dict[Tuple[str, str], List[Tuple[cp_model.IntVar, int]]] = {}
    for (c_id, _day, _hour, combo_id), var in x.items():
        combo = combo_by_id.get(combo_id)
        if not combo:
            continue
        subj = subject_by_id.get(combo["subject_id"])
        if not subj:
            continue
        block = 2 if subj.get("type") == "lab" else 1
        x_by_class_subject.setdefault((c_id, combo["subject_id"]), []).append(
            (var, block)
        )

    for cls in classes:
        class_id = cls["_id"]
        for subj in subjects:
            subj_id = subj["_id"]
            req = required_hours_by_class_subject[class_id][subj_id]
            pairs = x_by_class_subject.get((class_id, subj_id), [])
            terms = [var * block for (var, block) in pairs]

            if req <= 0:
                if terms:
                    model.Add(sum(terms) == 0)
                continue
            if not terms:
                unmet_requirements.append(
                    {
                        "class_id": class_id,
                        "subject_id": subj_id,
                        "required_hours": req,
                        "scheduled_hours": 0,
                        "reason": "no_eligible_combos_or_slots",
                    }
                )
                continue
            model.Add(sum(terms) == req)

    # Constraint: teacher continuity (no 4 consecutive hours)
    for fid in [f["_id"] for f in faculties]:
        for day in range(DAYS_PER_WEEK):
            for start in range(HOURS_PER_DAY - 3):
                if (
                    start in break_hours_set
                    or (start + 1) in break_hours_set
                    or (start + 2) in break_hours_set
                    or (start + 3) in break_hours_set
                ):
                    continue
                model.Add(
                    sum(teacher_occ[(fid, day, h)] for h in range(start, start + 4))
                    <= 3
                )

    # Constraint: class continuity (no 4 consecutive periods for a class)
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        for day in range(days):
            for start in range(HOURS_PER_DAY - 3):
                if (
                    start in break_hours_set
                    or (start + 1) in break_hours_set
                    or (start + 2) in break_hours_set
                    or (start + 3) in break_hours_set
                ):
                    continue
                model.Add(
                    sum(class_occ[(class_id, day, h)] for h in range(start, start + 4))
                    <= 3
                )

    # Fixed slots
    for fs in valid_fixed_slots:
        class_id = str(fs.get("class"))
        day = int(fs.get("day"))
        hour = int(fs.get("hour"))
        combo_id = str(fs.get("combo"))
        var = x.get((class_id, day, hour, combo_id))
        if var is None:
            fixed_slot_warnings.append(
                f"Fixed slot invalid for class {class_id} combo {combo_id} at {day},{hour}"
            )
            continue
        model.Add(var == 1)

    # Hard cap: teacher daily load <= 6 periods
    teacher_day_load: Dict[Tuple[str, int], cp_model.IntVar] = {}
    for fid in [f["_id"] for f in faculties]:
        for day in range(DAYS_PER_WEEK):
            day_terms = [
                teacher_occ[(fid, day, h)]
                for h in range(HOURS_PER_DAY)
                if h not in break_hours_set
            ]
            if not day_terms:
                continue
            load = model.NewIntVar(0, len(day_terms), f"teacher_load_{fid}_{day}")
            model.Add(load == sum(day_terms))
            model.Add(load <= 6)
            teacher_day_load[(fid, day)] = load

    # Soft objective for timetable quality.
    objective_terms: List[cp_model.LinearExpr] = []

    # 1) Reduce teacher idle days and overload.
    for fid in [f["_id"] for f in faculties]:
        for day in range(DAYS_PER_WEEK):
            load = teacher_day_load.get((fid, day))
            if load is None:
                continue
            works_today = model.NewBoolVar(f"works_{fid}_{day}")
            model.Add(load >= 1).OnlyEnforceIf(works_today)
            model.Add(load == 0).OnlyEnforceIf(works_today.Not())

            # Penalize idle days and loads above 4.
            idle_today = model.NewBoolVar(f"idle_{fid}_{day}")
            model.Add(idle_today + works_today == 1)
            objective_terms.append(idle_today * 2)
            overload = model.NewIntVar(0, HOURS_PER_DAY, f"overload_{fid}_{day}")
            model.Add(overload >= load - 4)
            objective_terms.append(overload * 3)

    # 2) Reduce subject clustering within a day.
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        for subj in subjects:
            subj_id = subj["_id"]
            req = required_hours_by_class_subject[class_id][subj_id]
            if req <= 0:
                continue
            for day in range(days):
                day_terms: List[cp_model.IntVar] = []
                for hour in range(HOURS_PER_DAY):
                    if hour in break_hours_set:
                        continue
                    day_terms += subject_covers.get((class_id, day, hour, subj_id), [])
                if not day_terms:
                    continue
                day_count = model.NewIntVar(
                    0, HOURS_PER_DAY, f"subj_day_count_{class_id}_{subj_id}_{day}"
                )
                model.Add(day_count == sum(day_terms))
                # Penalize more than 2 periods/day of same subject.
                excess = model.NewIntVar(
                    0, HOURS_PER_DAY, f"subj_day_excess_{class_id}_{subj_id}_{day}"
                )
                model.Add(excess >= day_count - 2)
                objective_terms.append(excess)

    if objective_terms:
        model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(
        os.getenv("SOLVER_TIME_LIMIT_SEC", "60")
    )
    solver.parameters.num_search_workers = max(1, int(os.getenv("SOLVER_WORKERS", "8")))
    solver.parameters.random_seed = random_seed

    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Build a best-effort partial timetable so UI can still display useful output.
        max_days = max(
            [int(c.get("days_per_week") or DAYS_PER_WEEK) for c in classes]
            or [DAYS_PER_WEEK]
        )

        class_timetables: Dict[str, List[List[Any]]] = {}
        for cls in classes:
            class_id = cls["_id"]
            days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
            table = []
            for _d in range(days):
                row = []
                for h in range(HOURS_PER_DAY):
                    row.append(BREAK if h in break_hours_set else EMPTY)
                table.append(row)
            class_timetables[class_id] = table

        faculty_timetables: Dict[str, List[List[Any]]] = {}
        for f in faculties:
            fid = f["_id"]
            table = []
            for _d in range(max_days):
                row = []
                for h in range(HOURS_PER_DAY):
                    row.append(BREAK if h in break_hours_set else EMPTY)
                table.append(row)
            faculty_timetables[fid] = table

        scheduled_hours: Dict[Tuple[str, str], int] = {}

        def can_place(class_id: str, combo: Dict[str, Any], day: int, hour: int, block: int) -> bool:
            if hour + block > HOURS_PER_DAY:
                return False
            if any(h in break_hours_set for h in range(hour, hour + block)):
                return False
            for h in range(hour, hour + block):
                if class_timetables[class_id][day][h] != EMPTY:
                    return False
                for fid in combo.get("faculty_ids", []):
                    if day >= len(faculty_timetables.get(fid, [])):
                        return False
                    if faculty_timetables[fid][day][h] != EMPTY:
                        return False
            return True

        def place(class_id: str, combo: Dict[str, Any], day: int, hour: int, block: int) -> None:
            combo_id = combo["_id"]
            for h in range(hour, hour + block):
                class_timetables[class_id][day][h] = combo_id
                for fid in combo.get("faculty_ids", []):
                    faculty_timetables[fid][day][h] = combo_id
            key = (class_id, combo["subject_id"])
            scheduled_hours[key] = scheduled_hours.get(key, 0) + block

        # Place fixed slots first.
        for fs in valid_fixed_slots:
            class_id = str(fs.get("class"))
            day = int(fs.get("day"))
            hour = int(fs.get("hour"))
            combo_id = str(fs.get("combo"))
            combo = combo_by_id.get(combo_id)
            if not combo:
                continue
            subj = subject_by_id.get(combo["subject_id"])
            if not subj:
                continue
            block = 2 if subj.get("type") == "lab" else 1
            days = int(class_by_id[class_id].get("days_per_week") or DAYS_PER_WEEK)
            if day < 0 or day >= days:
                continue
            if can_place(class_id, combo, day, hour, block):
                place(class_id, combo, day, hour, block)

        # Greedy fill remaining demand.
        demand_items: List[Tuple[str, str, int]] = []
        for cls in classes:
            class_id = cls["_id"]
            for subj in subjects:
                subj_id = subj["_id"]
                req = required_hours_by_class_subject[class_id][subj_id]
                if req > 0:
                    demand_items.append((class_id, subj_id, req))
        demand_items.sort(key=lambda x: x[2], reverse=True)

        for class_id, subj_id, req in demand_items:
            key = (class_id, subj_id)
            already = scheduled_hours.get(key, 0)
            remaining = req - already
            if remaining <= 0:
                continue

            eligible_combos = []
            for combo in combos:
                if combo.get("subject_id") != subj_id:
                    continue
                class_ids = combo.get("class_ids") or []
                if class_ids and class_id not in class_ids:
                    continue
                eligible_combos.append(combo)

            if not eligible_combos:
                unmet_requirements.append(
                    {
                        "class_id": class_id,
                        "subject_id": subj_id,
                        "required_hours": req,
                        "scheduled_hours": already,
                        "reason": "no_eligible_combos_or_slots",
                    }
                )
                continue

            subj = subject_by_id.get(subj_id) or {}
            block = 2 if subj.get("type") == "lab" else 1
            days = int(class_by_id[class_id].get("days_per_week") or DAYS_PER_WEEK)

            placed_any = True
            while remaining > 0 and placed_any:
                placed_any = False
                for day in range(days):
                    if placed_any:
                        break
                    for hour in range(HOURS_PER_DAY):
                        if placed_any:
                            break
                        if block > remaining:
                            continue
                        for combo in eligible_combos:
                            if can_place(class_id, combo, day, hour, block):
                                place(class_id, combo, day, hour, block)
                                remaining -= block
                                placed_any = True
                                break

            if remaining > 0:
                unmet_requirements.append(
                    {
                        "class_id": class_id,
                        "subject_id": subj_id,
                        "required_hours": req,
                        "scheduled_hours": req - remaining,
                        "reason": "infeasible_under_current_constraints",
                    }
                )

        return {
            "ok": False,
            "error": "No feasible full solution. Returned partial timetable.",
            "class_timetables": class_timetables,
            "faculty_timetables": faculty_timetables,
            "classes": classes,
            "unmet_requirements": unmet_requirements,
            "warnings": fixed_slot_warnings,
        }

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

    # Post-solve unmet requirements report for transparency
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        for subj in subjects:
            subj_id = subj["_id"]
            req = required_hours_by_class_subject[class_id][subj_id]
            if req <= 0:
                continue
            scheduled = 0
            for d in range(days):
                for h in range(HOURS_PER_DAY):
                    if h in break_hours_set:
                        continue
                    slot = class_timetables[class_id][d][h]
                    if slot == EMPTY or slot == BREAK:
                        continue
                    combo = combo_by_id.get(str(slot))
                    if combo and combo.get("subject_id") == subj_id:
                        scheduled += 1
            if scheduled < req and not any(
                u["class_id"] == class_id and u["subject_id"] == subj_id
                for u in unmet_requirements
            ):
                unmet_requirements.append(
                    {
                        "class_id": class_id,
                        "subject_id": subj_id,
                        "required_hours": req,
                        "scheduled_hours": scheduled,
                        "reason": "infeasible_under_current_constraints",
                    }
                )

    return {
        "ok": True,
        "class_timetables": class_timetables,
        "faculty_timetables": faculty_timetables,
        "classes": classes,
        "unmet_requirements": unmet_requirements,
        "warnings": fixed_slot_warnings,
    }
