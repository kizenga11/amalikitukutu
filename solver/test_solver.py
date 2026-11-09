"""Tests for the OR-Tools timetable service.

Run from the repository root::

    pip install -r solver/requirements.txt
    pytest solver

These tests need OR-Tools; they are intentionally separate from the
TypeScript test suite so ``npm test`` keeps working without Python.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from solver import InfeasibleError, precheck, solve, split_blocks

SAMPLE = json.loads((Path(__file__).resolve().parent / "sample-input.json").read_text("utf-8"))


@pytest.mark.parametrize(
    ("periods", "expected"),
    [
        (6, [2, 2, 2]),
        (5, [2, 2, 1]),
        (4, [2, 2]),
        (3, [2, 1]),
        (2, [2]),
        (1, [1]),
        (0, []),
    ],
)
def test_split_blocks(periods, expected):
    assert split_blocks(periods) == expected


def test_sample_input_solves_without_clashes():
    result = solve(copy.deepcopy(SAMPLE), time_limit=10)

    assert result["status"] in ("optimal", "feasible")
    assert len(result["lessons"]) == 4
    assert all(lesson.get("assignmentId") for lesson in result["lessons"])

    class_cells = []
    teacher_cells = []
    for lesson in result["lessons"]:
        day = next(entry for entry in SAMPLE["days"] if entry["id"] == lesson["day"])
        index = next(i for i, slot in enumerate(day["slots"]) if slot["id"] == lesson["slotId"])
        class_cells.append((lesson["classId"], day["id"], index))
        teacher_cells.append((lesson["teacherId"], day["id"], index))
        if lesson["size"] == 2:
            class_cells.append((lesson["classId"], day["id"], index + 1))
            teacher_cells.append((lesson["teacherId"], day["id"], index + 1))

    assert len(set(class_cells)) == len(class_cells)
    assert len(set(teacher_cells)) == len(teacher_cells)


def test_precheck_reports_class_capacity():
    data = copy.deepcopy(SAMPLE)
    data["assignments"][0]["periods"] = 5

    starts = {
        "IA": {1: [1, 2, 3, 4], 2: [1, 2, 3]},
        "IB": {1: [1, 2, 3, 4], 2: [1, 2, 3]},
    }
    issues = precheck(data, starts, 1)
    assert any("Class IA" in issue for issue in issues)


def test_precheck_reports_weekly_capacity_before_solving():
    data = copy.deepcopy(SAMPLE)
    data["assignments"][0]["periods"] = 5
    with pytest.raises(InfeasibleError) as error:
        solve(data, time_limit=5)
    assert any("Class IA" in issue for issue in error.value.issues)


def test_locked_lesson_keeps_its_slot():
    data = copy.deepcopy(SAMPLE)
    data["locked"] = [{"assignmentId": "a1", "slotId": "MON-2", "size": 2}]

    result = solve(data, time_limit=10)
    locked = next(lesson for lesson in result["lessons"] if lesson["assignmentId"] == "a1")
    assert locked["slotId"] == "MON-2"
    assert locked["size"] == 2


def test_impossible_lock_is_reported():
    data = copy.deepcopy(SAMPLE)
    data["locked"] = [{"assignmentId": "a1", "slotId": "MON-T", "size": 2}]

    with pytest.raises(InfeasibleError) as error:
        solve(data, time_limit=5)
    assert any("locked lesson" in issue.lower() for issue in error.value.issues)


def test_teacher_never_gets_three_consecutive_slots():
    days = [
        {
            "id": 1,
            "slots": [
                {
                    "id": f"S{index}",
                    "start": f"{7 + index // 2:02d}:{(index % 2) * 30:02d}",
                    "end": f"{7 + (index + 1) // 2:02d}:{((index + 1) % 2) * 30:02d}",
                    "kind": "lesson",
                }
                for index in range(1, 8)
            ],
        }
    ]
    data = {
        "days": days,
        "classes": [{"id": "C1"}],
        "assignments": [
            {"id": f"a{index}", "classId": "C1", "subjectId": f"S{index}", "teacherId": "T1", "periods": 1}
            for index in range(1, 4)
        ],
        "subjectPriority": {},
        "teacherUnavailable": [],
        "locked": [],
        "rules": {"oneSessionPerTeacherClassPerDay": False, "maxConsecutiveTeacher": 2},
    }

    result = solve(data, time_limit=10)
    positions = sorted(int(lesson["slotId"][1:]) for lesson in result["lessons"])
    for index in range(len(positions) - 2):
        assert not (
            positions[index + 1] == positions[index] + 1
            and positions[index + 2] == positions[index] + 2
        )


def test_double_block_never_crosses_a_break():
    days = [
        {
            "id": 1,
            "slots": [
                {"id": "L1", "start": "07:30", "end": "08:10", "kind": "lesson"},
                {"id": "B1", "start": "08:10", "end": "08:40", "kind": "break"},
                {"id": "L2", "start": "08:40", "end": "09:20", "kind": "lesson"},
                {"id": "L3", "start": "09:20", "end": "10:00", "kind": "lesson"},
            ],
        }
    ]
    data = {
        "days": days,
        "classes": [{"id": "C1"}],
        "assignments": [
            {"id": "a1", "classId": "C1", "subjectId": "MATH", "teacherId": "T1", "periods": 2}
        ],
        "subjectPriority": {},
        "teacherUnavailable": [],
        "locked": [],
        "rules": {},
    }

    result = solve(data, time_limit=10)
    lesson = result["lessons"][0]
    assert lesson["size"] == 2
    assert lesson["slotId"] == "L2"


def test_teacher_unavailable_slot_is_respected():
    data = copy.deepcopy(SAMPLE)
    data["teacherUnavailable"] = [{"teacherId": "Kaiza", "slotIds": ["MON-1", "MON-2"]}]

    result = solve(data, time_limit=10)
    kaiza = next(lesson for lesson in result["lessons"] if lesson["teacherId"] == "Kaiza")
    assert kaiza["slotId"] not in ("MON-1", "MON-2")


def _daily_limit_input(periods):
    days = [
        {
            "id": day,
            "slots": [
                {"id": f"D{day}L{index}", "start": f"{8 + index:02d}:00", "end": f"{9 + index:02d}:00", "kind": "lesson"}
                for index in range(1, 3)
            ],
        }
        for day in (1, 2)
    ]
    return {
        "days": days,
        "classes": [{"id": "C1"}],
        "assignments": [
            {
                "id": f"a{index}",
                "classId": "C1",
                "subjectId": f"S{index}",
                "teacherId": "T1",
                "periods": 1,
            }
            for index in range(1, periods + 1)
        ],
        "subjectPriority": {},
        "teacherUnavailable": [],
        "teacherLimits": [{"teacherId": "T1", "maxPerDay": 1}],
        "locked": [],
        "rules": {"oneSessionPerTeacherClassPerDay": False},
    }


def test_teacher_daily_limit_spreads_lessons():
    result = solve(_daily_limit_input(2), time_limit=10)
    assert result["status"] in ("optimal", "feasible")
    assert len({lesson["day"] for lesson in result["lessons"]}) == 2


def test_teacher_daily_limit_precheck_is_reported():
    with pytest.raises(InfeasibleError) as error:
        solve(_daily_limit_input(3), time_limit=5)
    assert any("daily maximum" in issue for issue in error.value.issues)
