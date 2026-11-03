"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/loading";
import { errorMessage } from "@/lib/errors";
import {
  fetchExamDetail,
  fetchIsalRoster,
  type DbExamDetail,
  type DbExamRow,
  type IsalStudent,
} from "@/lib/school-api";
import { buildIsalSheet, type IsalSheet, type IsalSubjectInfo } from "@/lib/isal";
import { buildDownloadName, printWithFileName, yearFromDate } from "@/lib/download-name";

const SCHOOL_NAME = "KITUKUTU TECHNICAL SECONDARY SCHOOL";

// Roster cache lives for the whole browser session, so re-opening a subject
// (or the same exam) never refetches students that were already loaded.
const rosterCache = new Map<string, IsalStudent[]>();

function cacheKey(examId: string, subjectId: string): string {
  return `${examId}|${subjectId}`;
}

function formatIsalDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

type IsalMode = "list" | "single" | "all";

function IsalSheetView({
  sheet,
  examName,
}: {
  sheet: IsalSheet;
  examName: string;
}) {
  return (
    <>
      {sheet.pages.map((page) => (
        <article className="isal-sheet" key={`${sheet.subject_id}-${page.page}`}>
          <header className="isal-head">
            <div className="isal-school">{SCHOOL_NAME}</div>
            <div className="isal-subtitle">Individual Subject Attendance List (ISAL)</div>
            <div className="isal-exam">{examName.toUpperCase()}</div>
            <div className="isal-meta">
              <div className="isal-meta-row">
                <span>
                  <strong>Subject:</strong> {sheet.subject_name.toUpperCase()} ({sheet.subject_code})
                  {sheet.stream_label ? ` — ${sheet.stream_label}` : ""}
                </span>
                <span className="isal-meta-right">
                  <strong>Date:</strong> <span className="isal-date-line" />
                </span>
              </div>
              <div className="isal-meta-row">
                <span>
                  <strong>Boys:</strong> {sheet.boys} &nbsp; <strong>Girls:</strong> {sheet.girls} &nbsp;{" "}
                  <strong>Total:</strong> {sheet.total}
                </span>
                <span className="isal-page-no">
                  Page {page.page} of {page.pages}
                </span>
              </div>
            </div>
          </header>

          <table className="isal-table">
            <thead>
              <tr>
                <th className="isal-col-no">No.</th>
                <th className="isal-col-reg">Reg. No.</th>
                <th className="isal-col-name">Student&apos;s Full Name</th>
                <th className="isal-col-class">Class</th>
                <th className="isal-col-sex">Sex</th>
                <th className="isal-col-sign">Signature</th>
                <th className="isal-col-score">Score</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="isal-empty">
                    No students take this subject.
                  </td>
                </tr>
              )}
              {page.rows.map((row) => (
                <tr key={row.student_id}>
                  <td className="isal-col-no">{row.no}</td>
                  <td className="isal-col-reg">{row.registration_no ?? "—"}</td>
                  <td className="isal-col-name">{row.full_name}</td>
                  <td className="isal-col-class">{row.class_name}</td>
                  <td className="isal-col-sex">{row.sex}</td>
                  <td className="isal-col-sign" />
                  <td className="isal-col-score" />
                </tr>
              ))}
            </tbody>
          </table>

          {page.page === page.pages && (
            <footer className="isal-signatures">
              {["Subject Teacher", "Supervisor 1", "Supervisor 2"].map((role) => (
                <div className="isal-signature-row" key={role}>
                  <span className="isal-sig-role">{role}:</span>
                  <span className="isal-sig-line" />
                  <span className="isal-sig-role isal-sig-role--right">Signature:</span>
                  <span className="isal-sig-line" />
                </div>
              ))}
            </footer>
          )}
        </article>
      ))}
    </>
  );
}

