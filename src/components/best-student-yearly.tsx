"use client";

import "./best-student-yearly.css";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/loading";
import { supabase } from "@/lib/supabase";
import { currentYearId } from "@/lib/calendar";
import { fetchSchoolInfo, type SchoolInfo } from "@/lib/school-api";
import type { StreamTeacherScope } from "@/lib/stream-teacher-api";
import {
  MIN_EXAMS_PER_SUBJECT,
  type ExcludedStudent,
  type YearlyReport,
  type YearlyStudentRow,
} from "@/lib/yearly-results";

interface StreamOption {
  id: string;
  name: string;
}

interface FormOption {
  class_id: string;
  class_name: string;
  form_level: number;
  streams: StreamOption[];
}

interface ExamOption {
  id: string;
  name: string;
  start_date: string;
}

interface ReportPayload {
  className: string;
  formLevel: number | null;
  year: string;
  exams: ExamOption[];
  report: YearlyReport;
  generatedAt: string;
}

type SortField = "pos" | "name" | "average";

const CertificateEditor = dynamic(() => import("@/components/BestStudentCertificate"), {
  ssr: false,
  loading: () => (
    <div className="me-loading" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}>
      <Spinner size={18} />
      <span>Loading certificate…</span>
    </div>
  ),
});

function displayNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function shortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function divisionCode(division: string): string {
  if (!division) return "—";
  const match = division.match(/(?:Division\s+)?(.+)$/i);
  return match ? match[1] : division;
}

function formLabelFromValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Form Four";

  if (typeof value === "number") {
    const names = ["One", "Two", "Three", "Four", "Five", "Six"];
    const index = value - 1;
    return Number.isInteger(value) && value >= 1 && value <= 6 ? `Form ${names[index]}` : `Form ${value}`;
  }

  const text = String(value).trim();
  const match = text.match(/form\s*[- ]?\s*(\d+|one|two|three|four|five|six)/i);
  if (match) {
    const raw = match[1].toLowerCase();
    if (["one", "two", "three", "four", "five", "six"].includes(raw)) {
      const index = ["one", "two", "three", "four", "five", "six"].indexOf(raw);
      return `Form ${["One", "Two", "Three", "Four", "Five", "Six"][index]}`;
    }
    const asNumber = Number(raw);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= 6) {
      return `Form ${["One", "Two", "Three", "Four", "Five", "Six"][asNumber - 1]}`;
    }
  }

  const lowered = text.toLowerCase();
  if (lowered.includes("one")) return "Form One";
  if (lowered.includes("two")) return "Form Two";
  if (lowered.includes("three")) return "Form Three";
  if (lowered.includes("four")) return "Form Four";
  if (lowered.includes("five")) return "Form Five";
  if (lowered.includes("six")) return "Form Six";
  return text || "Form Four";
}

interface Props {
  scope?: StreamTeacherScope | null;
}

