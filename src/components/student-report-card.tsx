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
import {
  fetchStreamReportSettings,
  fetchStreamReports,
  saveStreamReportSettings,
  type ScopedExamMarks,
  type StreamTeacherScope,
} from "@/lib/stream-teacher-api";
import {
  clearReportSignature,
  fetchReportSignatures,
  saveReportSignature,
  type ReportSignature,
  type ReportSignerRole,
} from "@/lib/report-signatures-api";
import { fetchReportBehaviour, saveReportRequirements } from "@/lib/report-behaviour-api";
import { parseRequirementText } from "@/lib/report-requirements";
import SignaturePad from "@/components/signature-pad";
import type { Role } from "@/components/navigation/nav-config";

interface ReportSignatureBundle {
  academic: ReportSignature | null;
  headmaster: ReportSignature | null;
  streamTeachers: Record<string, ReportSignature>;
}

const SIGNER_LABELS: Record<ReportSignerRole, string> = {
  Academic: "Mtaaluma",
  StreamTeacher: "Mwalimu wa Mkondo",
  Headmaster: "Mkuu wa Shule",
};

function signerRoleFor(role: Role | undefined): ReportSignerRole | null {
  if (role === "Teacher") return "StreamTeacher";
  if (role === "Academic") return "Academic";
  if (role === "Headmaster") return "Headmaster";
  return null;
}

function termOfDate(value: string): 1 | 2 {
  const month = Number(value.slice(5, 7));
  return month >= 7 ? 2 : 1;
}

function emptySignatureBundle(): ReportSignatureBundle {
  return { academic: null, headmaster: null, streamTeachers: {} };
}

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

function displayInputDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("sw", { day: "2-digit", month: "short", year: "numeric" });
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

function reportExamFromScoped(exam: {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  has_practical: boolean;
  status: string;
}): DbExamRow {
  return {
    ...exam,
    status: exam.status as DbExamRow["status"],
    marks_open: false,
    created_at: "",
    class_count: 0,
    subject_count: 0,
  };
}

function reportMarksFromScoped(data: ScopedExamMarks): ExamMarksData {
  return {
    marks: data.marks,
    classes: [
      {
        class_id: data.classRow.class_id,
        class_name: data.classRow.class_name,
        subjects: data.classRow.subjects,
        students: data.classRow.students,
      },
    ],
  };
}

const GOOD_BEHAVIOUR_RATINGS = [0, 1, 2];

function randomBehaviourRatings(): (number | null)[] {
  return Array.from({ length: 8 }, () =>
    GOOD_BEHAVIOUR_RATINGS[Math.floor(Math.random() * GOOD_BEHAVIOUR_RATINGS.length)],
  );
}

function filledBehaviourCount(ratings: (number | null)[]): number {
  return ratings.filter((rating) => typeof rating === "number").length;
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

interface SignatureSlotProps {
  signature: ReportSignature | null;
  canSign: boolean;
  onSign: () => void;
  showStamp?: boolean;
}

function SignatureSlot({ signature, canSign, onSign, showStamp = false }: SignatureSlotProps) {
  return (
    <>
      <div className="rc-comment-signature">
        <span>Sahihi:</span>
        <span className={`rc-signature-line rc-signature-mark${signature ? " rc-signature-mark--signed" : ""}`}>
          {signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="rc-signature-image"
              src={signature.signature_data}
              alt="Sahihi"
            />
          ) : null}
        </span>
        {showStamp ? <span className="rc-stamp">Muhuri</span> : null}
        {canSign ? (
          <button type="button" className="rc-signature-button rc-no-print" onClick={onSign}>
            {signature ? "Badilisha" : "Saini"}
          </button>
        ) : null}
      </div>
      {signature ? (
        <div className="rc-signature-meta">
          {shortDate(signature.updated_at)}
        </div>
      ) : null}
    </>
  );
}

interface CardSheetProps {
  marks: ExamMarksData;
  classRow: ExamMarksClass;
  student: DbExamMarkStudent;
  settings: GradingSettings;
  schoolInfo: SchoolInfo | null;
  exam: DbExamRow;
  schoolClosed: boolean;
  closingDate: string;
  openingDate: string;
  canGenerateConduct?: boolean;
  behaviorRatings: (number | null)[];
  behaviorEditable?: boolean;
  onBehaviorRatingsChange: (ratings: (number | null)[]) => void;
  requirements: string[];
  signatures: ReportSignatureBundle;
  signerRole: ReportSignerRole | null;
  onSign: (role: ReportSignerRole) => void;
}

