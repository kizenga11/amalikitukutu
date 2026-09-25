"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SCHOOL_INFO,
  fetchEnrollmentStatistics,
  fetchSchoolInfo,
  type EnrollmentStatistics,
  type EnrollmentStreamStat,
  type SchoolInfo,
} from "@/lib/school-api";

function number(value: number): string {
  return value.toLocaleString("en-US");
}

function streamLabel(row: EnrollmentStreamStat): string {
  return row.streamName === "Unassigned" ? row.className : `${row.className} — ${row.streamName}`;
}

export default function StudentEnrollmentStatistics() {
  const [data, setData] = useState<EnrollmentStatistics | null>(null);
  const [school, setSchool] = useState<SchoolInfo>(DEFAULT_SCHOOL_INFO);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStreamId, setSelectedStreamId] = useState("");
  const [printAllSubjects, setPrintAllSubjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetchEnrollmentStatistics(), fetchSchoolInfo()])
      .then(([statistics, schoolInfo]) => {
        if (!active) return;
        setData(statistics);
        setSchool(schoolInfo);
      })
      .catch(() => {
        if (active) setError("The enrollment report could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedSubject = useMemo(
    () => data?.subjects.find((subject) => subject.subjectId === selectedSubjectId) ?? null,
    [data, selectedSubjectId],
  );
  const classes = useMemo(
    () => Array.from(new Map((data?.streams ?? [])
      .map((stream) => [stream.classId ?? "unassigned", { id: stream.classId ?? "unassigned", name: stream.className, formLevel: stream.formLevel }])).values())
      .sort((a, b) => (a.formLevel ?? 99) - (b.formLevel ?? 99) || a.name.localeCompare(b.name)),
    [data],
  );
  const availableStreams = useMemo(
    () => (data?.streams ?? []).filter((stream) =>
      !selectedClassId || (stream.classId ?? "unassigned") === selectedClassId,
    ),
    [data, selectedClassId],
  );
  const scopedRows = useMemo(
    () => (rows: EnrollmentStreamStat[]) => rows.filter((row) =>
      (!selectedClassId || (row.classId ?? "unassigned") === selectedClassId) &&
      (!selectedStreamId || (row.streamId ?? "unassigned") === selectedStreamId),
    ),
    [selectedClassId, selectedStreamId],
  );
  const printSubjects = useMemo(
    () => (data?.subjects ?? []).filter((subject) => scopedRows(subject.streams).length > 0),
    [data, scopedRows],
  );
  const scopeLabel = useMemo(() => {
    const cls = classes.find((c) => c.id === selectedClassId);
    const stream = availableStreams.find((s) => (s.streamId ?? "unassigned") === selectedStreamId);
    if (cls && stream) return `${cls.name} — ${stream.streamName === "Unassigned" ? "Unassigned" : stream.streamName}`;
    if (cls) return cls.name;
    return "Whole School";
  }, [availableStreams, classes, selectedClassId, selectedStreamId]);
  const chartTotal = data?.total ?? 0;
  const maleRatio = chartTotal ? Math.round(((data?.male ?? 0) / chartTotal) * 100) : 0;
  const femaleRatio = chartTotal ? 100 - maleRatio : 0;
  const generatedDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  if (loading) {
    return <div className="enrollment-report enrollment-state">Loading enrollment statistics…</div>;
  }
  if (error) {
    return <div className="enrollment-report enrollment-state enrollment-state--error">{error}</div>;
  }
  if (!data || data.total === 0) {
    return (
      <div className="enrollment-report">
        <ReportHeader school={school} generatedDate={generatedDate} />
        <div className="enrollment-empty">No student enrollment data is available for this report.</div>
      </div>
    );
  }

  return (
    <div className="enrollment-report">
      <div className="enrollment-report-controls no-print">
        <div>
          <h1 className="page-title">Student Enrollment Statistics</h1>
          <p className="page-sub">Official enrollment report by stream, gender, and subject.</p>
        </div>
        <div className="enrollment-report-actions">
          <button type="button" className="cm-btn cm-btn--primary" disabled={!selectedSubject} onClick={() => {
            setPrintAllSubjects(false);
            window.setTimeout(() => window.print(), 0);
          }}>
            Print selected subject
          </button>
          <button type="button" className="cm-btn cm-btn--ghost" onClick={() => {
            setPrintAllSubjects(true);
            window.setTimeout(() => window.print(), 0);
          }}>
            Print all {printSubjects.length} subjects — {scopeLabel}
          </button>
        </div>
      </div>

      <div className="enrollment-paper">
        <ReportHeader school={school} generatedDate={generatedDate} />

        <section className="enrollment-summary">
          <div className="enrollment-summary-card"><span>Male</span><strong>{number(data.male)}</strong></div>
          <div className="enrollment-summary-card"><span>Female</span><strong>{number(data.female)}</strong></div>
          <div className="enrollment-summary-card enrollment-summary-card--total"><span>Total Students</span><strong>{number(data.total)}</strong></div>
        </section>

        <section className="enrollment-chart-section" aria-label="Gender ratio">
          <div>
            <h2>Gender Ratio at a Glance</h2>
            <p>{number(data.total)} students school-wide</p>
          </div>
          <div className="enrollment-ratio">
            <div className="enrollment-ratio-bar">
              <span className="enrollment-ratio-male" style={{ width: `${maleRatio}%` }} />
              <span className="enrollment-ratio-female" style={{ width: `${femaleRatio}%` }} />
            </div>
            <div className="enrollment-ratio-key"><span><i className="enrollment-dot enrollment-dot--male" />Male {maleRatio}%</span><span><i className="enrollment-dot enrollment-dot--female" />Female {femaleRatio}%</span></div>
          </div>
        </section>

        <ReportTable title="Students by Stream" rows={data.streams} totalMale={data.male} totalFemale={data.female} />

        <section className="enrollment-section no-print">
          <div className="enrollment-section-heading">
            <div><h2>Subject Enrollment</h2><p>Choose a subject and class scope below to narrow the subject totals and printout.</p></div>
            <div className="enrollment-heading-actions">
              <button type="button" className="cm-btn cm-btn--primary cm-btn--sm enrollment-print-class-btn" onClick={() => {
                setPrintAllSubjects(true);
                window.setTimeout(() => window.print(), 0);
              }}>
                Print all {printSubjects.length} subjects — {scopeLabel}
              </button>
              <button type="button" className="enrollment-clear-btn" onClick={() => {
                setSelectedSubjectId("");
                setSelectedClassId("");
                setSelectedStreamId("");
              }}>Clear filters</button>
            </div>
          </div>
          <div className="enrollment-filter-grid">
            <label className="enrollment-select-label" htmlFor="enrollment-subject">Subject
              <select id="enrollment-subject" value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
                <option value="">Choose a subject</option>
                {data.subjects.map((subject) => <option key={subject.subjectId} value={subject.subjectId}>{subject.subjectName}</option>)}
              </select>
            </label>
            <label className="enrollment-select-label" htmlFor="enrollment-class">Class
              <select id="enrollment-class" value={selectedClassId} onChange={(event) => {
                setSelectedClassId(event.target.value);
                setSelectedStreamId("");
              }}>
                <option value="">All classes</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="enrollment-select-label" htmlFor="enrollment-stream">Stream
              <select id="enrollment-stream" value={selectedStreamId} onChange={(event) => setSelectedStreamId(event.target.value)}>
                <option value="">All streams</option>
                {availableStreams.map((stream) => <option key={stream.streamId ?? "unassigned"} value={stream.streamId ?? "unassigned"}>{stream.streamName === "Unassigned" ? stream.className : `${stream.className} — ${stream.streamName}`}</option>)}
              </select>
            </label>
          </div>
          {selectedSubject ? (
            <SubjectEnrollmentTable
              title={`${selectedSubject.subjectName} Enrollment`}
              rows={scopedRows(selectedSubject.streams)}
            />
          ) : (
            <div className="enrollment-prompt">Choose a subject to display subject-specific enrollment statistics.</div>
          )}
        </section>

        {selectedSubject && !printAllSubjects && (
          <section className="enrollment-section enrollment-print-subject">
            <SubjectEnrollmentTable
              title={`${selectedSubject.subjectName} Enrollment`}
              rows={scopedRows(selectedSubject.streams)}
            />
          </section>
        )}

        {printAllSubjects && (
          <section className="enrollment-all-subjects-print">
            <h2 className="enrollment-print-title">All Subject Enrollment — {scopeLabel}</h2>
            {printSubjects.map((subject) => (
              <SubjectEnrollmentTable
                key={subject.subjectId}
                title={`${subject.subjectName} Enrollment`}
                rows={scopedRows(subject.streams)}
              />
            ))}
          </section>
        )}

        <footer className="enrollment-signatures">
          <div><span>Verified by:</span><strong>____________________________</strong><small>Head Teacher / Academic Registrar</small></div>
          <div><span>Date:</span><strong>____________________________</strong></div>
        </footer>
      </div>
    </div>
  );
}

function ReportHeader({ school, generatedDate }: { school: SchoolInfo; generatedDate: string }) {
  return (
    <header className="enrollment-header">
      <img src={school.schoolLogo || "/assets/logo.png"} alt="" className="enrollment-logo" />
      <div>
        <div className="enrollment-school-name">{school.name || DEFAULT_SCHOOL_INFO.name}</div>
        {(school.council || school.district) && <div className="enrollment-school-meta">{[school.council, school.district].filter(Boolean).join(" · ")}</div>}
        <h2>STUDENT ENROLLMENT STATISTICS REPORT</h2>
        <p>Report generated: {generatedDate}</p>
      </div>
    </header>
  );
}

function ReportTable({ title, rows, totalMale, totalFemale }: { title: string; rows: EnrollmentStreamStat[]; totalMale: number; totalFemale: number }) {
  return (
    <section className="enrollment-section">
      <h2>{title}</h2>
      <div className="enrollment-table-wrap">
        <table className="enrollment-table">
          <thead><tr><th>Stream / Class</th><th>Number of Boys</th><th>Number of Girls</th><th>Total</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={4} className="enrollment-table-empty">No students are enrolled in this selection.</td></tr> : rows.map((row) => <tr key={`${row.classId}-${row.streamId}-${row.streamName}`}><td>{streamLabel(row)}</td><td>{number(row.male)}</td><td>{number(row.female)}</td><td>{number(row.total)}</td></tr>)}
            <tr className="enrollment-total-row"><th>TOTAL</th><th>{number(totalMale)}</th><th>{number(totalFemale)}</th><th>{number(totalMale + totalFemale)}</th></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubjectEnrollmentTable({
  title,
  rows,
}: {
  title: string;
  rows: EnrollmentStreamStat[];
}) {
  const filteredRows = rows;
  const groups = Array.from(
    filteredRows.reduce((map, row) => {
      const key = row.formLevel ?? 0;
      const group = map.get(key) ?? [];
      group.push(row);
      map.set(key, group);
      return map;
    }, new Map<number, EnrollmentStreamStat[]>()),
  ).sort(([a], [b]) => a - b);
  const grandMale = filteredRows.reduce((sum, row) => sum + row.male, 0);
  const grandFemale = filteredRows.reduce((sum, row) => sum + row.female, 0);

  return (
    <section className="enrollment-section">
      <h2>{title}</h2>
      <div className="enrollment-table-wrap">
        <table className="enrollment-table">
          <thead><tr><th>Form / Stream</th><th>Number of Boys</th><th>Number of Girls</th><th>Total</th></tr></thead>
          <tbody>
            {groups.length === 0 && <tr><td colSpan={4} className="enrollment-table-empty">No students are enrolled in this subject and form selection.</td></tr>}
            {groups.map(([level, group]) => {
              const formMale = group.reduce((sum, row) => sum + row.male, 0);
              const formFemale = group.reduce((sum, row) => sum + row.female, 0);
              return (
                <SubjectFormGroup
                  key={level}
                  level={level}
                  rows={group}
                  formMale={formMale}
                  formFemale={formFemale}
                />
              );
            })}
            <tr className="enrollment-total-row"><th>GRAND TOTAL</th><th>{number(grandMale)}</th><th>{number(grandFemale)}</th><th>{number(grandMale + grandFemale)}</th></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SubjectFormGroup({
  level,
  rows,
  formMale,
  formFemale,
}: {
  level: number;
  rows: EnrollmentStreamStat[];
  formMale: number;
  formFemale: number;
}) {
  return (
    <>
      <tr className="enrollment-form-row"><th colSpan={4}>FORM {level || "UNASSIGNED"}</th></tr>
      {rows.map((row) => (
        <tr key={`${row.classId}-${row.streamId}-${row.streamName}`}>
          <td>{row.streamName === "Unassigned" ? row.className : row.streamName}</td>
          <td>{number(row.male)}</td>
          <td>{number(row.female)}</td>
          <td>{number(row.total)}</td>
        </tr>
      ))}
      <tr className="enrollment-subtotal-row"><th>Form {level || "Unassigned"} Subtotal</th><th>{number(formMale)}</th><th>{number(formFemale)}</th><th>{number(formMale + formFemale)}</th></tr>
    </>
  );
}