export default function BestStudentYearly({ scope = null }: Props = {}) {
  const [token, setToken] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo | null>(null);

  const [years, setYears] = useState<{ id: string; label: string }[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");

  const [year, setYear] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");

  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);

  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmLowExams, setConfirmLowExams] = useState(false);
  const [includeLeft, setIncludeLeft] = useState(false);

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("pos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [certificateWinnerId, setCertificateWinnerId] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");

  const apiGet = useCallback(
    async (params: Record<string, string>): Promise<Response> => {
      const query = new URLSearchParams(params).toString();
      return fetch(`/api/best-student?${query}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    },
    [token],
  );

  const scopeClassId = scope?.classId ?? "";
  const scopeStreamId = scope?.streamId ?? "";
  const scopeYear = scope?.year ?? "";

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const sessionToken = data.session?.access_token ?? null;
      if (!active) return;
      setToken(sessionToken);
      if (!sessionToken) {
        setOptionsError("Your session has expired. Please sign in again.");
        setLoadingOptions(false);
        return;
      }
      try {
        const params = new URLSearchParams({ action: "options" });
        if (scopeStreamId) {
          params.set("streamId", scopeStreamId);
          params.set("classId", scopeClassId);
          params.set("year", scopeYear);
        }
        const response = await fetch(`/api/best-student?${params.toString()}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        const data2 = (await response.json()) as { years?: { id: string; label: string }[]; forms?: FormOption[]; error?: string };
        if (!active) return;
        if (!response.ok) {
          setOptionsError(data2.error ?? "Could not load forms.");
        } else {
          const availableYears = data2.years ?? [];
          setYears(availableYears);
          setForms(data2.forms ?? []);
          const nowYear = String(new Date().getFullYear());
          setYear(
            scopeYear ||
              availableYears.find((y) => y.id === nowYear)?.id ||
              availableYears.find((y) => y.id === currentYearId)?.id ||
              availableYears[availableYears.length - 1]?.id ||
              "",
          );
          setClassId(scopeClassId);
          setStreamId(scopeStreamId);
        }
      } catch {
        if (active) setOptionsError("Could not reach the server.");
      } finally {
        if (active) setLoadingOptions(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [scopeClassId, scopeStreamId, scopeYear]);

  useEffect(() => {
    fetchSchoolInfo()
      .then((info) => setSchoolInfo(info))
      .catch(() => setSchoolInfo(null));
  }, []);

  useEffect(() => {
    if (!year || !classId || !token) return;
    let active = true;
    (async () => {
      setLoadingExams(true);
      try {
        const params: Record<string, string> = { action: "exams", year, classId };
        if (scopeStreamId) params.streamId = scopeStreamId;
        const response = await apiGet(params);
        const data = (await response.json()) as { exams?: ExamOption[]; error?: string };
        if (!active) return;
        if (!response.ok) {
          setExams([]);
          setSelectedExamIds([]);
          setMessage(data.error ?? "");
        } else {
          const list = data.exams ?? [];
          setExams(list);
          setSelectedExamIds(list.map((exam) => exam.id));
          setMessage("");
        }
      } catch {
        if (active) {
          setExams([]);
          setSelectedExamIds([]);
          setMessage("Could not load exams.");
        }
      } finally {
        if (active) setLoadingExams(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [year, classId, token, apiGet, scopeStreamId]);

  const selectedForm = forms.find((form) => form.class_id === classId) ?? null;

  function resetReport() {
    setPayload(null);
    setMessage("");
    setConfirmLowExams(false);
    setCertificateWinnerId(null);
  }

  function toggleExam(id: string) {
    setSelectedExamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    resetReport();
  }

  function toggleAllExams(checked: boolean) {
    setSelectedExamIds(checked ? exams.map((exam) => exam.id) : []);
    resetReport();
  }

  async function runReport(overrides?: { includeLeft?: boolean }) {
    if (!year || !classId || selectedExamIds.length === 0) {
      setMessage("Select an academic year, a form and at least one exam.");
      return;
    }
    setRunning(true);
    setMessage("");
    try {
      const params: Record<string, string> = {
        action: "report",
        year,
        classId,
        examIds: selectedExamIds.join(","),
      };
      if (streamId) params.streamId = streamId;
      if (selectedExamIds.length < MIN_EXAMS_PER_SUBJECT) params.confirmLowExams = "true";
      if (overrides?.includeLeft ?? includeLeft) params.includeLeft = "true";
      const response = await apiGet(params);
      const data = (await response.json()) as ReportPayload & { error?: string };
      if (!response.ok) {
        setPayload(null);
        setMessage(data.error ?? "Could not build the report.");
        return;
      }
      setPayload(data);
      setSearch("");
      setSortField("pos");
      setSortDir("asc");
    } catch {
      setPayload(null);
      setMessage("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  const subjectColumns = useMemo<{ subject_id: string; code: string; name: string }[]>(() => {
    if (!payload) return [];
    const map = new Map<string, { subject_id: string; code: string; name: string }>();
    for (const subject of payload.report.subjects) {
      map.set(subject.subject_id, { subject_id: subject.subject_id, code: subject.code, name: subject.name });
    }
    // Keep subjects that only appear in a student's personal history (e.g. a
    // subject they left) so their scores are still shown in the detail view.
    for (const row of [...payload.report.ranking, ...payload.report.notRanked]) {
      for (const subject of row.subjects) {
        if (!map.has(subject.subject_id)) {
          map.set(subject.subject_id, { subject_id: subject.subject_id, code: subject.code, name: subject.name });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [payload]);

  const rankedRows = useMemo<YearlyStudentRow[]>(() => {
    if (!payload) return [];
    const rows = [...payload.report.ranking];
    const term = search.trim().toLowerCase();
    const filtered = term ? rows.filter((row) => row.name.toLowerCase().includes(term)) : rows;
    filtered.sort((a, b) => {
      if (sortField === "name") {
        const cmp = a.name.localeCompare(b.name);
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = (a.average ?? -1) - (b.average ?? -1);
      return sortDir === "asc" ? cmp : -cmp;
    });
    if (sortField === "pos") {
      filtered.sort((a, b) => (a.pos_form ?? 9999) - (b.pos_form ?? 9999));
    }
    return filtered;
  }, [payload, search, sortField, sortDir]);

  const excludedById = useMemo(() => {
    const map = new Map<string, ExcludedStudent>();
    for (const item of payload?.report.excluded ?? []) map.set(item.student_id, item);
    return map;
  }, [payload]);

  const leftExcluded = useMemo<ExcludedStudent[]>(
    () => (payload?.report.excluded ?? []).filter((item) => item.reason === "left_subject"),
    [payload],
  );

  const tooFewExcluded = useMemo<ExcludedStudent[]>(
    () => (payload?.report.excluded ?? []).filter((item) => item.reason === "too_few_exams"),
    [payload],
  );

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function scoreFor(row: YearlyStudentRow, subjectId: string): number | null {
    return row.subjects.find((s) => s.subject_id === subjectId)?.average ?? null;
  }

  function exportCsv() {
    if (!payload) return;
    const header = ["Pos (Form)", "Pos (Class)", "Name", "Stream", "Exams", ...subjectColumns.map((s) => s.code), "Yearly Avg", "Division / Status"];
    const lines = [header];
    for (const row of [...payload.report.ranking, ...payload.report.notRanked]) {
      lines.push([
        row.pos_form !== null ? String(row.pos_form) : "Not ranked",
        row.pos_class !== null ? String(row.pos_class) : "—",
        row.name,
        row.stream_name,
        String(row.exams_sat),
        ...subjectColumns.map((s) => displayNumber(scoreFor(row, s.subject_id))),
        displayNumber(row.average),
        row.ranked ? row.division : excludedById.get(row.student_id)?.detail ?? "Not ranked",
      ]);
    }
    const csv = lines
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `best-student-${payload.year}-${payload.className.replace(/\s+/g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loadingOptions) {
    return <div className="me-loading"><Spinner size={20} /></div>;
  }

  if (optionsError) {
    return <div className="st-empty-state">{optionsError}</div>;
  }

  const scoped = Boolean(scope);
  const noForms = forms.length === 0;
  const allSelected = exams.length > 0 && selectedExamIds.length === exams.length;
  const lowExams = selectedExamIds.length > 0 && selectedExamIds.length < MIN_EXAMS_PER_SUBJECT;
  const canRun = Boolean(year && classId && selectedExamIds.length > 0 && !running && (!lowExams || confirmLowExams));
  const report = payload?.report ?? null;
  const certificateWinners = report?.podium.filter((entry) => entry.position === 1) ?? [];
  const certificateWinner = certificateWinnerId ? certificateWinners.find((entry) => entry.student_id === certificateWinnerId) ?? null : null;
  const certificateForm = formLabelFromValue(selectedForm?.form_level ?? payload?.formLevel ?? payload?.className ?? "Form Four");

  return (
    <div className={`result-page bs-page${orientation === "landscape" ? " print-landscape" : ""}`}>
      <div className="page-head result-controls no-print">
        <div>
          <h2 className="page-title">Best Student of the Year</h2>
          <p className="page-sub">
            {scoped
              ? `Rank the best students in ${scope?.className} - ${scope?.streamName} using the exams you select.`
              : "Pick an academic year, form and the exams to combine, then show the yearly ranking."}
          </p>
        </div>
        {payload ? (
          <div className="print-tools">
            <div className="result-mode-tabs print-orientation" role="group" aria-label="Print orientation">
              <button
                className={`ex-tab${orientation === "portrait" ? " ex-tab--active" : ""}`}
                type="button"
                aria-pressed={orientation === "portrait"}
                onClick={() => setOrientation("portrait")}
              >
                Portrait
              </button>
              <button
                className={`ex-tab${orientation === "landscape" ? " ex-tab--active" : ""}`}
                type="button"
                aria-pressed={orientation === "landscape"}
                onClick={() => setOrientation("landscape")}
              >
                Landscape
              </button>
            </div>
            <button className="cm-btn cm-btn--primary" type="button" onClick={() => window.print()}>Print</button>
            <button className="cm-btn cm-btn--ghost" type="button" onClick={exportCsv}>Export CSV</button>
          </div>
        ) : null}
      </div>

      {noForms ? (
        <div className="st-empty-state">
          {scoped ? "No form was found for your assigned stream." : "No forms have been set up yet."}
        </div>
      ) : (
        <>
          <div className="bs-controls no-print">
            <div className="bs-filter-row">
              <label className="res-field">
                <span className="res-field-label">Academic Year</span>
                <select className="res-select" value={year} disabled={scoped} onChange={(event) => { setYear(event.target.value); setClassId(""); setStreamId(""); setExams([]); setSelectedExamIds([]); resetReport(); }}>
                  <option value="">— Select year —</option>
                  {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
                </select>
              </label>

              <label className="res-field">
                <span className="res-field-label">Form</span>
                <select className="res-select" value={classId} disabled={scoped} onChange={(event) => { setClassId(event.target.value); setStreamId(""); setExams([]); setSelectedExamIds([]); resetReport(); }}>
                  <option value="">— Select form —</option>
                  {forms.map((form) => <option key={form.class_id} value={form.class_id}>{form.class_name}</option>)}
                </select>
              </label>

              <label className="res-field">
                <span className="res-field-label">{scoped ? "Your stream" : "Stream (optional)"}</span>
                <select className="res-select" value={streamId} onChange={(event) => { setStreamId(event.target.value); resetReport(); }} disabled={scoped || !classId}>
                  {!scoped && <option value="">All streams</option>}
                  {(selectedForm?.streams ?? []).map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
                </select>
              </label>
            </div>

            <div className="bs-exams">
              <div className="bs-exams-head">
                <span className="res-field-label">Exams ({selectedExamIds.length}/{exams.length})</span>
                <label className="bs-select-all">
                  <input type="checkbox" checked={allSelected} disabled={!exams.length} onChange={(event) => toggleAllExams(event.target.checked)} />
                  Select all
                </label>
              </div>
              {loadingExams ? (
                <div className="me-loading"><Spinner size={18} /></div>
              ) : exams.length === 0 ? (
                <p className="bs-hint">No exams with results for this year and form.</p>
              ) : (
                <div className="bs-exam-list">
                  {exams.map((exam) => (
                    <label key={exam.id} className="bs-exam-item">
                      <input type="checkbox" checked={selectedExamIds.includes(exam.id)} onChange={() => toggleExam(exam.id)} />
                      <span>{exam.name}</span>
                      <em>{shortDate(exam.start_date)}</em>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {lowExams ? (
              <div className="bs-warning no-print" role="alert">
                <strong>Fewer than {MIN_EXAMS_PER_SUBJECT} exams selected.</strong> Ranking is disabled to protect accuracy — a student cannot qualify a subject on so few exams. Tick below to continue with an unranked selection (the per-subject threshold becomes {selectedExamIds.length}).
              </div>
            ) : null}

            {lowExams ? (
              <label className="bs-confirm no-print">
                <input type="checkbox" checked={confirmLowExams} onChange={(event) => { setConfirmLowExams(event.target.checked); setPayload(null); setMessage(""); }} />
                <span>I understand — rank using the {selectedExamIds.length} selected exam(s).</span>
              </label>
            ) : null}

            <label className="bs-confirm no-print">
              <input
                type="checkbox"
                checked={includeLeft}
                onChange={(event) => {
                  const next = event.target.checked;
                  setIncludeLeft(next);
                  if (payload) void runReport({ includeLeft: next });
                }}
              />
              <span>Include students who left their subjects in subject statistics.</span>
            </label>

            <button className="cm-btn cm-btn--primary bs-run-btn" type="button" onClick={() => runReport()} disabled={!canRun}>
              {running ? "Building…" : "Show Results"}
            </button>
          </div>

          {message ? <p className="bs-message no-print" role="alert">{message}</p> : null}

          {report && payload ? (
            <div className="result-paper bs-paper">
              <header className="result-header bs-report-header">
                <div className="bs-header-top">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="bs-header-logo" src={schoolInfo?.schoolLogo || "/assets/logo.png"} alt="School logo" />
                  <div className="bs-header-school">
                    <div className="bs-header-council">
                      {schoolInfo?.council ? `${schoolInfo.council}${schoolInfo.district ? ` — ${schoolInfo.district}` : ""}` : schoolInfo?.district || "COUNCIL"}
                    </div>
                    <h1>{schoolInfo?.name || "School"}</h1>
                    <div className="bs-header-address">
                      {schoolInfo?.address ? `S.L.P ${schoolInfo.address.replace(/^P\.?O\.?\s*Box\s*/i, "")}` : "S.L.P"}
                    </div>
                  </div>
                </div>
                <div className="bs-header-title">
                  <h2>BEST STUDENT OF THE YEAR</h2>
                  <div className="bs-header-period">{payload.year} · {payload.className}{streamId && selectedForm?.streams.find((s) => s.id === streamId) ? ` · ${selectedForm.streams.find((s) => s.id === streamId)?.name}` : ""}</div>
                </div>
                <div className="bs-header-meta">
                  <span>Exams: {report.exams.map((exam) => exam.name).join(", ")}</span>
                  <span>Ranking rule: at least {report.minExamsPerSubject} exam(s) per subject and {report.minSubjectsForRanking} qualifying subjects</span>
                  <span>Date: {shortDate(payload.generatedAt)}</span>
                </div>
              </header>

              {/* A — Hero + podium */}
              {report.podium.length > 0 ? (
                <section className="result-section">
                  <div className="bs-hero">
                    <div className="bs-hero-crown">Best Student of the Year</div>
                    <div className="bs-hero-name">{report.podium[0].name}</div>
                    <div className="bs-hero-sub">
                      {report.podium[0].average !== null ? `${displayNumber(report.podium[0].average)}%` : "—"} · {report.podium[0].grade} · Division {divisionCode(report.podium[0].division)}
                    </div>
                    {certificateWinners.length > 0 ? (
                      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 14 }}>
                        {certificateWinners.map((entry) => (
                          <button
                            key={entry.student_id}
                            type="button"
                            onClick={() => setCertificateWinnerId(entry.student_id)}
                            style={{
                              background: "#0E1F3F",
                              color: "#fff",
                              border: "none",
                              borderRadius: 999,
                              padding: "9px 16px",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                              letterSpacing: 0.5,
                            }}
                          >
                            Cheti
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="bs-podium">
                    {report.podium.map((entry) => (
                      <div key={entry.student_id} className={`bs-podium-card bs-podium-card--${entry.position}`}>
                        <span className="bs-podium-pos">#{entry.position}</span>
                        <span className="bs-podium-name">{entry.name}</span>
                        <span className="bs-podium-meta">{entry.stream_name}</span>
                        <span className="bs-podium-score">{displayNumber(entry.average)} · {entry.grade}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {certificateWinner ? (
                <section className="result-section no-print" style={{ padding: "18px 20px", background: "#f8f8f4", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: 20 }}>Cheti cha Mwanafunzi Bora</h3>
                    <button
                      type="button"
                      onClick={() => setCertificateWinnerId(null)}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        borderRadius: 999,
                        padding: "7px 12px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Funga
                    </button>
                  </div>
                  <CertificateEditor
                    initialName={certificateWinner.name}
                    initialForm={certificateForm}
                    initialYear={String(payload.year ?? new Date().getFullYear())}
                    logoSrc={schoolInfo?.schoolLogo || "/logo.png"}
                    average={certificateWinner.average}
                    grade={certificateWinner.grade}
                    division={certificateWinner.division}
                    points={certificateWinner.total_points}
                  />
                </section>
              ) : null}

              {/* B — Summary */}
              <section className="result-section">
                <h3>Yearly Summary</h3>
                <div className="bs-summary-grid">
                  {[
                    { label: "Students Ranked", value: String(report.summary.ranked) },
                    { label: "Not Ranked", value: String(report.summary.excluded) },
                    { label: "Exams Combined", value: String(report.summary.exams) },
                    { label: "School Average", value: displayNumber(report.summary.mean) },
                    { label: "School Grade", value: report.summary.meanGrade },
                    { label: "School GPA", value: displayNumber(report.summary.meanGpa) },
                    { label: "Highest Avg", value: displayNumber(report.summary.highest) },
                    { label: "Lowest Avg", value: displayNumber(report.summary.lowest) },
                    { label: "Best Subject", value: report.summary.bestSubject ? `${report.summary.bestSubject.code} (${displayNumber(report.summary.bestSubject.average)})` : "—" },
                    { label: "Weakest Subject", value: report.summary.weakestSubject ? `${report.summary.weakestSubject.code} (${displayNumber(report.summary.weakestSubject.average)})` : "—" },
                  ].map((card) => (
                    <div className="bs-card" key={card.label}>
                      <span className="bs-card-label">{card.label}</span>
                      <span className="bs-card-value">{card.value}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* C — Ranking table */}
              <section className="result-section">
                <div className="bs-section-head">
                  <h3>Overall Yearly Ranking</h3>
                  <label className="bs-search no-print">
                    <input type="search" placeholder="Search student" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </label>
                </div>
                {payload.report.ranking.length === 0 ? (
                  <p className="cmp-empty">
                    No student qualified: each needs at least {report.minExamsPerSubject} exams in {report.minSubjectsForRanking} subjects.
                  </p>
                ) : (
                  <>
                    <div className="bs-student-cards">
                      {rankedRows.map((row) => (
                        <div key={row.student_id} className="bs-student-card">
                          <div className="bs-sc-head">
                            <span className="bs-sc-rank">{row.pos_form ?? "—"}</span>
                            <span className="bs-sc-name">{row.name}</span>
                            <span className="bs-sc-div">{row.incomplete ? "Incomplete" : divisionCode(row.division)}</span>
                          </div>
                          <div className="bs-sc-grid">
                            <div><span>Pos (Class)</span><strong>{row.pos_class ?? "—"}</strong></div>
                            <div><span>Exams</span><strong>{row.exams_sat}</strong></div>
                            <div><span>Avg</span><strong>{displayNumber(row.average)}</strong></div>
                            <div><span>Stream</span><strong>{row.stream_name || "—"}</strong></div>
                          </div>
                          {subjectColumns.length > 0 ? (
                            <div className="bs-sc-subjects">
                              {subjectColumns.map((subject) => (
                                <span key={subject.subject_id} className="bs-sc-chip">
                                  <em>{subject.code}</em>
                                  <strong>{displayNumber(scoreFor(row, subject.subject_id))}</strong>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="bs-table-wrap bs-rank-wrap">
                      <table className="bs-table bs-rank-table">
                        <thead>
                        <tr>
                          <th className="bs-col-pos">Pos</th>
                          <th className="bs-col-name">
                            <button type="button" className="bs-sort no-print" onClick={() => toggleSort("name")}>Name {sortField === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}</button>
                            <span className="bs-sort-print">Name</span>
                          </th>
                          <th>Exams</th>
                          {subjectColumns.map((subject) => <th key={subject.subject_id} title={subject.name}>{subject.code}</th>)}
                          <th className="bs-col-avg">
                            <button type="button" className="bs-sort no-print" onClick={() => toggleSort("average")}>Avg {sortField === "average" ? (sortDir === "asc" ? "▲" : "▼") : ""}</button>
                            <span className="bs-sort-print">Avg</span>
                          </th>
                          <th>Div</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankedRows.map((row) => (
                          <tr key={row.student_id}>
                            <td className="bs-col-pos">{row.pos_form ?? "—"}</td>
                            <td className="bs-col-name">{row.name}</td>
                            <td className="bs-num">{row.exams_sat}</td>
                            {subjectColumns.map((subject) => (
                              <td key={subject.subject_id} className="bs-num">{displayNumber(scoreFor(row, subject.subject_id))}</td>
                            ))}
                            <td className="bs-num bs-col-avg"><strong>{displayNumber(row.average)}</strong></td>
                            <td>{row.incomplete ? "Incomplete" : divisionCode(row.division)}</td>
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              {/* C2 — Not ranked / left subjects */}
              {payload.report.excluded.length > 0 ? (
                <section className="result-section">
                  <details className="bs-excluded">
                    <summary>
                      Not ranked / Left subjects ({payload.report.excluded.length})
                    </summary>
                    <p className="bs-hint">
                      These students are not counted in the ranking or subject statistics. Tick <strong>Include students
                      who left their subjects</strong> above to count their scores in the subject statistics only.
                    </p>
                    {leftExcluded.length > 0 ? (
                      <div className="bs-excluded-group">
                        <h4>Left subject{leftExcluded.length > 1 ? "s" : ""}</h4>
                        <ul>
                          {leftExcluded.map((item) => (
                            <li key={item.student_id}>
                              <span className="bs-excluded-name">{item.name}</span>
                              <span className="bs-excluded-stream">{item.stream_name}</span>
                              <span className="bs-excluded-detail">{item.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {tooFewExcluded.length > 0 ? (
                      <div className="bs-excluded-group">
                        <h4>Too few exams</h4>
                        <ul>
                          {tooFewExcluded.map((item) => (
                            <li key={item.student_id}>
                              <span className="bs-excluded-name">{item.name}</span>
                              <span className="bs-excluded-stream">{item.stream_name}</span>
                              <span className="bs-excluded-detail">{item.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </details>
                </section>
              ) : null}

              {/* D — Subject performance */}
              <section className="result-section">
                <h3>Subject Performance</h3>
                <div className="bs-subj-cards">
                  {[...report.subjects].sort((a, b) => (b.average ?? -1) - (a.average ?? -1)).map((subject) => (
                    <div key={subject.subject_id} className="bs-subj-card">
                      <div className="bs-subj-head">
                        <span className="bs-subj-code">{subject.code}</span>
                        <span className="bs-subj-name">{subject.name}</span>
                        <span className={`res-grd grd-${subject.grade}`}>{subject.grade}</span>
                      </div>
                      <div className="bs-subj-grid">
                        <div><span>Sat</span><strong>{subject.sat}</strong></div>
                        <div><span>Average</span><strong>{displayNumber(subject.average)}</strong></div>
                        <div><span>Pass Rate</span><strong>{subject.passRate !== null ? `${displayNumber(subject.passRate)}%` : "—"}</strong></div>
                      </div>
                      <div className="bs-subj-comp">{subject.competency}</div>
                    </div>
                  ))}
                </div>
                <div className="bs-table-wrap bs-subj-wrap">
                  <table className="bs-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Subject</th>
                        <th className="bs-num">Sat</th>
                        <th className="bs-num">Average</th>
                        <th className="bs-num">Pass Rate</th>
                        <th>Grade</th>
                        <th>Competency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...report.subjects].sort((a, b) => (b.average ?? -1) - (a.average ?? -1)).map((subject) => (
                        <tr key={subject.subject_id}>
                          <td>{subject.code}</td>
                          <td>{subject.name}</td>
                          <td className="bs-num">{subject.sat}</td>
                          <td className="bs-num"><strong>{displayNumber(subject.average)}</strong></td>
                          <td className="bs-num">{subject.passRate !== null ? `${displayNumber(subject.passRate)}%` : "—"}</td>
                          <td><span className={`res-grd grd-${subject.grade}`}>{subject.grade}</span></td>
                          <td>{subject.competency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* E — Best per subject */}
              <section className="result-section">
                <h3>Best Student per Subject</h3>
                <div className="bs-best-grid">
                  {report.bestPerSubject.map(({ subject, top }) => (
                    <div key={subject.subject_id} className="bs-best-card">
                      <div className="bs-best-head">
                        <strong>{subject.code}</strong>
                        <span>{subject.name}</span>
                        <em>Class avg {displayNumber(subject.average)}</em>
                      </div>
                      <ol className="bs-best-list">
                        {top.map((student, index) => (
                          <li key={student.student_id}>
                            <span className="bs-best-rank">{index + 1}</span>
                            <span className="bs-best-name">{student.name}</span>
                            <span className="bs-best-stream">{student.stream_name}</span>
                            <span className="bs-best-score">{displayNumber(student.average)} · {student.grade}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>

              <footer className="result-footer">
                {report.method} | Enrollment reflects the current subject assignment (year-scoped enrollment history is not available yet). | Generated: {shortDate(payload.generatedAt)}
              </footer>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