function CardSheet({
  marks,
  classRow,
  student,
  settings,
  schoolInfo,
  exam,
  schoolClosed,
  closingDate,
  openingDate,
  canGenerateConduct = false,
  behaviorRatings,
  behaviorEditable = false,
  onBehaviorRatingsChange,
  requirements,
  signatures,
  signerRole,
  onSign,
}: CardSheetProps) {
  const cardReport = useMemo(() => {
    const classResults = buildClassResults(classRow, marks.marks, settings.gradeBoundaries, settings.divisionRanges);
    const report = buildSchoolReport([classResults], settings);
    const row = report.students.find((item) => item.student.student_id === student.student_id);
    return row ? { report, row } : null;
  }, [classRow, marks, student, settings]);

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
  const comments = performanceComments(avg);
  const teacherSignature = student.stream_id ? signatures.streamTeachers[student.stream_id] ?? null : null;
  const behaviourFilled = filledBehaviourCount(behaviorRatings);
  const behaviourTotal = behaviorRatings.length || 8;

  return (
    <div className="rc-paper">
      <header>
        <div className="rc-header">
          <div className="rc-logo rc-logo--filled">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={schoolInfo?.unionLogo || "/assets/umoja.png"} alt="Nembo ya Taifa" />
          </div>
          <div className="rc-header-info">
            <div className="rc-country">JAMHURI YA MUUNGANO WA TANZANIA</div>
            <div className="rc-district">{(schoolInfo?.council || schoolInfo?.district || "HALMASHAURI YA WILAYA YA IRAMBA").toUpperCase()}</div>
            <div className="rc-school-name">{(schoolInfo?.name || "Shule").toUpperCase()}</div>
            <div className="rc-address">S.L.P. {(schoolInfo?.address ?? "00000").replace(/^S\.?L\.?\s*P\.?\s*Box\s*/i, "")}</div>
            <div className="rc-report-title">RIPOTI YA MAENDELEO YA MWANAFUNZI</div>
          </div>
          <div className="rc-logo rc-logo-right rc-logo--filled">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={schoolInfo?.schoolLogo || "/assets/logo.png"} alt="Nembo ya shule" />
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
        <div className="rc-section-head">
          <h3>3. Tabia na Mwenendo</h3>
          <div className="rc-behaviour-status-wrap rc-no-print">
            <span className={`rc-behaviour-status${behaviourFilled > 0 ? " rc-behaviour-status--filled" : " rc-behaviour-status--empty"}`}>
              {behaviourFilled > 0
                ? `Imejazwa (${behaviourFilled}/${behaviourTotal})`
                : "Bado haijajazwa"}
            </span>
            {canGenerateConduct && (
              <button type="button" className="cm-btn cm-btn--ghost cm-btn--sm" onClick={() => onBehaviorRatingsChange(randomBehaviourRatings())}>
                Auto-generate
              </button>
            )}
          </div>
        </div>
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
                            disabled={!behaviorEditable}
                            onClick={() => {
                              if (!behaviorEditable) return;
                              onBehaviorRatingsChange(
                                behaviorRatings.map((value, i) => i === index ? (value === ratingIndex ? null : ratingIndex) : value),
                              );
                            }}
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
            <strong>Maoni ya Mwalimu wa Mkondo</strong>
            <p>{comments.classTeacher}</p>
            <SignatureSlot
              signature={teacherSignature}
              canSign={signerRole === "StreamTeacher"}
              onSign={() => onSign("StreamTeacher")}
            />
          </div>
          <div className="rc-comment-block">
            <strong>Maoni ya Mwalimu wa Taaluma</strong>
            <p>{comments.academic}</p>
            <SignatureSlot
              signature={signatures.academic}
              canSign={signerRole === "Academic"}
              onSign={() => onSign("Academic")}
            />
          </div>
          <div className="rc-comment-block">
            <strong>Maoni ya Mkuu wa Shule</strong>
            <p>{comments.headmaster}</p>
            <SignatureSlot
              signature={signatures.headmaster}
              canSign={signerRole === "Headmaster"}
              onSign={() => onSign("Headmaster")}
              showStamp
            />
          </div>
        </div>
      </section>

      {schoolClosed ? (
        <div className="rc-closure-note">
          Shule itafungwa tarehe {displayInputDate(closingDate)} · Itafunguliwa tarehe {displayInputDate(openingDate)}
        </div>
      ) : null}

      <section className="rc-section">
        <h3>5. Wanafunzi wanatakiwa kuripoti shuleni wakiwa na mahitaji yafuatayo:</h3>
        <div className="rc-requirements">
          {requirements.length > 0 ? (
            <ul className="rc-requirements-list">
              {requirements.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : (
            <>
              <span className="rc-requirements-line" />
              <span className="rc-requirements-line" />
            </>
          )}
        </div>
      </section>

      <section className="rc-section rc-parent-section">
        <div className="rc-cut"><span>✂ KATA HAPA — MZAZI/MLEZI ARUDISHE SEHEMU HII SHULENI ✂</span></div>
        <div className="rc-parent-msg">
          <h3>6. Maoni ya Mzazi / Mlezi</h3>
          <div className="rc-parent-writing" aria-label="Nafasi ya maoni ya mzazi/mlezi">
            <span /><span /><span />
          </div>
          <div className="rc-parent-signature">Jina la Mzazi/Mlezi: ____________________ &nbsp; Simu: ____________________ &nbsp; Sahihi: ____________________</div>
        </div>
      </section>

      <footer className="rc-footer">
        <div>Ripoti hii imetolewa na Ofisi ya Taaluma | Tarehe: {issueDate}</div>
      </footer>
    </div>
  );
}

interface StudentReportCardProps {
  scope?: StreamTeacherScope | null;
  role?: Role;
}

export default function StudentReportCard({ scope, role }: StudentReportCardProps = {}) {
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
  const [schoolClosed, setSchoolClosed] = useState(false);
  const [closingDate, setClosingDate] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [behaviorByStudent, setBehaviorByStudent] = useState<Record<string, (number | null)[]>>({});
  const [requirements, setRequirements] = useState<string[]>([]);
  const [requirementsByStream, setRequirementsByStream] = useState<Record<string, string[]>>({});
  const [requirementDraft, setRequirementDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [signatures, setSignatures] = useState<ReportSignature[]>([]);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [signPadRole, setSignPadRole] = useState<ReportSignerRole | null>(null);
  const scopedStreamId = scope?.streamId ?? "";
  const scopedYear = scope?.year ?? "";
  const scopedTerm = scope?.term;
  const signerRole = signerRoleFor(role ?? (scope ? "Teacher" : undefined));

  useEffect(() => {
    let active = true;
    (async () => {
      const [grading, info, savedReport] = await Promise.all([
        fetchGradingSettings(),
        fetchSchoolInfo(),
        scopedStreamId && scopedYear && scopedTerm
          ? fetchStreamReportSettings(scopedStreamId, scopedYear, scopedTerm).catch(() => null)
          : Promise.resolve(null),
      ]);
      let eligible: DbExamRow[];
      if (scopedStreamId && scopedYear && scopedTerm) {
        const result = await fetchStreamReports(scopedStreamId, scopedYear, scopedTerm);
        eligible = result.exams
          .filter((exam) => exam.status !== "draft")
          .map(reportExamFromScoped)
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
      } else {
        const examResult = await fetchExams({ search: "", page: 1, pageSize: 100, scopeToActiveYear: true });
        eligible = examResult.rows
          .filter((exam) => exam.status !== "draft")
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
      }
      if (!active) return;
      const restored = savedReport?.settings ?? null;
      if (restored) {
        setSchoolClosed(restored.schoolClosed);
        setClosingDate(restored.closingDate);
        setOpeningDate(restored.openingDate);
        setBehaviorByStudent(restored.behavior ?? {});
        setRequirementDraft(null);
      } else {
        setSchoolClosed(false);
        setClosingDate("");
        setOpeningDate("");
        setBehaviorByStudent({});
        setRequirementDraft(null);
      }
      setSaveState("idle");
      setSaveError("");
      setExams(eligible);
      setSettings(grading);
      setSchoolInfo(info);
      setSelectedExamId(
        restored?.examId && eligible.some((exam) => exam.id === restored.examId)
          ? restored.examId
          : eligible[eligible.length - 1]?.id ?? "",
      );
    })()
      .catch(() => active && setError("Imeshindikana kupakia data ya ripoti hiyo kutoka kwenye hifadhidata."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [scopedStreamId, scopedYear, scopedTerm]);

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
            if (scopedStreamId && scopedYear && scopedTerm) {
              const result = await fetchStreamReports(scopedStreamId, scopedYear, scopedTerm, exam.id);
              if (active && result.data) {
                const data = result.data;
                setMarksByExam((current) => ({ ...current, [exam.id]: reportMarksFromScoped(data) }));
              }
              return;
            }
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
  }, [exams, scopedStreamId, scopedYear, scopedTerm]);

  const currentData = selectedExamId ? marksByExam[selectedExamId] : null;
  const currentClass = currentData?.classes.find((item) => item.class_id === (scope?.classId ?? selectedClassId)) ?? currentData?.classes[0];
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
  const canEditRequirements = Boolean(scope) || role === "Headmaster" || role === "Academic";
  const requirementsForStudent = (student: DbExamMarkStudent): string[] =>
    canEditRequirements
      ? requirements
      : student.stream_id
        ? requirementsByStream[student.stream_id] ?? []
        : [];
  const currentRequirements = currentStudent ? requirementsForStudent(currentStudent) : [];
  const signatureClassId = currentClass?.class_id ?? "";
  const signatureStreamId = scopedStreamId;
  const signatureYear = scopedYear || (currentExam ? yearOf(currentExam.start_date) : "");
  const signatureTerm = scopedTerm ?? (currentExam ? termOfDate(currentExam.start_date) : undefined);
  const signatureBundle = useMemo<ReportSignatureBundle>(() => {
    const bundle = emptySignatureBundle();
    for (const signature of signatures) {
      if (signature.signer_role === "Academic" && !signature.stream_id) {
        bundle.academic = signature;
      } else if (signature.signer_role === "Headmaster" && !signature.stream_id) {
        bundle.headmaster = signature;
      } else if (signature.signer_role === "StreamTeacher" && signature.stream_id) {
        bundle.streamTeachers[signature.stream_id] = signature;
      }
    }
    return bundle;
  }, [signatures]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!signatureClassId || !signatureYear || !signatureTerm) {
        setSignatures([]);
        setSignatureLoading(false);
        setSignatureError("");
        return;
      }
      setSignatures([]);
      setSignatureLoading(true);
      setSignatureError("");
      try {
        const response = await fetchReportSignatures({
          classId: signatureClassId,
          streamId: signerRole === "StreamTeacher" ? signatureStreamId : null,
          year: signatureYear,
          term: signatureTerm,
        });
        if (active) setSignatures(response.signatures);
      } catch (failure) {
        if (active) {
          setSignatureError(failure instanceof Error ? failure.message : "Imeshindikana kupakia sahihi.");
        }
      } finally {
        if (active) setSignatureLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [signatureClassId, signatureStreamId, signatureYear, signatureTerm, signerRole]);

  useEffect(() => {
    if (!signatureClassId || !signatureYear || !signatureTerm) return;
    const refresh = () => {
      (async () => {
        try {
          const response = await fetchReportSignatures({
            classId: signatureClassId,
            streamId: signerRole === "StreamTeacher" ? signatureStreamId : null,
            year: signatureYear,
            term: signatureTerm,
          });
          setSignatures(response.signatures);
        } catch {
          // Ignore background refresh errors.
        }
      })();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [signatureClassId, signatureStreamId, signatureYear, signatureTerm, signerRole]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!signatureClassId || !signatureYear || !signatureTerm) {
        if (active) {
          setBehaviorByStudent({});
          setRequirementsByStream({});
          setRequirementDraft(null);
        }
        return;
      }
      setRequirementDraft(null);
      try {
        const result = await fetchReportBehaviour({
          classId: signatureClassId,
          streamId: scope ? scopedStreamId : null,
          year: signatureYear,
          term: signatureTerm,
        });
        if (!active) return;
        const nextRequirements = result.requirements ?? {};
        setBehaviorByStudent(result.behavior);
        setRequirementsByStream(nextRequirements);
        if (scope) {
          setRequirements(nextRequirements[scopedStreamId] ?? []);
        } else if (role === "Headmaster" || role === "Academic") {
          setRequirements(Object.values(nextRequirements).find((items) => items.length > 0) ?? []);
        }
      } catch {
        if (!active) return;
        setBehaviorByStudent({});
        setRequirementsByStream({});
      }
    })();
    return () => {
      active = false;
    };
  }, [scope, scopedStreamId, role, signatureClassId, signatureYear, signatureTerm]);

  const ownSignature = signerRole === "StreamTeacher"
    ? signatureBundle.streamTeachers[scopedStreamId || currentStudent?.stream_id || ""] ?? null
    : signerRole === "Academic"
      ? signatureBundle.academic
      : signerRole === "Headmaster"
        ? signatureBundle.headmaster
        : null;

  const reportReady = useMemo(() => {
    if (!currentData || !currentClass || !currentStudent) return false;
    const classResults = buildClassResults(currentClass, currentData.marks, settings.gradeBoundaries, settings.divisionRanges);
    const report = buildSchoolReport([classResults], settings);
    return report.students.some((item) => item.student.student_id === currentStudent.student_id);
  }, [currentData, currentClass, currentStudent, settings]);

  function autoAssignBehaviourAll() {
    const next: Record<string, (number | null)[]> = {};
    for (const student of classStudents) {
      next[student.student_id] = randomBehaviourRatings();
    }
    setBehaviorByStudent((current) => ({ ...current, ...next }));
    setSaveState("idle");
  }

  async function saveReportSettings() {
    if (!canEditRequirements) return;
    setSaveState("saving");
    setSaveError("");
    try {
      if (scope) {
        await saveStreamReportSettings(scope.streamId, scope.year, scope.term, {
          schoolClosed,
          closingDate,
          openingDate,
          examId: selectedExamId,
          behavior: behaviorByStudent,
          requirements,
        });
        setRequirementsByStream((current) => ({ ...current, [scope.streamId]: requirements }));
      } else {
        if (!signatureClassId || !signatureYear || !signatureTerm) {
          throw new Error("Chagua mtihani na darasa kwanza kabla ya kuhifadhi mahitaji.");
        }
        await saveReportRequirements({
          classId: signatureClassId,
          year: signatureYear,
          term: signatureTerm,
          requirements,
        });
        setRequirementsByStream((current) => {
          const next: Record<string, string[]> = { ...current };
          for (const streamId of Object.keys(next)) next[streamId] = requirements;
          return next;
        });
      }
      setSaveState("saved");
    } catch (saveFailure) {
      setSaveState("error");
      setSaveError(saveFailure instanceof Error ? saveFailure.message : "Imeshindikana kuhifadhi mipangilio.");
    }
  }

  async function handleSaveSignature(signatureData: string) {
    if (!signPadRole) throw new Error("Huna ruhusa ya kusaini ripoti hii.");
    if (!signatureClassId || !signatureYear || !signatureTerm) {
      throw new Error("Chagua mtihani na darasa kwanza kabla ya kusaini.");
    }
    if (signPadRole === "StreamTeacher" && !scopedStreamId) {
      throw new Error("Mkondo haujatambuliwa kwa sahihi hii.");
    }
    const streamId = signPadRole === "StreamTeacher" ? scopedStreamId : null;
    const response = await saveReportSignature({
      classId: signatureClassId,
      streamId,
      year: signatureYear,
      term: signatureTerm,
      signatureData,
    });
    setSignatures((current) => [
      ...current.filter((item) => !(
        item.signer_role === response.signature.signer_role
        && item.stream_id === response.signature.stream_id
      )),
      response.signature,
    ]);
    setSignPadRole(null);
  }

  async function handleClearSignature() {
    if (!signPadRole) return;
    if (!signatureClassId || !signatureYear || !signatureTerm) return;
    if (signPadRole === "StreamTeacher" && !scopedStreamId) return;
    const streamId = signPadRole === "StreamTeacher" ? scopedStreamId : null;
    await clearReportSignature({
      classId: signatureClassId,
      streamId,
      year: signatureYear,
      term: signatureTerm,
    });
    setSignatures((current) => current.filter((item) => !(
      item.signer_role === signPadRole
      && item.stream_id === streamId
    )));
    setSignPadRole(null);
  }

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
      </div>

      <div className="rc-report-toolbar rc-no-print">
        <label className="res-field"><span className="res-field-label">Hali ya Shule</span>
          <select className="res-select" value={schoolClosed ? "closed" : "open"} onChange={(event) => { setSchoolClosed(event.target.value === "closed"); setSaveState("idle"); }}>
            <option value="open">Haitafungwi</option>
            <option value="closed">Itafungwa</option>
          </select>
        </label>
        {schoolClosed && (
          <>
            <label className="res-field"><span className="res-field-label">Tarehe ya Kufunga</span>
              <input type="date" className="res-select" value={closingDate} onChange={(event) => { setClosingDate(event.target.value); setSaveState("idle"); }} />
            </label>
            <label className="res-field"><span className="res-field-label">Tarehe ya Kufungua</span>
              <input type="date" className="res-select" value={openingDate} onChange={(event) => { setOpeningDate(event.target.value); setSaveState("idle"); }} />
            </label>
          </>
        )}
        <label className="res-field"><span className="res-field-label">Mtihani</span>
          <select className="res-select" value={selectedExamId} onChange={(event) => { setSelectedExamId(event.target.value); setSelectedClassId(""); setSelectedStudentId(""); setSaveState("idle"); }}>
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
        {canEditRequirements && (
          <div className="res-field rc-requirements-field">
            <span className="res-field-label">Mahitaji ya Wanafunzi — yanaonekana kwenye ripoti zote</span>
            <textarea
              className="res-select rc-requirements-input"
              rows={3}
              placeholder={"Sabuni ya Dex\nJembe\nKopo la maji"}
              value={requirementDraft ?? requirements.join("\n")}
              onChange={(event) => {
                const text = event.target.value;
                setRequirementDraft(text);
                setRequirements(parseRequirementText(text));
                setSaveState("idle");
              }}
              onBlur={() => setRequirementDraft(null)}
            />
            <div className="rc-requirements-foot">
              <span className="rc-requirements-hint">
                Kila kipengele kimoja kwenye mstari wake, kisha bofya{" "}
                {scope ? "“Hifadhi Mipangilio”" : "“Hifadhi Mahitaji”"}.
              </span>
            </div>
          </div>
        )}
        <div className="rc-report-actions">
          <button className="cm-btn cm-btn--ghost" onClick={printSingle}>Chapisha Moja / PDF</button>
          <button className="cm-btn cm-btn--primary" onClick={printWholeClass}>Chapisha Darasa Zima</button>
          {scope && (
            <button className="cm-btn cm-btn--ghost rc-auto-btn" onClick={autoAssignBehaviourAll}>
              Auto-assign Tabia (Wote)
            </button>
          )}
          {canEditRequirements && (
            <>
              <button className="cm-btn cm-btn--primary" onClick={saveReportSettings} disabled={saveState === "saving"}>
                {saveState === "saving"
                  ? "Inahifadhi..."
                  : scope
                    ? "Hifadhi Mipangilio"
                    : "Hifadhi Mahitaji"}
              </button>
              {saveState === "saved" && (
                <span className="rc-save-status rc-save-status--ok">
                  {scope ? "Mipangilio imehifadhiwa." : "Mahitaji yamehifadhiwa."}
                </span>
              )}
              {saveState === "error" && <span className="rc-save-status rc-save-status--error">{saveError}</span>}
            </>
          )}
          {signatureLoading && <span className="rc-save-status">Inapakia sahihi...</span>}
          {signatureError && <span className="rc-save-status rc-save-status--error">{signatureError}</span>}
        </div>
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
              exam={currentExam}
              schoolClosed={schoolClosed}
              closingDate={closingDate}
              openingDate={openingDate}
              canGenerateConduct={Boolean(scope)}
              behaviorRatings={behaviorByStudent[currentStudent.student_id] ?? Array(8).fill(null)}
              behaviorEditable={Boolean(scope)}
              onBehaviorRatingsChange={(ratings) => {
                setBehaviorByStudent((current) => ({ ...current, [currentStudent.student_id]: ratings }));
                setSaveState("idle");
              }}
              requirements={currentRequirements}
              signatures={signatureBundle}
              signerRole={signerRole}
              onSign={setSignPadRole}
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
                    exam={currentExam}
                    schoolClosed={schoolClosed}
                    closingDate={closingDate}
                    openingDate={openingDate}
                    canGenerateConduct={Boolean(scope)}
                    behaviorRatings={behaviorByStudent[student.student_id] ?? Array(8).fill(null)}
                    behaviorEditable={Boolean(scope)}
                    onBehaviorRatingsChange={(ratings) => {
                      setBehaviorByStudent((current) => ({ ...current, [student.student_id]: ratings }));
                      setSaveState("idle");
                    }}
                    requirements={requirementsForStudent(student)}
                    signatures={signatureBundle}
                    signerRole={signerRole}
                    onSign={setSignPadRole}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {signPadRole && (
        <SignaturePad
          open={Boolean(signPadRole)}
          roleLabel={SIGNER_LABELS[signPadRole]}
          scopeLabel={[
            currentClass.class_name,
            signPadRole === "StreamTeacher" ? (scope?.streamName ?? currentStudent?.stream_name ?? "") : "",
            signatureYear,
            signatureTerm ? `Muhula ${signatureTerm}` : "",
          ].filter(Boolean).join(" · ")}
          canClear={Boolean(ownSignature)}
          onClose={() => setSignPadRole(null)}
          onSave={handleSaveSignature}
          onClear={handleClearSignature}
        />
      )}
    </div>
  );
}