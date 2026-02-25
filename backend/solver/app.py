# backend/solver/app.py

#  cd backend\solver
#  python -m venv .venv
#  .\.venv\Scripts\Activate.ps1
#  pip install -r requirements.txt (only if not working)
#  uvicorn app:app --host 0.0.0.0 --port 8001

# FastAPI CP-SAT timetable solver service
import asyncio
import os
import sys
from typing import Dict, List, Any, Tuple
from fastapi import FastAPI, Request
from ortools.sat.python import cp_model

# Avoid noisy Proactor transport shutdown tracebacks on Windows when clients disconnect.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

app = FastAPI()

EMPTY = -1
BREAK = "BREAK"

def _solver_loop_exception_handler(loop, context):
    exc = context.get("exception")
    if isinstance(exc, ConnectionResetError):
        # Ignore noisy Windows socket shutdown resets from disconnected clients.
        if getattr(exc, "winerror", None) == 10054:
            return
    loop.default_exception_handler(context)


def _normalize_id(item: Dict[str, Any]) -> Dict[str, Any]:
    _id = item.get("_id") or item.get("id")
    return {**item, "_id": str(_id)}


def _required_hours(class_obj: Dict[str, Any], subject_obj: Dict[str, Any]) -> int:
    subj_id = subject_obj["_id"]
    subj_hours = class_obj.get("subject_hours") or {}
    if subj_id in subj_hours and subj_hours[subj_id] is not None:
        return int(subj_hours[subj_id])
    return int(subject_obj.get("no_of_hours_per_week") or 0)


def _cfg_get(cfg: Dict[str, Any], path: List[str], default: Any) -> Any:
    node: Any = cfg
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return default
        node = node[key]
    return node


def _to_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("true", "1", "yes", "y", "on"):
            return True
        if v in ("false", "0", "no", "n", "off"):
            return False
    return default


def _normalize_slot_list(raw: Any) -> List[Tuple[int, int]]:
    if not isinstance(raw, list):
        return []
    out: List[Tuple[int, int]] = []
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            day = int(item.get("day"))
            hour = int(item.get("hour"))
        except Exception:
            continue
        key = (day, hour)
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def _normalize_teacher_slot_map(raw: Any) -> Dict[str, set]:
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, set] = {}
    for teacher_id, slots in raw.items():
        tid = str(teacher_id)
        norm = set(_normalize_slot_list(slots))
        if norm:
            out[tid] = norm
    return out


@app.on_event("startup")
async def _install_loop_handler():
    loop = asyncio.get_running_loop()
    loop.set_exception_handler(_solver_loop_exception_handler)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"ok": "true"}


