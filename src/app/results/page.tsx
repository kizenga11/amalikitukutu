"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

interface PublicExam {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface PublicSubject {
  subject_code: string;
  subject_name: string;
  score: number | null;
  grade: string;
  points: number;
  is_absent: boolean;
}

interface PublicStudent {
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string;
  class_name: string;
  stream_name: string;
  rank: number;
  avg: number | null;
  grade: string;
  points: number | null;
  division: string;
  divisionCode: string;
  incomplete: boolean;
  subjects: PublicSubject[];
}

interface ResultsPayload {
  exam: PublicExam;
  students: PublicStudent[];
}

function displayNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function genderLabel(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.startsWith("f") ? "F" : normalized.startsWith("m") ? "M" : value;
}

function formatDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateRange(start: string, end: string): string {
  const d1 = formatDate(start);
  const d2 = formatDate(end);
  return end && end !== start ? `${d1} – ${d2}` : d1;
}

function fullName(student: PublicStudent): string {
  return `${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ""} ${student.last_name}`;
}

function ResultsView() {
  const searchParams = useSearchParams();
  const [exams, setExams] = useState<PublicExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/public-exams")
      .then((res) => res.json())
      .then((payload: { exams: PublicExam[] }) => {
        const list = Array.isArray(payload.exams) ? payload.exams : [];
        setExams(list);
        const initial = searchParams.get("exam") ?? "";
        setSelectedExamId(initial || list[0]?.id || "");
      })
      .catch(() => setError("Could not load exams."))
      .finally(() => setLoadingList(false));
  }, [searchParams]);

  useEffect(() => {
    if (!selectedExamId) {
      setData(null);
      setSelectedStudentId("");
      return;
    }
    let active = true;
    setLoadingResults(true);
    setError("");
    setSelectedStudentId("");
    fetch(`/api/public-results?examId=${encodeURIComponent(selectedExamId)}`)
      .then((res) => res.json())
      .then((payload: Partial<ResultsPayload> & { error?: string }) => {
        if (!active) return;
        if (!payload || !Array.isArray(payload.students)) {
          setData(null);
          if (payload.error) setError(payload.error);
          return;
        }
        setData(payload as ResultsPayload);
      })
      .catch(() => {
        if (active) setError("Could not load results for this exam.");
      })
      .finally(() => {
        if (active) setLoadingResults(false);
      });
    return () => {
      active = false;
    };
  }, [selectedExamId]);

  const selectExam = useCallback((examId: string) => {
    setSelectedExamId(examId);
    const url = new URL(window.location.href);
    if (examId) url.searchParams.set("exam", examId);
    else url.searchParams.delete("exam");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return data.students;
    return data.students.filter((student) => {
      const name = fullName(student).toLowerCase();
      return keyword.split(/\s+/).every((part) => name.includes(part));
    });
  }, [data, search]);

  const selectedStudent = data?.students.find((student) => student.student_id === selectedStudentId) ?? null;

  return (
    <div className="site-landing">
      <header className="site-header">
        <div className="container header-flex">
          <div className="logo">
            <a href="/" aria-label="Amali Kitukutu home">
              <img src="/assets/logo.png" alt="Amali Kitukutu Logo" />
            </a>
            <div className="logo-text">
              <strong>Amali Kitukutu</strong>
              <span>Kitukutu Technical Secondary School</span>
            </div>
          </div>
          <nav className="nav-desktop">
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/#results">Results</a></li>
              <li><a href="/login" className="login-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg> Staff Login</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <section className="results-section results-section-public" id="results">
        <div className="results-container">
          <div className="results-header">
            <h2 className="results-title">Matokeo ya Mitihani</h2>
            <p className="results-subtitle">Tafuta jina la mwanafunzi kisha bonyeza kuona matokeo yake. Kama kuna mitihani mingi, chagua mtihani.</p>
          </div>

          <div className="results-search-wrap">
            <label className="res-select-label">Mtihani</label>
            <select
              className="results-exam-select"
              value={selectedExamId}
              onChange={(event) => selectExam(event.target.value)}
              disabled={loadingList || exams.length === 0}
            >
              {loadingList ? <option>Loading exams…</option> : exams.length === 0 ? <option value="">Hakuna mitihani iliyochapishwa</option> : exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} ({formatDateRange(exam.start_date, exam.end_date)})</option>)}
            </select>
          </div>

          {loadingResults ? (
            <div className="results-loading">Inapakia matokeo…</div>
          ) : error ? (
            <div className="results-empty"><p style={{ fontSize: 15, fontWeight: 600, color: "#495057" }}>{error}</p></div>
          ) : !data || data.students.length === 0 ? (
            <div className="results-empty">
              <p style={{ fontSize: 15, fontWeight: 600, color: "#495057", marginBottom: 6 }}>Hakuna matokeo kwa mtihani huu</p>
              <p style={{ fontSize: 13 }}>Matokeo ya mitihani yataonekana hapa baada ya kuchapishwa.</p>
            </div>
          ) : (
            <>
              <div className="results-search-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
                <input
                  type="search"
                  placeholder="Tafuta jina la mwanafunzi…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="results-search-input"
                />
              </div>

              {!selectedStudent && (
                <>
                  <p className="results-hint">{filtered.length > 0 ? `Wanafunzi ${filtered.length} — bonyeza jina ili kuona matokeo` : "Hakuna mwanafunzi anayefanana na tafuta."}</p>
                  <div className="results-list">
                    {filtered.map((student) => (
                      <button
                        key={student.student_id}
                        type="button"
                        className="results-student-btn"
                        onClick={() => setSelectedStudentId(student.student_id)}
                      >
                        <span className="results-student-name">{fullName(student)}</span>
                        <span className="results-student-meta">{student.class_name}{student.stream_name && student.stream_name !== "—" ? ` · ${student.stream_name}` : ""}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {selectedStudent && (
                <div className="results-slip">
                  <div className="slip-head">
                    <div>
                      <h3 className="slip-title">Matokeo ya Mwanafunzi</h3>
                      <p className="slip-exam">{data.exam.name} — {formatDateRange(data.exam.start_date, data.exam.end_date)}</p>
                    </div>
                    <button
                      type="button"
                      className="slip-close"
                      onClick={() => setSelectedStudentId("")}
                      aria-label="Back to student list"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                      Waliotangulia
                    </button>
                  </div>

                  <div className="slip-student">{fullName(selectedStudent)}</div>
                  <p className="slip-meta">
                    {selectedStudent.class_name}{selectedStudent.stream_name && selectedStudent.stream_name !== "—" ? ` · ${selectedStudent.stream_name}` : ""} · {genderLabel(selectedStudent.gender)} · Nafasi ya {selectedStudent.incomplete ? "—" : `#${selectedStudent.rank}`}
                  </p>

                  <div className="slip-summary">
                    <div><span>Average (%)</span><strong>{displayNumber(selectedStudent.avg)}</strong></div>
                    <div><span>Grade</span><strong>{selectedStudent.grade}</strong></div>
                    <div><span>Points</span><strong>{displayNumber(selectedStudent.points)}</strong></div>
                    <div><span>Division</span><strong>{selectedStudent.incomplete ? "INC" : selectedStudent.divisionCode}</strong></div>
                  </div>

                  <div className="slip-table-wrap">
                    <table className="slip-table">
                      <thead>
                        <tr><th>#</th><th>Subject</th><th>Score</th><th>Grade</th><th>Pts</th></tr>
                      </thead>
                      <tbody>
                        {selectedStudent.subjects.map((subject, index) => (
                          <tr key={`${subject.subject_code}-${index}`}>
                            <td>{index + 1}</td>
                            <td><strong>{subject.subject_code}</strong> — {subject.subject_name}</td>
                            <td>{subject.is_absent ? "ABS" : displayNumber(subject.score)}</td>
                            <td>{subject.grade}</td>
                            <td>{subject.grade === "ABS" ? "—" : subject.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedStudent && (
                <div className="results-empty results-choose-another">
                  <p>Una matokeo mengine? Chagua mtihani mwingine hapo juu kuona matokeo ya mtihani huo.</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">© 2026 Amali Kitukutu Technical School School Management System | All Rights Reserved</div>
        </div>
      </footer>
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="site-landing"><section className="results-section" style={{ minHeight: "50vh", display: "grid", placeItems: "center" }}><p>Inapakia…</p></section></div>}>
      <ResultsView />
    </Suspense>
  );
}