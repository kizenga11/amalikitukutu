# Timetable solver service

Small FastAPI + Google OR-Tools CP-SAT service used by the Next.js route
`POST /api/timetable/generate`.

## Run it

```bash
cd solver
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

Point the website at it:

```bash
# .env.local
SOLVER_URL=http://localhost:8001
```

When `SOLVER_URL` is unset the API route uses the TypeScript fallback solver
in `src/lib/timetable-solver.ts`, so local development works without Python.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe: `{"status":"ok"}` |
| `POST` | `/generate?timeLimit=60` | Solve one timetable |

`timeLimit` is clamped to `1..600` seconds. The request body is the solver
input from spec §9:

```json
{
  "days": [{ "id": 1, "slots": [{ "id": "...", "start": "07:30", "end": "08:10", "kind": "lesson", "label": null, "appliesTo": [] }] }],
  "classes": [{ "id": "..." }],
  "assignments": [{ "id": "...", "classId": "...", "subjectId": "...", "teacherId": "...", "periods": 6 }],
  "subjectPriority": { "...": 3 },
  "teacherUnavailable": [{ "teacherId": "...", "slotIds": ["..."] }],
  "teacherLimits": [{ "teacherId": "...", "maxPerDay": 6 }],
  "locked": [{ "assignmentId": "...", "slotId": "...", "size": 2 }],
  "rules": {
    "maxConsecutiveTeacher": 2,
    "oneSessionPerTeacherClassPerDay": true,
    "breaksCountAsRest": true,
    "morningEnds": "12:40",
    "timeLimit": 60,
    "weights": { "morning": 10, "adjacentDays": 3, "classGap": 6, "teacherGap": 4 }
  }
}
```

The response is:

```json
{
  "status": "optimal | feasible | infeasible",
  "objective": 12,
  "lessons": [
    {
      "assignmentId": "...",
      "classId": "...",
      "subjectId": "...",
      "teacherId": "...",
      "day": 1,
      "slotId": "...",
      "size": 2
    }
  ],
  "diagnostics": []
}
```

`assignmentId` is an extension to the wire format in the written spec. The
Next.js route also infers it when it is missing, so reference solvers keep
working. `teacherLimits` is a second, optional extension; omit it to disable
per-teacher daily maximums.

## Rules

Hard rules:

- a class has at most one lesson per slot;
- a teacher has at most one lesson per slot;
- doubles stay inside one class run (never across a break or closed special);
- teacher unavailability is honoured;
- an optional per-teacher daily maximum (`teacherLimits`) is honoured;
- locked `(assignment, slot, size)` triples are pinned;
- optionally, a teacher may only meet a class once per day;
- a teacher never exceeds `maxConsecutiveTeacher` consecutive open slots
  (breaks count as rest when `breaksCountAsRest` is true).

Soft rules (weighted penalty, minimised):

- high-priority subjects early (`subjectPriority` × `weights.morning` when the
  slot starts at/after `morningEnds`);
- teachers avoid working on adjacent days (`weights.adjacentDays`);
- classes and teachers avoid gaps between lessons (`weights.classGap`,
  `weights.teacherGap`).

Periods are split with the spec rule: `6 → [2,2,2]`, `5 → [2,2,1]`,
`4 → [2,2]`, `3 → [2,1]`, `2 → [2]`, `1 → [1]`.

## Tests

```bash
cd solver
pytest
```

The tests build the sample input from `timetable.txt`, plus capacity, lock,
unavailability, double-block, and consecutive-teacher cases.

## Fixes over the reference snippet

- Adjacent-day penalty is fully reified (`adj ↔ works ∧ worksNext`); the
  reference only enforced one direction, so the objective under-counted.
- A locked lesson with no valid starting slot now reports an infeasible
  diagnostic instead of being silently dropped.
- Unknown slot ids in `teacherUnavailable` no longer raise `KeyError`.
- Day ids may be strings (`"MON"`) or numbers (`1`).
- Consecutive windows are only constrained when the whole window has candidate
  variables.
- Output lessons include `assignmentId`, `objective` is always an integer, and
  `diagnostics` is always present.
- Empty `appliesTo` on a special period means "applies to every class", which
  keeps the Python solver consistent with the UI and validator.

## Deployment

Run the service anywhere the Next.js server can reach it (Docker, Fly.io,
Cloud Run, a school server). A minimal container:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

Set `SOLVER_URL` in the website environment. The route already applies a
timeout of `timeLimit + 15` seconds and falls back to the TypeScript solver
only when `SOLVER_URL` is not configured; a configured-but-unreachable service
returns a `502` so failures stay visible.