@app.post("/solve")
async def solve(request: Request) -> Dict[str, Any]:
    payload = await request.json()
    constraint_config = payload.get("constraintConfig") or {}

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

    DAYS_PER_WEEK = int(
        _cfg_get(constraint_config, ["schedule", "daysPerWeek"], payload.get("DAYS_PER_WEEK") or 6)
    )
    HOURS_PER_DAY = int(
        _cfg_get(constraint_config, ["schedule", "hoursPerDay"], payload.get("HOURS_PER_DAY") or 8)
    )
    BREAK_HOURS = [
        int(h) for h in (
            _cfg_get(constraint_config, ["schedule", "breakHours"], payload.get("BREAK_HOURS") or [])
        )
    ]
    break_hours_set = set(BREAK_HOURS)

    fixed_slots = payload.get("fixed_slots") or payload.get("fixedSlots") or []
    random_seed = int(payload.get("random_seed") or os.getenv("SOLVER_RANDOM_SEED", "1"))
    solver_time_limit_sec = float(
        _cfg_get(
            constraint_config,
            ["solver", "timeLimitSec"],
            payload.get("solver_time_limit_sec") or os.getenv("SOLVER_TIME_LIMIT_SEC", "180"),
        )
    )

    lab_block_size = max(1, int(_cfg_get(constraint_config, ["structural", "labBlockSize"], 2)))
    theory_block_size = max(1, int(_cfg_get(constraint_config, ["structural", "theoryBlockSize"], 1)))

    weekly_hours_hard = _to_bool(
        _cfg_get(constraint_config, ["weeklySubjectHours", "hard"], True),
        True,
    )
    weekly_hours_shortage_weight = max(
        0, int(_cfg_get(constraint_config, ["weeklySubjectHours", "shortageWeight"], 1000))
    )

    teacher_cont_enabled = _to_bool(
        _cfg_get(constraint_config, ["teacherContinuity", "enabled"], True), True
    )
    teacher_cont_max = max(
        1, int(_cfg_get(constraint_config, ["teacherContinuity", "maxConsecutive"], 3))
    )
    teacher_cont_weight = max(0, int(_cfg_get(constraint_config, ["teacherContinuity", "weight"], 100)))

    class_cont_enabled = _to_bool(
        _cfg_get(constraint_config, ["classContinuity", "enabled"], True), True
    )
    class_cont_max = max(
        1, int(_cfg_get(constraint_config, ["classContinuity", "maxConsecutive"], 3))
    )
    class_cont_weight = max(0, int(_cfg_get(constraint_config, ["classContinuity", "weight"], 80)))

    no_gaps_hard = _to_bool(_cfg_get(constraint_config, ["noGaps", "hard"], True), True)
    no_gaps_weight = max(0, int(_cfg_get(constraint_config, ["noGaps", "weight"], 500)))

    teacher_daily_enabled = _to_bool(
        _cfg_get(constraint_config, ["teacherDailyOverload", "enabled"], True), True
    )
    teacher_daily_max = max(0, int(_cfg_get(constraint_config, ["teacherDailyOverload", "max"], 6)))
    teacher_daily_weight = max(0, int(_cfg_get(constraint_config, ["teacherDailyOverload", "weight"], 120)))

    subject_cluster_enabled = _to_bool(
        _cfg_get(constraint_config, ["subjectClustering", "enabled"], True), True
    )
    subject_cluster_max = max(1, int(_cfg_get(constraint_config, ["subjectClustering", "maxPerDay"], 3)))
    subject_cluster_weight = max(0, int(_cfg_get(constraint_config, ["subjectClustering", "weight"], 50)))

    front_loading_enabled = _to_bool(
        _cfg_get(constraint_config, ["frontLoading", "enabled"], True), True
    )
    front_loading_weight = max(0, int(_cfg_get(constraint_config, ["frontLoading", "weight"], 400)))

    teacher_avail_enabled = _to_bool(
        _cfg_get(constraint_config, ["teacherAvailability", "enabled"], False), False
    )
    teacher_avail_hard = _to_bool(
        _cfg_get(constraint_config, ["teacherAvailability", "hard"], True), True
    )
    teacher_avail_weight = max(
        0, int(_cfg_get(constraint_config, ["teacherAvailability", "weight"], 250))
    )
    teacher_avail_global = set(
        _normalize_slot_list(
            _cfg_get(constraint_config, ["teacherAvailability", "globallyUnavailableSlots"], [])
        )
    )
    teacher_avail_by_teacher = _normalize_teacher_slot_map(
        _cfg_get(constraint_config, ["teacherAvailability", "unavailableSlotsByTeacher"], {})
    )

    teacher_weekly_enabled = _to_bool(
        _cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "enabled"], False), False
    )
    teacher_weekly_min = max(
        0, int(_cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "minWeeklyLoad"], 0))
    )
    teacher_weekly_target = max(
        0, int(_cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "targetWeeklyLoad"], 0))
    )
    teacher_weekly_max = max(
        0, int(_cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "maxWeeklyLoad"], 48))
    )
    teacher_weekly_hard_min = _to_bool(
        _cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "hardMin"], False), False
    )
    teacher_weekly_hard_max = _to_bool(
        _cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "hardMax"], False), False
    )
    teacher_weekly_under_weight = max(
        0, int(_cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "underWeight"], 40))
    )
    teacher_weekly_over_weight = max(
        0, int(_cfg_get(constraint_config, ["teacherWeeklyLoadBalance", "overWeight"], 40))
    )

    class_daily_min_enabled = _to_bool(
        _cfg_get(constraint_config, ["classDailyMinimumLoad", "enabled"], False), False
    )
    class_daily_min_hard = _to_bool(
        _cfg_get(constraint_config, ["classDailyMinimumLoad", "hard"], False), False
    )
    class_daily_min_value = max(
        0, int(_cfg_get(constraint_config, ["classDailyMinimumLoad", "minPerDay"], 1))
    )
    class_daily_min_weight = max(
        0, int(_cfg_get(constraint_config, ["classDailyMinimumLoad", "weight"], 100))
    )

    teacher_boundary_enabled = _to_bool(
        _cfg_get(constraint_config, ["teacherBoundaryPreference", "enabled"], False), False
    )
    teacher_boundary_avoid_first = _to_bool(
        _cfg_get(constraint_config, ["teacherBoundaryPreference", "avoidFirstPeriod"], True), True
    )
    teacher_boundary_avoid_last = _to_bool(
        _cfg_get(constraint_config, ["teacherBoundaryPreference", "avoidLastPeriod"], True), True
    )
    teacher_boundary_weight = max(
        0, int(_cfg_get(constraint_config, ["teacherBoundaryPreference", "weight"], 60))
    )
    teacher_boundary_overrides_raw = _cfg_get(
        constraint_config, ["teacherBoundaryPreference", "teacherOverrides"], {}
    )
    teacher_boundary_overrides = (
        teacher_boundary_overrides_raw if isinstance(teacher_boundary_overrides_raw, dict) else {}
    )

    applied_config = {
        "schedule": {"daysPerWeek": DAYS_PER_WEEK, "hoursPerDay": HOURS_PER_DAY, "breakHours": BREAK_HOURS},
        "structural": {"labBlockSize": lab_block_size, "theoryBlockSize": theory_block_size},
        "weeklySubjectHours": {"hard": weekly_hours_hard, "shortageWeight": weekly_hours_shortage_weight},
        "teacherContinuity": {"enabled": teacher_cont_enabled, "maxConsecutive": teacher_cont_max, "weight": teacher_cont_weight},
        "classContinuity": {"enabled": class_cont_enabled, "maxConsecutive": class_cont_max, "weight": class_cont_weight},
        "noGaps": {"hard": no_gaps_hard, "weight": no_gaps_weight},
        "teacherDailyOverload": {"enabled": teacher_daily_enabled, "max": teacher_daily_max, "weight": teacher_daily_weight},
        "subjectClustering": {"enabled": subject_cluster_enabled, "maxPerDay": subject_cluster_max, "weight": subject_cluster_weight},
        "frontLoading": {"enabled": front_loading_enabled, "weight": front_loading_weight},
        "teacherAvailability": {
            "enabled": teacher_avail_enabled,
            "hard": teacher_avail_hard,
            "weight": teacher_avail_weight,
            "globallyUnavailableSlots": [
                {"day": day, "hour": hour} for (day, hour) in sorted(teacher_avail_global)
            ],
            "unavailableSlotsByTeacher": {
                tid: [{"day": day, "hour": hour} for (day, hour) in sorted(list(slots))]
                for tid, slots in teacher_avail_by_teacher.items()
            },
        },
        "teacherWeeklyLoadBalance": {
            "enabled": teacher_weekly_enabled,
            "minWeeklyLoad": teacher_weekly_min,
            "targetWeeklyLoad": teacher_weekly_target,
            "maxWeeklyLoad": teacher_weekly_max,
            "hardMin": teacher_weekly_hard_min,
            "hardMax": teacher_weekly_hard_max,
            "underWeight": teacher_weekly_under_weight,
            "overWeight": teacher_weekly_over_weight,
        },
        "classDailyMinimumLoad": {
            "enabled": class_daily_min_enabled,
            "hard": class_daily_min_hard,
            "minPerDay": class_daily_min_value,
            "weight": class_daily_min_weight,
        },
        "teacherBoundaryPreference": {
            "enabled": teacher_boundary_enabled,
            "avoidFirstPeriod": teacher_boundary_avoid_first,
            "avoidLastPeriod": teacher_boundary_avoid_last,
            "weight": teacher_boundary_weight,
            "teacherOverrides": teacher_boundary_overrides,
        },
        "solver": {"timeLimitSec": solver_time_limit_sec},
    }

    subject_by_id = {s["_id"]: s for s in subjects}
    class_by_id = {c["_id"]: c for c in classes}
    combo_by_id = {c["_id"]: c for c in combos}
    faculty_ids = [f["_id"] for f in faculties]

    def _is_teacher_unavailable(fid: str, day: int, hour: int) -> bool:
        key = (day, hour)
        if key in teacher_avail_global:
            return True
        teacher_slots = teacher_avail_by_teacher.get(fid)
        return bool(teacher_slots and key in teacher_slots)

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
        if teacher_avail_enabled and teacher_avail_hard:
            combo = combo_by_id.get(combo_id)
            if combo:
                subj = subject_by_id.get(combo.get("subject_id"))
                block = lab_block_size if subj and subj.get("type") == "lab" else theory_block_size
                availability_conflict = False
                for fid in combo.get("faculty_ids", []):
                    if any(_is_teacher_unavailable(fid, day, h) for h in range(hour, min(HOURS_PER_DAY, hour + block))):
                        availability_conflict = True
                        break
                if availability_conflict:
                    fixed_slot_warnings.append(
                        f"Fixed slot violates teacher availability for class {class_id} at {day},{hour}"
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
    objective_terms: List[cp_model.LinearExpr] = []

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
                    block = lab_block_size if subj.get("type") == "lab" else theory_block_size
                    if hour + block > HOURS_PER_DAY:
                        continue
                    if any(h in break_hours_set for h in range(hour, hour + block)):
                        continue

                    violates_availability = False
                    if teacher_avail_enabled:
                        for fid in combo.get("faculty_ids", []):
                            if any(_is_teacher_unavailable(fid, day, h) for h in range(hour, hour + block)):
                                violates_availability = True
                                break
                        if teacher_avail_hard and violates_availability:
                            continue

                    var = model.NewBoolVar(f"x_{class_id}_{day}_{hour}_{combo_id}")
                    x[(class_id, day, hour, combo_id)] = var
                    if (
                        teacher_avail_enabled
                        and not teacher_avail_hard
                        and teacher_avail_weight > 0
                        and violates_availability
                    ):
                        objective_terms.append(var * teacher_avail_weight)

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
    for fid in faculty_ids:
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
    for fid in faculty_ids:
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

    # Weekly subject hours: configurable hard/soft behavior.
    x_by_class_subject: Dict[Tuple[str, str], List[Tuple[cp_model.IntVar, int]]] = {}
    for (c_id, _day, _hour, combo_id), var in x.items():
        combo = combo_by_id.get(combo_id)
        if not combo:
            continue
        subj = subject_by_id.get(combo["subject_id"])
        if not subj:
            continue
        block = lab_block_size if subj.get("type") == "lab" else theory_block_size
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
            scheduled_terms = sum(terms) if terms else 0
            if weekly_hours_hard:
                model.Add(scheduled_terms == req)
            else:
                scheduled = model.NewIntVar(0, req, f"scheduled_{class_id}_{subj_id}")
                model.Add(scheduled == scheduled_terms)
                shortage = model.NewIntVar(0, req, f"shortage_{class_id}_{subj_id}")
                model.Add(scheduled + shortage == req)
                objective_terms.append(shortage * weekly_hours_shortage_weight)

    # Soft constraint: teacher continuity.
    if teacher_cont_enabled and teacher_cont_weight > 0:
        win_len = teacher_cont_max + 1
        for fid in faculty_ids:
            for day in range(DAYS_PER_WEEK):
                for start in range(HOURS_PER_DAY - win_len + 1):
                    if any(h in break_hours_set for h in range(start, start + win_len)):
                        continue
                    win = sum(
                        teacher_occ[(fid, day, h)] for h in range(start, start + win_len)
                    )
                    excess = model.NewIntVar(
                        0, win_len, f"teacher_cont_excess_{fid}_{day}_{start}"
                    )
                    model.Add(excess >= win - teacher_cont_max)
                    objective_terms.append(excess * teacher_cont_weight)

    # Soft constraint: class continuity.
    if class_cont_enabled and class_cont_weight > 0:
        win_len = class_cont_max + 1
        for cls in classes:
            class_id = cls["_id"]
            days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
            for day in range(days):
                for start in range(HOURS_PER_DAY - win_len + 1):
                    if any(h in break_hours_set for h in range(start, start + win_len)):
                        continue
                    win = sum(
                        class_occ[(class_id, day, h)] for h in range(start, start + win_len)
                    )
                    excess = model.NewIntVar(
                        0, win_len, f"class_cont_excess_{class_id}_{day}_{start}"
                    )
                    model.Add(excess >= win - class_cont_max)
                    objective_terms.append(excess * class_cont_weight)

    # Hard constraint: no in-between class gaps within a day.
    # A gap is an empty non-break slot that has at least one class before it
    # and at least one class after it on the same day.
    for cls in classes:
        class_id = cls["_id"]
        days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
        valid_hours = [h for h in range(HOURS_PER_DAY) if h not in break_hours_set]
        for day in range(days):
            for hour in valid_hours:
                prev_hours = [h for h in valid_hours if h < hour]
                next_hours = [h for h in valid_hours if h > hour]
                if not prev_hours or not next_hours:
                    continue

                has_before = model.NewBoolVar(
                    f"class_has_before_{class_id}_{day}_{hour}"
                )
                before_terms = [class_occ[(class_id, day, h)] for h in prev_hours]
                model.Add(has_before <= sum(before_terms))
                for term in before_terms:
                    model.Add(has_before >= term)

                has_after = model.NewBoolVar(
                    f"class_has_after_{class_id}_{day}_{hour}"
                )
                after_terms = [class_occ[(class_id, day, h)] for h in next_hours]
                model.Add(has_after <= sum(after_terms))
                for term in after_terms:
                    model.Add(has_after >= term)

                gap = model.NewBoolVar(f"class_gap_{class_id}_{day}_{hour}")
                occ = class_occ[(class_id, day, hour)]
                model.Add(gap <= has_before)
                model.Add(gap <= has_after)
                model.Add(gap <= 1 - occ)
                model.Add(gap >= has_before + has_after - occ - 1)
                if no_gaps_hard:
                    model.Add(gap == 0)
                elif no_gaps_weight > 0:
                    objective_terms.append(gap * no_gaps_weight)

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

    # Soft cap: teacher daily load.
    if teacher_daily_enabled and teacher_daily_weight > 0:
        teacher_day_load: Dict[Tuple[str, int], cp_model.IntVar] = {}
        for fid in faculty_ids:
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
                teacher_day_load[(fid, day)] = load
                overload = model.NewIntVar(
                    0, HOURS_PER_DAY, f"teacher_overload_{fid}_{day}"
                )
                model.Add(overload >= load - teacher_daily_max)
                objective_terms.append(overload * teacher_daily_weight)

    # Class daily minimum load.
    if class_daily_min_enabled and class_daily_min_value > 0:
        for cls in classes:
            class_id = cls["_id"]
            days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
            for day in range(days):
                day_terms = [
                    class_occ[(class_id, day, h)]
                    for h in range(HOURS_PER_DAY)
                    if h not in break_hours_set
                ]
                if not day_terms:
                    continue
                day_load = model.NewIntVar(
                    0, len(day_terms), f"class_day_load_{class_id}_{day}"
                )
                model.Add(day_load == sum(day_terms))
                if class_daily_min_hard:
                    model.Add(day_load >= class_daily_min_value)
                elif class_daily_min_weight > 0:
                    shortage = model.NewIntVar(
                        0, class_daily_min_value, f"class_day_shortage_{class_id}_{day}"
                    )
                    model.Add(shortage >= class_daily_min_value - day_load)
                    objective_terms.append(shortage * class_daily_min_weight)

    # Teacher weekly load balancing: configurable min/target/max controls.
    if teacher_weekly_enabled:
        weekly_hours = [h for h in range(HOURS_PER_DAY) if h not in break_hours_set]
        weekly_capacity = DAYS_PER_WEEK * len(weekly_hours)
        for fid in faculty_ids:
            weekly_terms = [
                teacher_occ[(fid, day, hour)]
                for day in range(DAYS_PER_WEEK)
                for hour in weekly_hours
            ]
            if not weekly_terms:
                continue

            weekly_load = model.NewIntVar(0, weekly_capacity, f"teacher_week_load_{fid}")
            model.Add(weekly_load == sum(weekly_terms))

            if teacher_weekly_hard_min:
                model.Add(weekly_load >= teacher_weekly_min)
            elif teacher_weekly_under_weight > 0 and teacher_weekly_min > 0:
                under_min = model.NewIntVar(0, teacher_weekly_min, f"teacher_under_min_{fid}")
                model.Add(under_min >= teacher_weekly_min - weekly_load)
                objective_terms.append(under_min * teacher_weekly_under_weight)

            if teacher_weekly_hard_max:
                model.Add(weekly_load <= teacher_weekly_max)
            elif teacher_weekly_over_weight > 0:
                over_max = model.NewIntVar(0, weekly_capacity, f"teacher_over_max_{fid}")
                model.Add(over_max >= weekly_load - teacher_weekly_max)
                objective_terms.append(over_max * teacher_weekly_over_weight)

            if teacher_weekly_target > 0:
                if teacher_weekly_under_weight > 0:
                    under_target = model.NewIntVar(
                        0, teacher_weekly_target, f"teacher_under_target_{fid}"
                    )
                    model.Add(under_target >= teacher_weekly_target - weekly_load)
                    objective_terms.append(under_target * teacher_weekly_under_weight)
                if teacher_weekly_over_weight > 0:
                    over_target = model.NewIntVar(
                        0, weekly_capacity, f"teacher_over_target_{fid}"
                    )
                    model.Add(over_target >= weekly_load - teacher_weekly_target)
                    objective_terms.append(over_target * teacher_weekly_over_weight)

    # Avoid first/last period assignment for teachers.
    if teacher_boundary_enabled and teacher_boundary_weight > 0:
        valid_hours = [h for h in range(HOURS_PER_DAY) if h not in break_hours_set]
        if valid_hours:
            first_hour = valid_hours[0]
            last_hour = valid_hours[-1]
            for fid in faculty_ids:
                override = (
                    teacher_boundary_overrides.get(fid)
                    if isinstance(teacher_boundary_overrides.get(fid), dict)
                    else {}
                )
                avoid_first = _to_bool(override.get("avoidFirstPeriod"), teacher_boundary_avoid_first)
                avoid_last = _to_bool(override.get("avoidLastPeriod"), teacher_boundary_avoid_last)
                for day in range(DAYS_PER_WEEK):
                    if avoid_first:
                        objective_terms.append(
                            teacher_occ[(fid, day, first_hour)] * teacher_boundary_weight
                        )
                    if avoid_last and last_hour != first_hour:
                        objective_terms.append(
                            teacher_occ[(fid, day, last_hour)] * teacher_boundary_weight
                        )

    # Soft objective: reduce subject clustering within a day.
    if subject_cluster_enabled and subject_cluster_weight > 0:
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
                    excess = model.NewIntVar(
                        0, HOURS_PER_DAY, f"subj_day_excess_{class_id}_{subj_id}_{day}"
                    )
                    model.Add(excess >= day_count - subject_cluster_max)
                    objective_terms.append(excess * subject_cluster_weight)

    # Medium soft constraint: global front-loading per class across the full week.
    # Flatten class occupancy by (day, hour) order (excluding breaks) and penalize
    # any 0 -> 1 transition, which means an occupied slot after an empty slot.
    # This drives patterns toward: 111111000000 (empties at the end of the week).
    if front_loading_enabled and front_loading_weight > 0:
        for cls in classes:
            class_id = cls["_id"]
            days = int(cls.get("days_per_week") or DAYS_PER_WEEK)
            if days <= 0:
                continue

            flat_occ: List[cp_model.IntVar] = []
            for day in range(days):
                for hour in range(HOURS_PER_DAY):
                    if hour in break_hours_set:
                        continue
                    flat_occ.append(class_occ[(class_id, day, hour)])

            if len(flat_occ) <= 1:
                continue

            for i in range(len(flat_occ) - 1):
                prev_occ = flat_occ[i]
                next_occ = flat_occ[i + 1]
                violation = model.NewBoolVar(f"class_frontload_violation_{class_id}_{i}")
                # violation = 1 iff (prev_occ=0 and next_occ=1)
                model.Add(violation >= next_occ - prev_occ)
                model.Add(violation <= next_occ)
                model.Add(violation <= 1 - prev_occ)
                objective_terms.append(violation * front_loading_weight)

    if objective_terms:
        model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = solver_time_limit_sec
    solver.parameters.num_search_workers = max(1, int(os.getenv("SOLVER_WORKERS", "8")))
    solver.parameters.random_seed = random_seed

    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "ok": False,
            "error": f"Solver status: {solver.StatusName(status)}",
            "classes": classes,
            "unmet_requirements": unmet_requirements,
            "warnings": fixed_slot_warnings,
            "config": applied_config,
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
        block = lab_block_size if subj.get("type") == "lab" else theory_block_size
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
        "config": applied_config,
    }
