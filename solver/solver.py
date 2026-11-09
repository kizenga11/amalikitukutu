"""OR-Tools CP-SAT timetable solver.

Contract (see ``timetable.txt`` §9 and ``src/lib/timetable.ts``)::

    input  = {days, classes, assignments, subjectPriority,
              teacherUnavailable, locked, rules}
    output = {status, objective, lessons, diagnostics}

Each lesson returned also carries ``assignmentId`` so the Next.js route can
persist it without guessing. ``status`` is one of ``optimal``, ``feasible`` or
``infeasible``.

Compared with the reference snippet in ``timetable.txt`` this module fixes:

* adjacent-day soft penalties are now correctly bounded (reference only
  implied ``adj => w and next``);
* locked lessons that cannot be placed are reported instead of silently
  ignored;
* missing slot ids in ``teacherUnavailable`` no longer raise ``KeyError``;
* day ids may be strings or numbers;
* pre-checks tolerate classes without slots;
* consecutive-teacher windows are only constrained when the window exists;
* every output lesson includes ``assignmentId``;
* optional per-teacher daily maximums (``teacherLimits``) are enforced.
"""

from __future__ import annotations

from collections import defaultdict

from ortools.sat.python import cp_model

DEFAULT_RULES = {
    "maxConsecutiveTeacher": 2,
    "oneSessionPerTeacherClassPerDay": True,
    "breaksCountAsRest": True,
    "morningEnds": "12:40",
    "weights": {"morning": 10, "adjacentDays": 3, "classGap": 6, "teacherGap": 4},
}


class InfeasibleError(Exception):
    """Raised when the input is provably impossible before/while solving."""

    def __init__(self, issues):
        if isinstance(issues, str):
            issues = [issues]
        super().__init__("; ".join(issues))
        self.issues = list(issues)


def mins(value):
    hours, minutes = str(value).split(":")
    return int(hours) * 60 + int(minutes)


