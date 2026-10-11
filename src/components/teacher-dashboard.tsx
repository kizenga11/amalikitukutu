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

export default function TeacherDashboard({
  authUserId,
  onNavigate,
  quickLinks,
}: {
  authUserId: string;
  onNavigate: (key: string) => void;
  quickLinks: { key: string; label: string; icon: React.ReactNode }[];
}) {
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
        <p>Your account is not linked to a staff record. Ask the headmaster to register you as a teacher.</p>
      </div>
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

        {quickLinks.length > 0 && (
          <div className="td-quick">
            {quickLinks.map((link) => (
              <button key={link.key} type="button" className="td-quick-btn" onClick={() => onNavigate(link.key)}>
                <span className="td-quick-icon">{link.icon}</span>
                <span>{link.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="panel td-perf-panel">
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
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-sub">Overview for {termLabel(period.term)} of {yearLabel(period.yearId)}.</p>
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

      <div className="td-dash">
        {content}
      </div>
    </>
  );
}