"""FastAPI wrapper around the OR-Tools timetable solver.

Run locally::

    pip install -r requirements.txt
    uvicorn main:app --host 0.0.0.0 --port 8001

Then set ``SOLVER_URL=http://localhost:8001`` in the Next.js ``.env.local``.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from solver import InfeasibleError, solve

app = FastAPI(title="Amali Timetable Solver", version="1.0.0")

# The Next.js route calls this service server-to-server. CORS is enabled only so
# the service can also be exercised from a browser during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/generate")
def generate(payload: dict, timeLimit: int = 60) -> dict:
    try:
        return solve(payload, timeLimit)
    except InfeasibleError as error:
        return {
            "status": "infeasible",
            "objective": None,
            "lessons": [],
            "diagnostics": error.issues,
        }