def split_blocks(periods):
    """6 -> [2, 2, 2] · 5 -> [2, 2, 1] · 3 -> [2, 1] · 1 -> [1]."""
    count = max(0, int(periods or 0))
    return [2] * (count // 2) + ([1] if count % 2 else [])


def merge_rules(partial):
    partial = partial or {}
    rules = {**DEFAULT_RULES, **partial}
    rules["weights"] = {**DEFAULT_RULES["weights"], **(partial.get("weights") or {})}
    rules["maxConsecutiveTeacher"] = max(1, min(6, int(rules.get("maxConsecutiveTeacher") or 2)))
    rules["oneSessionPerTeacherClassPerDay"] = bool(
        rules.get("oneSessionPerTeacherClassPerDay", True)
    )
    rules["breaksCountAsRest"] = bool(rules.get("breaksCountAsRest", True))
    if not _valid_time(rules.get("morningEnds")):
        rules["morningEnds"] = DEFAULT_RULES["morningEnds"]
    return rules


def _valid_time(value):
    try:
        hours, minutes = str(value).split(":")
        return 0 <= int(hours) < 24 and 0 <= int(minutes) < 60
    except (TypeError, ValueError):
        return False


def precheck(data, starts, n_days):
    issues = []
    per_class = defaultdict(int)
    per_teacher = defaultdict(int)
    per_tc = defaultdict(int)

    for assignment in data.get("assignments", []):
        per_class[assignment["classId"]] += assignment.get("periods", 0)
        per_teacher[assignment["teacherId"]] += assignment.get("periods", 0)
        per_tc[assignment["teacherId"], assignment["classId"]] += len(
            split_blocks(assignment.get("periods", 0))
        )

    for class_id, periods in per_class.items():
        capacity = len(starts.get(class_id, {}).get(1, []))
        if periods > capacity:
            issues.append(
                f"Class {class_id}: {periods} periods assigned but only "
                f"{capacity} lesson slots per week."
            )

    rules = data.get("rules", {})
    if rules.get("oneSessionPerTeacherClassPerDay", True):
        for (teacher_id, class_id), sessions in per_tc.items():
            if sessions > n_days:
                issues.append(
                    f"Teacher {teacher_id} needs {sessions} separate sessions in "
                    f"class {class_id} but there are only {n_days} days."
                )

    limits = {
        entry.get("teacherId"): int(entry.get("maxPerDay") or 0)
        for entry in data.get("teacherLimits", []) or []
    }
    for teacher_id, periods in per_teacher.items():
        limit = limits.get(teacher_id) or 0
        if limit > 0 and periods > limit * n_days:
            issues.append(
                f"Teacher {teacher_id}: {periods} periods scheduled but the "
                f"daily maximum is {limit} over {n_days} days."
            )

    total_slots = len({gid for class_starts in starts.values() for gid in class_starts.get(1, [])})
    for teacher_id, periods in per_teacher.items():
        if periods > total_slots:
            issues.append(
                f"Teacher {teacher_id}: {periods} periods but only "
                f"{total_slots} lesson slots exist."
            )
    return issues


def solve(data, time_limit=60):
    """Solve one timetable problem and return the solver output dict."""

    rules = merge_rules(data.get("rules"))
    weights = rules["weights"]
    days = data.get("days", [])

    slots = []
    for day_index, day in enumerate(days):
        for slot in day.get("slots", []):
            slots.append({**slot, "day": day_index, "gid": len(slots)})
    gid_of = {slot["id"]: slot["gid"] for slot in slots}

    # Day id in the output comes from the input; it may be a number or a string.
    day_ids = [day.get("id", index + 1) for index, day in enumerate(days)]

    def class_open(class_id, slot):
        if slot.get("kind") == "lesson":
            return True
        if slot.get("kind") != "special":
            return False
        scope = slot.get("appliesTo") or []
        if not scope or "*" in scope:
            return False
        return class_id not in scope

    def teacher_open(slot):
        if slot.get("kind") == "break":
            return False
        if slot.get("kind") == "special":
            scope = slot.get("appliesTo") or []
            if not scope or "*" in scope:
                return False
        return True

    def runs(open_fn):
        result = []
        for day_index in range(len(days)):
            current = []
            for slot in (s for s in slots if s["day"] == day_index):
                if open_fn(slot):
                    current.append(slot["gid"])
                elif current:
                    result.append(current)
                    current = []
            if current:
                result.append(current)
        return result

    class_ids = [cls["id"] for cls in data.get("classes", [])]
    class_runs = {
        class_id: runs(lambda slot, cid=class_id: class_open(cid, slot))
        for class_id in class_ids
    }
    starts = {
        class_id: {
            1: [gid for run in class_run for gid in run],
            2: [gid for run in class_run for gid in run[:-1]],
        }
        for class_id, class_run in class_runs.items()
    }

    if rules["breaksCountAsRest"]:
        teacher_runs = runs(teacher_open)
    else:
        teacher_runs = [
            [slot["gid"] for slot in slots if slot["day"] == day_index and teacher_open(slot)]
            for day_index in range(len(days))
        ]

    issues = precheck({**data, "rules": rules}, starts, len(days))
    if issues:
        raise InfeasibleError(issues)

    blocks = []
    for index, assignment in enumerate(data.get("assignments", [])):
        for position, size in enumerate(split_blocks(assignment.get("periods", 0))):
            blocks.append(
                {
                    "id": f"{assignment['id']}#{position}",
                    "assignmentId": assignment["id"],
                    "cid": assignment["classId"],
                    "sid": assignment["subjectId"],
                    "tid": assignment["teacherId"],
                    "size": size,
                }
            )

    unavailable = set()
    for entry in data.get("teacherUnavailable", []) or []:
        teacher_id = entry.get("teacherId")
        for slot_id in entry.get("slotIds", []) or []:
            if slot_id in gid_of:
                unavailable.add((teacher_id, gid_of[slot_id]))

    model = cp_model.CpModel()
    x = {}
    cover_class = defaultdict(list)
    cover_teacher = defaultdict(list)
    per_tc_day = defaultdict(list)
    per_t_day = defaultdict(list)

    for block_index, block in enumerate(blocks):
        class_starts = starts.get(block["cid"], {1: [], 2: []})
        options = []
        for gid in class_starts.get(block["size"], []):
            cells = list(range(gid, gid + block["size"]))
            # Double blocks must not cross a break or closed special.
            if any(slots[cell]["day"] != slots[gid]["day"] for cell in cells):
                continue
            if any((block["tid"], cell) in unavailable for cell in cells):
                continue
            variable = model.NewBoolVar(f"x_{block_index}_{gid}")
            x[block_index, gid] = variable
            options.append(variable)
            for cell in cells:
                cover_class[block["cid"], cell].append(variable)
                cover_teacher[block["tid"], cell].append(variable)
            day_index = slots[gid]["day"]
            per_tc_day[block["tid"], block["cid"], day_index].append(variable)
            per_t_day[block["tid"], day_index].append(variable)

        if not options:
            raise InfeasibleError(
                f'No valid position for {block["id"]} '
                f'(class {block["cid"]}, teacher {block["tid"]}).'
            )
        model.AddExactlyOne(options)

    # Locked lessons keep their exact slot and block size.
    used_blocks = set()
    for locked in data.get("locked", []) or []:
        gid = gid_of.get(locked.get("slotId"))
        matched = False
        if gid is not None:
            for block_index, block in enumerate(blocks):
                if block_index in used_blocks:
                    continue
                if (
                    block["assignmentId"] == locked.get("assignmentId")
                    and block["size"] == locked.get("size")
                    and (block_index, gid) in x
                ):
                    model.Add(x[block_index, gid] == 1)
                    used_blocks.add(block_index)
                    matched = True
                    break
        if not matched:
            raise InfeasibleError(
                "A locked lesson cannot be placed at slot "
                f"{locked.get('slotId')}. Unlock it or restore the slot."
            )

    # Hard constraints: one class cell, one teacher cell, one session per day.
    for variables in cover_class.values():
        model.AddAtMostOne(variables)
    for variables in cover_teacher.values():
        model.AddAtMostOne(variables)
    if rules["oneSessionPerTeacherClassPerDay"]:
        for variables in per_tc_day.values():
            model.AddAtMostOne(variables)

    # Optional per-teacher daily maximum (extension to spec §9).
    teacher_limits = {
        entry.get("teacherId"): int(entry.get("maxPerDay") or 0)
        for entry in data.get("teacherLimits", []) or []
    }
    for teacher_id, limit in teacher_limits.items():
        if limit <= 0:
            continue
        for day_index in range(len(days)):
            terms = [
                cover_teacher[teacher_id, slot["gid"]]
                for slot in slots
                if slot["day"] == day_index and cover_teacher.get((teacher_id, slot["gid"]))
            ]
            if not terms:
                continue
            model.Add(sum(sum(term) for term in terms) <= limit)

    max_consecutive = rules["maxConsecutiveTeacher"]
    teachers = {block["tid"] for block in blocks}
    for teacher_id in teachers:
        for run in teacher_runs:
            for start in range(len(run) - max_consecutive):
                window = run[start : start + max_consecutive + 1]
                terms = [cover_teacher[teacher_id, gid] for gid in window]
                # Skip windows where the teacher can teach nothing. They cannot
                # exceed the limit and empty OR-Tools lists are not valid input.
                if any(not terms_entry for terms_entry in terms):
                    continue
                model.Add(sum(sum(term) for term in terms) <= max_consecutive)

    # Soft constraints.
    penalty = []
    cutoff = mins(rules["morningEnds"])
    priority = data.get("subjectPriority", {}) or {}

    for (block_index, gid), variable in x.items():
        block = blocks[block_index]
        subject_priority = int(priority.get(block["sid"], 0) or 0)
        if subject_priority <= 0:
            continue
        late_cells = sum(
            1
            for cell in range(gid, gid + block["size"])
            if mins(slots[cell]["start"]) >= cutoff
        )
        if late_cells:
            penalty.append(weights["morning"] * subject_priority * late_cells * variable)

    works = {}
    for (teacher_id, day_index), variables in per_t_day.items():
        working = model.NewBoolVar(f"w_{teacher_id}_{day_index}")
        model.AddMaxEquality(working, variables)
        works[teacher_id, day_index] = working
    for (teacher_id, day_index), working in works.items():
        following = works.get((teacher_id, day_index + 1))
        if following is None:
            continue
        adjacent = model.NewBoolVar(f"adj_{teacher_id}_{day_index}")
        model.AddImplication(adjacent, working)
        model.AddImplication(adjacent, following)
        model.AddBoolOr([working.Not(), following.Not(), adjacent])
        penalty.append(weights["adjacentDays"] * adjacent)

    def add_gaps(cover, run, key, weight):
        for before, middle, after in zip(run, run[1:], run[2:]):
            entry_before = cover.get((key, before))
            entry_after = cover.get((key, after))
            if not entry_before or not entry_after:
                continue
            entry_middle = cover.get((key, middle)) or []
            gap = model.NewBoolVar(f"gap_{key}_{before}")
            model.Add(gap >= sum(entry_before) + sum(entry_after) - sum(entry_middle) - 1)
            penalty.append(weight * gap)

    for class_id in class_ids:
        for run in class_runs[class_id]:
            add_gaps(cover_class, run, class_id, weights["classGap"])
    for teacher_id in teachers:
        for run in teacher_runs:
            add_gaps(cover_teacher, run, teacher_id, weights["teacherGap"])

    if penalty:
        model.Minimize(sum(penalty))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(1, min(600, int(time_limit or 60)))
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "status": "infeasible",
            "objective": None,
            "lessons": [],
            "diagnostics": [
                "No timetable satisfies all hard rules. "
                "Relax a rule, add slots, or reduce subject periods."
            ],
        }

    lessons = []
    for (block_index, gid), variable in x.items():
        if not solver.Value(variable):
            continue
        block = blocks[block_index]
        slot = slots[gid]
        lessons.append(
            {
                "assignmentId": block["assignmentId"],
                "classId": block["cid"],
                "subjectId": block["sid"],
                "teacherId": block["tid"],
                "day": day_ids[slot["day"]],
                "slotId": slot["id"],
                "size": block["size"],
            }
        )

    objective = int(round(solver.ObjectiveValue())) if penalty else 0
    return {
        "status": "optimal" if status == cp_model.OPTIMAL else "feasible",
        "objective": objective,
        "lessons": lessons,
        "diagnostics": [],
    }
