"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import {
  buildClassResults,
  buildSchoolReport,
  DEFAULT_COMPETENCY_THRESHOLDS,
  DEFAULT_DIVISION_RANGES,
  DEFAULT_GRADE_BOUNDARIES,
  examParticipantIds,
  type GradingSettings,
} from "@/lib/grading";
import {
  fetchExamMarks,
  fetchExams,
  fetchGradingSettings,
  fetchSchoolInfo,
  type DbExamMarkStudent,
  type DbExamRow,
  type ExamMarksClass,
  type ExamMarksData,
  type SchoolInfo,
} from "@/lib/school-api";

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("sw", { day: "2-digit", month: "short", year: "numeric" });
}

function yearOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : String(date.getFullYear());
}

function displayNumber(value: number | null): string {
  return value === null ? "—" : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function genderLabel(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.startsWith("f") ? "F" : normalized.startsWith("m") ? "M" : value;
}

function remarkFor(grade: string): string {
  switch (grade) {
    case "A": return "Bora";
    case "B": return "Nzuri Sana";
    case "C": return "Nzuri";
    case "D": return "Inaridhisha";
    case "F": return "Inahitaji Kuboreshwa";
    default: return "Hajafanya";
  }
}

function pronoun(gender: string): string {
  return gender.toLowerCase().startsWith("f") ? "she" : "he";
}

function performanceComments(avg: number | null): {
  headmaster: string;
  academic: string;
  classTeacher: string;
} {
  if (avg === null) {
    return {
      headmaster: "Mwanafunzi hajakamilisha mitihani ya kutosha kwa ajili ya kutathmini ufaulu wake kikamilifu. Anashauriwa kushiriki katika mitihani yote.",
      academic: "Ufaulu haukuweza kupimwa kikamilifu kutokana na masomo ambayo hayajakamilika. Mwanafunzi aongeze juhudi katika masomo na mitihani ijayo.",
      classTeacher: "Mwanafunzi anahimizwa kuhudhuria masomo na mitihani yote, kufanya mazoezi zaidi na kushirikiana kwa karibu na walimu.",
    };
  }
  if (avg >= 80) {
    return {
      headmaster: "Nimefurahishwa na ufaulu bora wa mwanafunzi. Aendelee kuwa na nidhamu, bidii na juhudi za kufikia mafanikio makubwa zaidi.",
      academic: "Ufaulu ni wa kiwango cha juu sana. Mwanafunzi aendelee na bidii hii na kuongeza maarifa katika masomo yote.",
      classTeacher: "Hongera kwa ufaulu mzuri sana. Endelea kusoma kwa bidii, kuhudhuria vipindi na kuwa mfano bora kwa wenzako.",
    };
  }
  if (avg >= 70) {
    return {
      headmaster: "Ufaulu ni mzuri sana. Mwanafunzi aendelee na nidhamu na juhudi ili kuboresha zaidi matokeo yake.",
      academic: "Mwanafunzi amefanya vizuri. Aongeze muda wa kujisomea na kuzingatia zaidi masomo yenye changamoto.",
      classTeacher: "Endelea na bidii uliyoonyesha. Ushirikiano na walimu pamoja na kujisomea kwa mpango kutakuwezesha kufanya vizuri zaidi.",
    };
  }
  if (avg >= 50) {
    return {
      headmaster: "Ufaulu ni wa kuridhisha. Mwanafunzi anapaswa kuongeza juhudi, nidhamu na muda wa kujisomea ili kufikia kiwango cha juu zaidi.",
      academic: "Mwanafunzi ana msingi mzuri wa maendeleo. Aongeze mazoezi, marudio na ufuatiliaji wa masomo yenye ufaulu mdogo.",
      classTeacher: "Ninaamini mwanafunzi anaweza kufanya vizuri zaidi. Ahudhurie vipindi kwa wakati na afanye kazi za shule kwa bidii.",
    };
  }
  if (avg >= 40) {
    return {
      headmaster: "Ufaulu bado ni wa wastani wa chini. Mwanafunzi anapaswa kuongeza juhudi na kufuata ushauri wa walimu kwa karibu.",
      academic: "Mwanafunzi anahitaji mpango maalumu wa kujisomea, mazoezi ya ziada na msaada katika masomo yenye changamoto.",
      classTeacher: "Ninamsihi mwanafunzi kuboresha mahudhurio, nidhamu ya kujisomea na kushirikiana na walimu ili kuongeza ufaulu.",
    };
  }
  return {
    headmaster: "Ufaulu unahitaji kuboreshwa kwa kiasi kikubwa. Mwanafunzi na mzazi wanashauriwa kushirikiana na shule katika mpango wa maendeleo.",
    academic: "Mwanafunzi anahitaji msaada wa karibu wa kitaaluma, mazoezi ya mara kwa mara na ufuatiliaji wa maendeleo katika kila somo.",
    classTeacher: "Mwanafunzi ahudhurie vipindi vyote, afanye kazi za shule kwa wakati na aombe msaada pale anapokutana na changamoto.",
  };
}

interface CardSheetProps {
  marks: ExamMarksData;
  classRow: ExamMarksClass;
  student: DbExamMarkStudent;
  settings: GradingSettings;
  schoolInfo: SchoolInfo | null;
  exams: DbExamRow[];
  marksByExam: Record<string, ExamMarksData>;
  exam: DbExamRow;
  showHistory: boolean;
  historyCount: number;
}

function CardSheet({ marks, classRow, student, settings, schoolInfo, exams, marksByExam, exam, showHistory, historyCount }: CardSheetProps) {
  const [behaviorState, setBehaviorState] = useState<{ studentId: string; ratings: (number | null)[] }>(() => ({
    studentId: student.student_id,
    ratings: Array(8).fill(null),
  }));
  const behaviorRatings = behaviorState.studentId === student.student_id ? behaviorState.ratings : Array(8).fill(null);

  const cardReport = useMemo(() => {
    const classResults = buildClassResults(classRow, marks.marks, settings.gradeBoundaries, settings.divisionRanges);
    const report = buildSchoolReport([classResults], settings);
    const row = report.students.find((item) => item.student.student_id === student.student_id);
    return row ? { report, row } : null;
  }, [classRow, marks, student, settings]);

  const history = useMemo(() => {
    const rows: { key: string; examName: string; date: string; avg: number | null; rank: number; grade: string; points: number | null; trend: "up" | "down" | "same" }[] = [];
    let previousRank: number | null = null;
    for (const item of exams) {
      const data = marksByExam[item.id];
      const itemClass = data?.classes.find((c) => c.class_id === classRow.class_id);
      if (!itemClass) continue;
      if (!itemClass.students.some((s) => s.student_id === student.student_id)) continue;
      const classResults = buildClassResults(itemClass, data.marks, settings.gradeBoundaries, settings.divisionRanges);
      const report = buildSchoolReport([classResults], settings);
      const row = report.students.find((r) => r.student.student_id === student.student_id);
      if (!row) continue;
      const trend = previousRank === null ? "same" : row.rank < previousRank ? "up" : row.rank > previousRank ? "down" : "same";
      rows.push({ key: item.id, examName: item.name, date: shortDate(item.start_date), avg: row.avg, rank: row.rank, grade: row.grade, points: row.student.total_points, trend });
      previousRank = row.rank;
    }
    return rows;
  }, [classRow, exams, marksByExam, settings, student.student_id]);

  if (!cardReport) return null;

  const { report, row } = cardReport;
  const totalPoints = row.student.total_points;
  const avg = row.avg;
  const classSize = report.summary.students;
  const fullName = `${row.student.first_name}${row.student.middle_name ? ` ${row.student.middle_name}` : ""} ${row.student.last_name}`;
  const streamName = student.stream_name === "—" ? "Haijafungwa" : student.stream_name;
  const issueDate = shortDate(new Date().toISOString());
  const examLabel = `${exam.name} ${yearOf(exam.start_date)}`.toUpperCase();
  const division = row.divisionCode;
  const newestFirst = [...history].reverse();
  const comments = performanceComments(avg);
  const displayHistory = newestFirst.slice(0, historyCount);

  return (
    <div className="rc-paper">
      <header>
        <div className="rc-header">
          <div className="rc-logo">
            {schoolInfo?.unionLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={schoolInfo.unionLogo} alt="Nembo ya Taifa" />
            ) : <span className="rc-logo-fallback">TZA</span>}
          </div>
          <div className="rc-header-info">
            <div className="rc-country">JAMHURI YA MUUNGANO WA TANZANIA</div>
            <div className="rc-district">OFISI YA RAIS – TAMISEMI · {(schoolInfo?.council || schoolInfo?.district || "HALMASHAURI YA WILAYA").toUpperCase()}</div>
            <div className="rc-school-name">{(schoolInfo?.name || "Shule").toUpperCase()}</div>
            <div className="rc-address">S.L.P. {(schoolInfo?.address ?? "00000").replace(/^S\.?L\.?\s*P\.?\s*Box\s*/i, "")}</div>
            <div className="rc-report-title">RIPOTI YA MAENDELEO YA MWANAFUNZI</div>
          </div>
          <div className="rc-logo rc-logo-right">
            {schoolInfo?.schoolLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={schoolInfo.schoolLogo} alt="Nembo ya shule" />
            ) : <span className="rc-logo-fallback">SHULE</span>}
          </div>
        </div>
        <div className="rc-double-line"><span>{examLabel}</span></div>
      </header>

      <section className="rc-student">
        <div className="rc-name-bar">JINA: {fullName.toUpperCase()}</div>
        <div className="rc-info-box">
          <div className="rc-info-left">
            <span>Darasa: {classRow.class_name}</span>
            <span className="rc-sep">|</span>
            <span>Mkondo: {streamName}</span>
            <span className="rc-sep">|</span>
            <span>Jinsia: {genderLabel(row.student.gender)}</span>
          </div>
          <div className="rc-info-right">
            <span>Tarehe: {issueDate}</span>
            <span className="rc-sep">|</span>
            <span>Wastani: {displayNumber(avg)}%</span>
          </div>
        </div>
      </section>

      <section className="rc-section">
        <h3>1. Matokeo ya Masomo</h3>
        <table className="rc-table rc-subjects">
          <thead>
            <tr>
              <th>MASOMO</th>
              {exam.has_practical && <th>NADHARIA</th>}
              {exam.has_practical && <th>VITENDO</th>}
              <th>ALAMA</th>
              <th>DARAJA</th>
              <th>POINTI</th>
              <th>MAONI</th>
            </tr>
          </thead>
          <tbody>
            {row.student.subjects.map((subject) => {
              const cell = marks.marks[`${student.student_id}|${subject.subject_id}`];
              return (
                <tr key={subject.subject_id}>
                  <td className="rc-left">{subject.subject_name}</td>
                  {exam.has_practical && <td>{subject.total_score === null ? "—" : (cell?.theory ?? "—")}</td>}
                  {exam.has_practical && <td>{subject.total_score === null ? "—" : (cell?.practical ?? "—")}</td>}
                  <td>{subject.total_score === null ? "ABS" : subject.total_score}</td>
                  <td>{subject.grade}</td>
                  <td>{subject.points}</td>
                  <td>{remarkFor(subject.grade)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {showHistory && historyCount > 0 && (
        <section className="rc-section">
          <h3>Historia ya Mitihani — {classRow.class_name}</h3>
          <table className="rc-table rc-history">
            <thead>
              <tr>
                <th>MTIHANI</th>
                <th>TAREHE</th>
                <th>WASTANI</th>
                <th>NAFASI</th>
                <th>DARAJA</th>
                <th>POINTI</th>
                <th>MWENENDO</th>
              </tr>
            </thead>
            <tbody>
              {displayHistory.length === 0 && (
                <tr><td colSpan={7}>Hakuna historia ya mitihani iliyorekodiwa.</td></tr>
              )}
              {displayHistory.map((item) => (
                <tr key={item.key}>
                  <td className="rc-left">{item.examName}</td>
                  <td>{item.date}</td>
                  <td>{displayNumber(item.avg)}</td>
                  <td>{item.rank}</td>
                  <td>{item.grade}</td>
                  <td>{displayNumber(item.points)}</td>
                  <td>
                    {item.trend === "up" ? "▲" : item.trend === "down" ? "▼" : "—"}
                    {item.trend === "up" ? " Imeboreka" : item.trend === "down" ? " Imepungua" : " Hakuna mabadiliko"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rc-section">
        <h3>2. Muhtasari wa Matokeo</h3>
        <div className="rc-summary">
          <div><strong>{displayNumber(avg)}%</strong><span>Wastani</span></div>
          <div><strong>{row.grade}</strong><span>Daraja</span></div>
          <div><strong>{row.rank || "—"} / {classSize}</strong><span>Nafasi</span></div>
          <div><strong>{division}</strong><span>Divisheni</span></div>
          <div><strong>{displayNumber(totalPoints)}</strong><span>Pointi (Bora 7)</span></div>
          <div><strong>{displayNumber(row.gpa)}</strong><span>GPA</span></div>
        </div>
      </section>

      <section className="rc-section">
        <h3>3. Tabia na Mwenendo</h3>
        <table className="rc-table rc-behavior">
          <thead>
            <tr>
              <th>KIPENGELE</th>
              {["Bora Sana", "Nzuri", "Wastani", "Dhaifu"].map((rating) => <th key={`left-${rating}`}>{rating}</th>)}
              <th className="rc-bh-spacer" />
              <th>KIPENGELE</th>
              {["Bora Sana", "Nzuri", "Wastani", "Dhaifu"].map((rating) => <th key={`right-${rating}`}>{rating}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ["Nidhamu", "Usafi"],
              ["Bidii ya masomo", "Michezo/klabu"],
              ["Uongozi", "Ushirikiano na wenzake"],
              ["Heshima kwa walimu", "Utunzaji wa mali ya shule"],
            ].map(([leftDesc, rightDesc], rowIndex) => (
              <tr key={leftDesc}>
                {[leftDesc, rightDesc].map((label, side) => {
                  const index = rowIndex + side * 4;
                  return (
                    <Fragment key={label}>
                      {side === 1 && <td className="rc-bh-spacer" />}
                      <td className="rc-left rc-behavior-label">{label}</td>
                      {["Bora Sana", "Nzuri", "Wastani", "Dhaifu"].map((rating, ratingIndex) => (
                        <td key={rating} className="rc-behavior-choice">
                          <button
                            type="button"
                            className="rc-rating-button"
                            aria-label={`${label}: ${rating}`}
                            aria-pressed={behaviorRatings[index] === ratingIndex}
                            onClick={() => setBehaviorState((current) => {
                              const ratings = current.studentId === student.student_id ? current.ratings : Array(8).fill(null);
                              return {
                                studentId: student.student_id,
                                ratings: ratings.map((value, i) => i === index ? (value === ratingIndex ? null : ratingIndex) : value),
                              };
                            })}
                          >
                            {behaviorRatings[index] === ratingIndex ? "✓" : ""}
                          </button>
                        </td>
                      ))}
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rc-section">
        <h3>4. Maoni na Uthibitisho</h3>
        <div className="rc-comment rc-comments">
          <div className="rc-comment-block">
            <strong>Maoni ya Mwalimu wa Darasa</strong>
            <p>{comments.classTeacher}</p>
            <div className="rc-comment-signature">
              <span>Jina:</span><span className="rc-signature-line rc-signature-name" />
              <span>Sahihi:</span><span className="rc-signature-line rc-signature-mark" />
            </div>
          </div>
          <div className="rc-comment-block">
            <strong>Maoni ya Mwalimu wa Taaluma</strong>
            <p>{comments.academic}</p>
            <div className="rc-comment-signature">
              <span>Jina:</span><span className="rc-signature-line rc-signature-name" />
              <span>Sahihi:</span><span className="rc-signature-line rc-signature-mark" />
            </div>
          </div>
          <div className="rc-comment-block">
            <strong>Maoni ya Mkuu wa Shule</strong>
            <p>{comments.headmaster}</p>
            <div className="rc-comment-signature">
              <span>Jina:</span><span className="rc-signature-line rc-signature-name" />
              <span>Sahihi:</span><span className="rc-signature-line rc-signature-mark" />
              <span className="rc-stamp">Muhuri</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rc-section rc-parent-section">
        <div className="rc-cut"><span>✂ KATA HAPA — MZAZI/MLEZI ARUDISHE SEHEMU HII SHULENI ✂</span></div>
        <div className="rc-parent-msg">
          <h3>5. Maoni ya Mzazi / Mlezi</h3>
          <div className="rc-parent-writing" aria-label="Nafasi ya maoni ya mzazi/mlezi" />
          <div className="rc-parent-signature">Jina la Mzazi/Mlezi: ____________________ &nbsp; Simu: ____________________ &nbsp; Sahihi: ____________________</div>
        </div>
      </section>

      <footer className="rc-footer">Ripoti hii imetolewa na Ofisi ya Taaluma | Tarehe: {issueDate}</footer>
    </div>
  );
}

export default function StudentReportCard() {
  const [exams, setExams] = useState<DbExamRow[]>([]);
  const [marksByExam, setMarksByExam] = useState<Record<string, ExamMarksData>>({});
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);
  const [settings, setSettings] = useState<GradingSettings>({
    gradeBoundaries: DEFAULT_GRADE_BOUNDARIES,
    divisionRanges: DEFAULT_DIVISION_RANGES,
    competencyThresholds: DEFAULT_COMPETENCY_THRESHOLDS,
  });
  const [loading, setLoading] = useState(true);
  const [marksLoading, setMarksLoading] = useState(false);
  const [marksReady, setMarksReady] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [historyCount, setHistoryCount] = useState(3);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchExams({ search: "", page: 1, pageSize: 100 }),
      fetchGradingSettings(),
      fetchSchoolInfo(),
    ])
      .then(([examResult, grading, info]) => {
        if (!active) return;
        const eligible = examResult.rows
          .filter((exam) => exam.status !== "draft")
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
        setExams(eligible);
        setSettings(grading);
        setSchoolInfo(info);
        setSelectedExamId(eligible[eligible.length - 1]?.id ?? "");
      })
      .catch(() => active && setError("Imeshindikana kupakia data ya ripoti hiyo kutoka kwenye hifadhidata."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (exams.length === 0) {
        setMarksReady(true);
        setMarksLoading(false);
        setMarksByExam({});
        return;
      }
      setMarksLoading(true);
      setMarksReady(false);
      setMarksByExam({});
      await Promise.all(
        exams.map(async (exam) => {
          try {
            const data = await fetchExamMarks(exam.id);
            if (active) setMarksByExam((current) => ({ ...current, [exam.id]: data }));
          } catch {
            // Skip exams whose marks cannot be loaded.
          }
        }),
      );
      if (active) {
        setMarksLoading(false);
        setMarksReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [exams]);

  const currentData = selectedExamId ? marksByExam[selectedExamId] : null;
  const currentClass = currentData?.classes.find((item) => item.class_id === selectedClassId) ?? currentData?.classes[0];
  const currentExam = exams.find((item) => item.id === selectedExamId);
  const participants = useMemo(
    () => (currentData ? examParticipantIds(currentData.marks) : new Set<string>()),
    [currentData],
  );
  const classStudents = useMemo(
    () => (currentClass?.students ?? []).filter((s) => participants.has(s.student_id)),
    [currentClass, participants],
  );
  const currentStudent = classStudents.find((item) => item.student_id === selectedStudentId) ?? classStudents[0];

  const reportReady = useMemo(() => {
    if (!currentData || !currentClass || !currentStudent) return false;
    const classResults = buildClassResults(currentClass, currentData.marks, settings.gradeBoundaries, settings.divisionRanges);
    const report = buildSchoolReport([classResults], settings);
    return report.students.some((item) => item.student.student_id === currentStudent.student_id);
  }, [currentData, currentClass, currentStudent, settings]);

  function printSingle() {
    window.print();
  }

  function printWholeClass() {
    if (!currentData || !currentClass) return;
    setPrintAll(true);
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => setPrintAll(false), 150);
    }, 120);
  }

  if (loading) return <div className="me-loading"><Spinner size={20} /></div>;
  if (error) return <div className="st-empty-state">{error}</div>;
  if (marksLoading || !marksReady) return <div className="me-loading"><Spinner size={20} /></div>;
  if (!currentData || !currentClass || !currentExam) {
    return <div className="st-empty-state">Hakuna mitihani, madarasa au wanafunzi kwa ripoti za matokeo.</div>;
  }

  return (
    <div className={`rc-page${printAll ? " rc-printing-all" : ""}`}>
      <div className="page-head rc-controls rc-no-print">
        <div>
          <h2 className="page-title">Ripoti ya Matokeo ya Mwanafunzi</h2>
          <p className="page-sub">Ripoti rasmi ya mwanafunzi mmoja mmoja — tayari kuchapishwa au kuhifadhiwa kama PDF.</p>
        </div>
        <button className="cm-btn cm-btn--ghost rc-no-print" onClick={printSingle}>Chapisha Moja / Hifadhi kama PDF</button>
      </div>

      <div className="res-toolbar rc-no-print">
        <label className="res-field"><span className="res-field-label">Mtihani</span>
          <select className="res-select" value={selectedExamId} onChange={(event) => { setSelectedExamId(event.target.value); setSelectedClassId(""); setSelectedStudentId(""); }}>
            {exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="res-field"><span className="res-field-label">Darasa / Kidato</span>
          <select className="res-select" value={currentClass.class_id} onChange={(event) => { setSelectedClassId(event.target.value); setSelectedStudentId(""); }}>
            {currentData.classes.map((item) => <option key={item.class_id} value={item.class_id}>{item.class_name}</option>)}
          </select>
        </label>
        <label className="res-field"><span className="res-field-label">Mwanafunzi</span>
          <select className="res-select" value={currentStudent?.student_id ?? ""} onChange={(event) => setSelectedStudentId(event.target.value)}>
            {classStudents.map((item) => <option key={item.student_id} value={item.student_id}>{item.first_name} {item.last_name}</option>)}
          </select>
        </label>
        <label className="res-field">
          <span className="res-field-label">Historia ya Mitihani</span>
          <label className="rc-history-toggle">
            <input type="checkbox" checked={showHistory} onChange={(event) => setShowHistory(event.target.checked)} />
            <span>{showHistory ? "Washa" : "Zima"}</span>
          </label>
        </label>
        <label className="res-field">
          <span className="res-field-label">Mitihani ya Awali ({historyCount})</span>
          <select className="res-select" value={historyCount} disabled={!showHistory} onChange={(event) => setHistoryCount(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <button className="cm-btn cm-btn--primary rc-no-print" onClick={printWholeClass}>Chapisha Darasa Zima</button>
      </div>

      {marksLoading ? <div className="me-loading"><Spinner size={20} /></div> : (
        <>
          {!printAll && currentStudent && reportReady && (
            <CardSheet
              marks={currentData}
              classRow={currentClass}
              student={currentStudent}
              settings={settings}
              schoolInfo={schoolInfo}
              exams={exams}
              marksByExam={marksByExam}
              exam={currentExam}
              showHistory={showHistory}
              historyCount={historyCount}
            />
          )}
          {!printAll && (!currentStudent || !reportReady) && (
            <div className="st-empty-state">Hakuna mwanafunzi aliyepatikana katika uchaguzi huu.</div>
          )}
          {printAll && (
            <div className="rc-print-all">
              {classStudents.map((student) => (
                <div className="rc-sheet" key={student.student_id}>
                  <CardSheet
                    marks={currentData}
                    classRow={currentClass}
                    student={student}
                    settings={settings}
                    schoolInfo={schoolInfo}
                    exams={exams}
                    marksByExam={marksByExam}
                    exam={currentExam}
                    showHistory={showHistory}
                    historyCount={historyCount}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}