export default function Isal({ exam, onClose }: { exam: DbExamRow; onClose: () => void }) {
  const [detail, setDetail] = useState<DbExamDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [detailError, setDetailError] = useState("");
  const [detailReload, setDetailReload] = useState(0);

  const [mode, setMode] = useState<IsalMode>("list");
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [rosters, setRosters] = useState<Record<string, IsalStudent[]>>({});
  const [loadingSubjectId, setLoadingSubjectId] = useState<string | null>(null);
  const [subjectError, setSubjectError] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [printAfterLoad, setPrintAfterLoad] = useState(false);
  const bulkRunRef = useRef(0);

  useEffect(() => {
    let active = true;
    fetchExamDetail(exam.id)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((error) => {
        if (active) setDetailError(errorMessage(error, "Could not load exam details."));
      })
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => {
      active = false;
    };
  }, [exam.id, detailReload]);

  const classNames = useMemo(
    () => new Map((detail?.classes ?? []).map((cls) => [cls.id, cls.name])),
    [detail],
  );

  const subjects = useMemo<IsalSubjectInfo[]>(() => {
    const map = new Map<string, IsalSubjectInfo>();
    for (const cls of detail?.classes ?? []) {
      for (const subject of cls.subjects) {
        if (!map.has(subject.id)) {
          map.set(subject.id, {
            subject_id: subject.id,
            subject_name: subject.name,
            subject_code: subject.code,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.subject_name.localeCompare(b.subject_name));
  }, [detail]);

  const examYear = useMemo(() => yearFromDate(exam.start_date), [exam.start_date]);

  const allFormLabel = useMemo(() => {
    const names = Array.from(
      new Set((detail?.classes ?? []).map((cls) => cls.name.trim()).filter(Boolean)),
    );
    return names.join(", ");
  }, [detail]);

  const allPrintName = buildDownloadName(["ISAL", exam.name, allFormLabel, examYear]);

  function sheetPrintName(sheet: IsalSheet): string {
    const form = sheet.stream_label === "—" ? "" : sheet.stream_label;
    return buildDownloadName([
      "ISAL",
      exam.name,
      form,
      examYear,
      `${sheet.subject_name} (${sheet.subject_code})`,
    ]);
  }

  useEffect(() => {
    if (!printAfterLoad || bulkProgress) return;
    const timer = setTimeout(() => {
      setPrintAfterLoad(false);
      printWithFileName(allPrintName);
    }, 250);
    return () => clearTimeout(timer);
  }, [printAfterLoad, bulkProgress, allPrintName]);

  function rememberRoster(subjectId: string, students: IsalStudent[]) {
    rosterCache.set(cacheKey(exam.id, subjectId), students);
    setRosters((prev) => ({ ...prev, [subjectId]: students }));
  }

  async function loadRoster(subjectId: string): Promise<IsalStudent[]> {
    const key = cacheKey(exam.id, subjectId);
    const cached = rosterCache.get(key);
    if (cached) {
      setRosters((prev) => (prev[subjectId] ? prev : { ...prev, [subjectId]: cached }));
      return cached;
    }
    const students = await fetchIsalRoster(exam.id, subjectId);
    rememberRoster(subjectId, students);
    return students;
  }

  function backToSubjects() {
    bulkRunRef.current += 1;
    setMode("list");
    setActiveSubjectId(null);
    setSubjectError("");
    setBulkError("");
    setBulkProgress(null);
    setPrintAfterLoad(false);
  }

  async function openSubject(subjectId: string) {
    setMode("single");
    setActiveSubjectId(subjectId);
    setSubjectError("");
    setBulkError("");
    if (rosterCache.has(cacheKey(exam.id, subjectId))) {
      await loadRoster(subjectId);
      return;
    }
    setLoadingSubjectId(subjectId);
    try {
      await loadRoster(subjectId);
    } catch (error) {
      setSubjectError(errorMessage(error, "Could not load students for this subject."));
    } finally {
      setLoadingSubjectId(null);
    }
  }

  async function printAllSubjects() {
    if (subjects.length === 0) return;
    setMode("all");
    setActiveSubjectId(null);
    setSubjectError("");
    setBulkError("");
    setPrintAfterLoad(false);

    const total = subjects.length;
    const run = bulkRunRef.current + 1;
    bulkRunRef.current = run;
    let done = 0;
    setBulkProgress({ done, total, name: "" });

    try {
      for (const subject of subjects) {
        if (bulkRunRef.current !== run) return;
        setBulkProgress({ done, total, name: subject.subject_name });
        await loadRoster(subject.subject_id);
        if (bulkRunRef.current !== run) return;
        done += 1;
        setBulkProgress({ done, total, name: "" });
      }
      if (bulkRunRef.current !== run) return;
      setBulkProgress(null);
      setPrintAfterLoad(true);
    } catch (error) {
      if (bulkRunRef.current !== run) return;
      setBulkProgress(null);
      setBulkError(errorMessage(error, "Could not load all subjects. Try again."));
    }
  }

  const activeSubject = subjects.find((subject) => subject.subject_id === activeSubjectId) ?? null;

  const activeSheet = useMemo(() => {
    if (mode !== "single" || !activeSubject) return null;
    const students = rosters[activeSubject.subject_id];
    if (!students) return null;
    return buildIsalSheet({ subject: activeSubject, students, classNames });
  }, [mode, activeSubject, rosters, classNames]);

  const allSheets = useMemo(() => {
    if (mode !== "all" || bulkProgress || bulkError) return [];
    return subjects
      .filter((subject) => rosters[subject.subject_id])
      .map((subject) =>
        buildIsalSheet({ subject, students: rosters[subject.subject_id], classNames }),
      );
  }, [mode, bulkProgress, bulkError, subjects, rosters, classNames]);

  const canPrintActive =
    mode === "single" && !!activeSheet && !loadingSubjectId && !subjectError;
  const canPrintAll =
    mode === "all" &&
    subjects.length > 0 &&
    allSheets.length === subjects.length &&
    !bulkProgress &&
    !bulkError;

  return (
    <div className="isal-page">
      <div className="page-head isal-no-print">
        <div>
          <button className="cm-btn cm-btn--ghost cm-btn--sm me-back-btn" onClick={onClose}>
            {"\u2190"} Exams
          </button>
          <h2 className="page-title">ISAL</h2>
          <p className="page-sub">
            Individual Subject Attendance List — print the student roster for each subject.
          </p>
        </div>
        <div className="page-head-right">
          <span className="active-chip">{exam.name}</span>
          <span className="active-chip">{formatIsalDate(exam.start_date)}</span>
        </div>
      </div>

      {detailError && (
        <div className="st-empty-state isal-no-print">
          {detailError}
          <div>
            <button
              className="cm-btn cm-btn--ghost st-retry"
              onClick={() => {
                setLoadingDetail(true);
                setDetailError("");
                setDetailReload((value) => value + 1);
              }}
            >
              Try again
            </button>
            <button className="cm-btn cm-btn--ghost st-retry" onClick={onClose}>
              Back
            </button>
          </div>
        </div>
      )}

      {loadingDetail && !detailError && (
        <div className="me-loading">
          <Spinner size={20} />
        </div>
      )}

      {!loadingDetail && !detailError && !detail && (
        <div className="st-empty-state isal-no-print">
          Could not load exam details.
          <div>
            <button className="cm-btn cm-btn--ghost st-retry" onClick={onClose}>
              Back
            </button>
          </div>
        </div>
      )}

      {!loadingDetail && !detailError && detail && mode === "list" && (
        <>
          <div className="isal-toolbar isal-no-print">
            <span className="isal-count">
              {subjects.length} subject{subjects.length === 1 ? "" : "s"}
            </span>
            <div className="isal-toolbar-actions">
              <button
                className="cm-btn cm-btn--primary"
                disabled={subjects.length === 0}
                onClick={printAllSubjects}
              >
                Print ISALs for all subjects
              </button>
            </div>
          </div>

          {subjects.length === 0 ? (
            <div className="st-empty-state isal-no-print">No subjects registered for this exam.</div>
          ) : (
            <div className="isal-subject-grid isal-no-print">
              {subjects.map((subject) => (
                <button
                  key={subject.subject_id}
                  className="isal-subject-card"
                  onClick={() => openSubject(subject.subject_id)}
                >
                  <span className="isal-subject-code">{subject.subject_code}</span>
                  <span className="isal-subject-name">{subject.subject_name}</span>
                  <span className="isal-subject-hint">Open ISAL</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!loadingDetail && !detailError && mode === "single" && activeSubject && (
        <>
          <div className="isal-toolbar isal-no-print">
            <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={backToSubjects}>
              {"\u2190"} Subjects
            </button>
            <span className="isal-count">
              {activeSubject.subject_name} ({activeSubject.subject_code})
            </span>
            <div className="isal-toolbar-actions">
              <button
                className="cm-btn cm-btn--primary"
                disabled={!canPrintActive}
                onClick={() => activeSheet && printWithFileName(sheetPrintName(activeSheet))}
              >
                Print ISAL
              </button>
            </div>
          </div>

          {loadingSubjectId === activeSubject.subject_id && (
            <div className="me-loading isal-no-print">
              <Spinner size={20} />
            </div>
          )}

          {subjectError && (
            <div className="st-empty-state isal-no-print">
              {subjectError}
              <div>
                <button
                  className="cm-btn cm-btn--ghost st-retry"
                  onClick={() => openSubject(activeSubject.subject_id)}
                >
                  Try again
                </button>
                <button className="cm-btn cm-btn--ghost st-retry" onClick={backToSubjects}>
                  Back
                </button>
              </div>
            </div>
          )}

          {activeSheet && (
            <div className="isal-sheets">
              <IsalSheetView sheet={activeSheet} examName={exam.name} />
            </div>
          )}
        </>
      )}

      {!loadingDetail && !detailError && mode === "all" && (
        <>
          <div className="isal-toolbar isal-no-print">
            <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={backToSubjects}>
              {"\u2190"} Subjects
            </button>
            <span className="isal-count">
              {subjects.length} subject{subjects.length === 1 ? "" : "s"} · {allSheets.length} loaded
            </span>
            <div className="isal-toolbar-actions">
              <button
                className="cm-btn cm-btn--primary"
                disabled={!canPrintAll}
                onClick={() => printWithFileName(allPrintName)}
              >
                Print all ISALs
              </button>
            </div>
          </div>

          {bulkProgress && (
            <div className="isal-progress isal-no-print">
              <Spinner size={16} />
              <span>
                {bulkProgress.done >= bulkProgress.total
                  ? "Preparing the printout…"
                  : `Loading subject ${Math.min(bulkProgress.done + 1, bulkProgress.total)} of ${bulkProgress.total}${bulkProgress.name ? `: ${bulkProgress.name}` : ""}…`}
              </span>
            </div>
          )}

          {bulkError && (
            <div className="st-empty-state isal-no-print">
              {bulkError}
              <div>
                <button className="cm-btn cm-btn--ghost st-retry" onClick={printAllSubjects}>
                  Try again
                </button>
                <button className="cm-btn cm-btn--ghost st-retry" onClick={backToSubjects}>
                  Back
                </button>
              </div>
            </div>
          )}

          {!bulkProgress && !bulkError && allSheets.length > 0 && (
            <div className="isal-sheets">
              {allSheets.map((sheet) => (
                <IsalSheetView key={sheet.key} sheet={sheet} examName={exam.name} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
