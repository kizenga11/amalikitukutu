"use client";

import { useEffect, useMemo, useState } from "react";
import {
  academicYears,
  termLabel,
  type TermNumber,
  yearLabel,
} from "@/lib/calendar";
import { readStoredPeriod, writeStoredPeriod, type StoredPeriod } from "@/lib/preferences";
import {
  fetchTeacherByAuth,
  fetchTeacherDashboard,
  type TeacherAssignmentGroup,
  type TeacherDashboardData,
} from "@/lib/school-api";
import { ListRowSkeleton } from "@/components/loading";

type Period = StoredPeriod;

function loadPeriod(): Period {
  return readStoredPeriod();
}

function persistPeriod(period: Period) {
  writeStoredPeriod(period);
}

function initialsOf(student: { first_name: string; last_name: string }): string {
  return (student.first_name[0] ?? "") + (student.last_name[0] ?? "");
}

export default function TeacherDashboard({ authUserId }: { authUserId: string }) {
  const [period, setPeriod] = useState<Period>(loadPeriod);
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [dbError, setDbError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notTeacher, setNotTeacher] = useState(false);

  useEffect(() => {
    persistPeriod(period);
  }, [period]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setDbError(false);
      setNotTeacher(false);

      try {
        const teacher = await fetchTeacherByAuth(authUserId);
        if (cancelled) return;
        if (!teacher) {
          setNotTeacher(true);
          setData(null);
          setDbError(false);
          setLoading(false);
          return;
        }
        const result = await fetchTeacherDashboard(teacher.id, period.yearId, period.term);
        if (cancelled) return;
        setData(result);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setDbError(true);
        setData(null);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [authUserId, period.yearId, period.term]);

  const terms = useMemo<TermNumber[]>(() => academicYears.find((y) => y.id === period.yearId)?.terms ?? [1, 2], [period.yearId]);

  const studentsByGroup = useMemo(() => {
    if (!data) return [];
    return data.assignments;
  }, [data]);

  const genderSplit = data?.genderDistribution ?? [
    { label: "Boys", value: 0 },
    { label: "Girls", value: 0 },
  ];

  let content: React.ReactNode;
  if (loading) {
    content = (
      <>
        <div className="stats-grid">
          {[0, 1, 2, 3].map((i) => <div className="stat-card stat-card--skeleton" key={i}><div className="skeleton skeleton--icon" /><div className="skeleton skeleton--value" /><div className="skeleton skeleton--label" /></div>)}
        </div>
        <div className="sm-table-wrap td-loading"><ListRowSkeleton cols={4} /><ListRowSkeleton cols={4} /><ListRowSkeleton cols={4} /></div>
      </>
    );
  } else if (dbError || (!data && !notTeacher)) {
    content = (
      <div className="db-empty">
        <h3>Could not load your teaching data</h3>
        <p>Make sure you have been assigned subjects and that the database is available.</p>
      </div>
    );
  } else if (notTeacher) {
    content = (
      <div className="db-empty">
        <h3>No teaching profile linked</h3>
        <p>Your account is not linked to a staff record, so no assignments can be shown. Ask the headmaster to register you as a teacher.</p>
      </div>
    );
  } else if (data && data.assignments.length === 0) {
    content = (
      <>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon--muted">0</span></div><div className="stat-value">0</div><div className="stat-label">Subjects</div></div>
          <div className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon--muted">0</span></div><div className="stat-value">0</div><div className="stat-label">Students</div></div>
          <div className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon--muted">0</span></div><div className="stat-value">0</div><div className="stat-label">Classes</div></div>
          <div className="stat-card"><div className="stat-top"><span className="stat-icon stat-icon--muted">0</span></div><div className="stat-value">—</div><div className="stat-label">Avg Performance</div></div>
        </div>
        <div className="db-empty">
          <h3>No teaching assignments yet</h3>
          <p>You have not been assigned any subjects yet. Ask the headmaster or academic officer to assign your teaching subjects.</p>
        </div>
      </>
    );
  } else if (data) {
    content = (
      <>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-top"><span className="stat-icon">◫</span></div>
            <div className="stat-value">{data.subjectCount.toLocaleString()}</div>
            <div className="stat-label">My Subjects</div>
          </div>
          <div className="stat-card">
            <div className="stat-top"><span className="stat-icon">◪</span></div>
            <div className="stat-value">{data.classCount.toLocaleString()}</div>
            <div className="stat-label">Classes Taught</div>
          </div>
          <div className="stat-card">
            <div className="stat-top"><span className="stat-icon">☺</span></div>
            <div className="stat-value">{data.studentCount.toLocaleString()}</div>
            <div className="stat-label">My Students</div>
          </div>
          <div className="stat-card">
            <div className="stat-top"><span className="stat-icon">%</span></div>
            <div className="stat-value">{data.avgPerformance}%</div>
            <div className="stat-label">Avg Performance</div>
          </div>
        </div>

        <div className="td-assign-section">
          <div className="panel-head td-assign-head">
            <div>
              <h3 className="panel-title">My Teaching Assignments</h3>
              <p className="panel-sub">{termLabel(period.term)} of {yearLabel(period.yearId)} · {data.enrollmentCount.toLocaleString()} subject enrollments across {data.classCount} class(es)</p>
            </div>
            <span className="panel-badge">{data.assignments.length} assignment{data.assignments.length === 1 ? "" : "s"}</span>
          </div>
          <div className="td-assign-grid">
            {studentsByGroup.map((group) => (
              <TeacherSubjectCard key={group.assignment_id} group={group} />
            ))}
          </div>
        </div>

        <div className="section-grid section-grid--alt">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">My Subject Performance</h3>
                <p className="panel-sub">End of term mean scores for your subjects</p>
              </div>
            </div>
            {data.subjectPerformance.length === 0 ? (
              <p className="td-none">No performance recorded for your subjects this term.</p>
            ) : (
              <table className="subject-table">
                <thead>
                  <tr><th>Subject</th><th>Class</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {data.subjectPerformance.map((row) => (
                    <tr key={`${row.subject}-${row.class}`}>
                      <td><div className="subject-name">{row.subject}</div><div className="subject-class">{row.class}</div></td>
                      <td>
                        <div className="score-bar">
                          <div className={`score-bar-fill${row.score >= 80 ? " score-bar-fill--good" : row.score >= 75 ? " score-bar-fill--mid" : " score-bar-fill--low"}`} style={{ width: `${row.score}%` }} />
                        </div>
                        <div className="score-value">
                          <strong>{row.score}%</strong>
                          <span className={row.up ? "trend trend--up" : "trend trend--down"}>{row.up ? "▲" : "▼"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">My Students by Gender</h3>
                <p className="panel-sub">Across all assigned subjects</p>
              </div>
            </div>
            <div className="td-gender">
              <div className="td-gender-bar">
                <div className="td-gender-bar-male" style={{ flex: genderSplit[0]?.value ?? 0 }} />
                <div className="td-gender-bar-female" style={{ flex: genderSplit[1]?.value ?? 0 }} />
              </div>
              <div className="legend">
                <div className="legend-item"><span className="legend-dot legend-dot--0" /><span>Boys</span><strong>{genderSplit[0]?.value ?? 0}%</strong></div>
                <div className="legend-item"><span className="legend-dot legend-dot--1" /><span>Girls</span><strong>{genderSplit[1]?.value ?? 0}%</strong></div>
              </div>
              <div className="td-gender-trend">
                {data.performanceTrend.map((p) => (
                  <span key={p.label} className="panel-badge">{p.label}: {p.value}%</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">My Teaching</h2>
          <p className="page-sub">Your assigned subjects and students for {termLabel(period.term)} of {yearLabel(period.yearId)}.</p>
        </div>
        <div className="page-head-right">
          <div className="period-picker">
            <label className="period-picker-label">
              <span>Academic Year</span>
              <select className="period-select" value={period.yearId} onChange={(e) => setPeriod({ ...period, yearId: e.target.value })}>
                {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
              </select>
            </label>
            <label className="period-picker-label">
              <span>Term</span>
              <select className="period-select" value={period.term} onChange={(e) => setPeriod({ ...period, term: Number(e.target.value) as TermNumber })}>
                {terms.map((t) => <option key={t} value={t}>{termLabel(t)}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>

      {content}
    </>
  );
}

function TeacherSubjectCard({ group }: { group: TeacherAssignmentGroup }) {
  return (
    <div className="td-subject-card">
      <div className="td-subject-head">
        <span className="sm-code">{group.subject_code}</span>
        <div className="td-subject-title-wrap">
          <div className="td-subject-title">{group.subject_name}</div>
          <div className="td-subject-meta">{group.class_name} · {group.stream_name} Stream</div>
        </div>
        <span className="td-subject-count">{group.students.length}</span>
      </div>

      {group.students.length === 0 ? (
        <p className="td-none">No students are enrolled in this subject yet.</p>
      ) : (
        <table className="td-student-table">
          <thead>
            <tr><th>#</th><th>Student</th><th>Sex</th><th>Phone</th></tr>
          </thead>
          <tbody>
            {group.students.slice(0, 8).map((s, i) => (
              <tr key={s.id}>
                <td className="td-num">{i + 1}</td>
                <td>
                  <div className="st-student">
                    <span className={`st-avatar${s.gender === "Female" ? " st-avatar--female" : ""}`}>
                      {initialsOf(s)}
                    </span>
                    <span>{s.last_name} {s.first_name}{s.middle_name ? ` ${s.middle_name}` : ""}</span>
                  </div>
                </td>
                <td><span className={`st-badge st-badge--${s.gender === "Male" ? "male" : "female"}`}>{s.gender}</span></td>
                <td><span className="st-phone">{s.phone ?? "—"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {group.students.length > 8 && (
        <p className="td-more">+{group.students.length - 8} more student{group.students.length - 8 === 1 ? "" : "s"}</p>
      )}
    </div>
  );
}