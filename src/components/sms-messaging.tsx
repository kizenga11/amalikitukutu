"use client";

import "./sms-messaging.css";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api-client";
import { errorMessage } from "@/lib/errors";
import {
  fetchClassesWithStreams,
  fetchExams,
  fetchStudents,
  type DbClassRow,
  type DbExamRow,
  type DbStudentRow,
  type ExamStatus,
} from "@/lib/school-api";
import { Spinner } from "@/components/loading";
import SmsHistory from "@/components/sms-history";

const ELIGIBLE_EXAM_STATUSES: ExamStatus[] = ["processing", "published"];
const STUDENT_PAGE_SIZE = 500;

interface SmsSendResultRow {
  student_id: string | null;
  name: string;
  phone: string;
  ok: boolean;
  status: string;
  messageId: string | null;
  error: string | null;
}

interface SmsSkippedRow {
  student_id: string;
  name: string;
  phone: string | null;
  reason: string;
}

interface SmsSendResponse {
  ok: boolean;
  summary: { total: number; sent: number; failed: number; skipped: number };
  results: SmsSendResultRow[];
  skipped: SmsSkippedRow[];
  error?: string;
}

interface SmsPreviewExample {
  name: string;
  phone: string;
  message: string;
}

type ActionTab = "results" | "custom";
type Scope = "selected" | "all";

function smsParts(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 160));
}

function fullName(row: DbStudentRow): string {
  return [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
}

function hasValidPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const cleaned = raw.replace(/[\s\-().]/g, "");
  return /^(\+255|0)[67]\d{8}$/.test(cleaned) || /^255[67]\d{8}$/.test(cleaned) || /^[67]\d{8}$/.test(cleaned);
}

async function fetchAllStudents(filters: { search?: string; classId?: string; streamId?: string }): Promise<DbStudentRow[]> {
  let page = 1;
  let rows: DbStudentRow[] = [];
  for (;;) {
    const res = await fetchStudents({ ...filters, page, pageSize: STUDENT_PAGE_SIZE });
    rows = rows.concat(res.rows);
    if (res.rows.length < STUDENT_PAGE_SIZE || page >= 20) break;
    page += 1;
  }
  return rows;
}

export default function SmsMessaging() {
  const [classes, setClasses] = useState<DbClassRow[]>([]);
  const [students, setStudents] = useState<DbStudentRow[]>([]);
  const [exams, setExams] = useState<DbExamRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");

  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<ActionTab>("results");
  const [scope, setScope] = useState<Scope>("selected");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [customText, setCustomText] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<SmsSendResponse | null>(null);

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<SmsPreviewExample[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let active = true;
    authedFetch("/api/sms")
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data: { configured?: boolean }) => {
        if (active) setConfigured(Boolean(data.configured));
      })
      .catch(() => {
        if (active) setConfigured(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    fetchClassesWithStreams().then(setClasses).catch(() => setClasses([]));
    fetchExams({ search: "", page: 1, pageSize: 100 })
      .then((res) => {
        setExams(res.rows);
        const first = res.rows.find((exam) => ELIGIBLE_EXAM_STATUSES.includes(exam.status));
        if (first) setSelectedExamId(first.id);
      })
      .catch(() => setExams([]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setDbError(false);
      try {
        const rows = await fetchAllStudents({
          search: debouncedSearch,
          classId: classFilter || undefined,
          streamId: streamFilter || undefined,
        });
        if (active) setStudents(rows);
      } catch {
        if (active) {
          setDbError(true);
          setStudents([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [debouncedSearch, classFilter, streamFilter, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const ready = tab === "results" ? Boolean(selectedExamId) : customText.trim().length > 0;
      if (!ready) {
        setPreview([]);
        setPreviewError("");
        return;
      }
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const payload = {
          action: tab,
          preview: true,
          ...(tab === "results" ? { examId: selectedExamId } : { message: customText.trim() }),
          ...(scope === "selected"
            ? { studentIds: selected }
            : { classId: classFilter || undefined, streamId: streamFilter || undefined }),
        };
        const res = await authedFetch("/api/sms", { method: "POST", body: JSON.stringify(payload) });
        const data = (await res.json()) as { examples?: SmsPreviewExample[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(data.error ?? "Imeshindikana kuonyesha onyesho.");
          setPreview([]);
          return;
        }
        setPreview(data.examples ?? []);
      } catch {
        if (!cancelled) setPreviewError("Imeshindikana kuonyesha onyesho.");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, selectedExamId, customText, scope, classFilter, streamFilter, selected]);

  const eligibleExams = useMemo(
    () => exams.filter((exam) => ELIGIBLE_EXAM_STATUSES.includes(exam.status)),
    [exams],
  );

  const streamOptions = classes.find((c) => c.id === classFilter)?.streams ?? [];

  const withPhone = students.filter((row) => hasValidPhone(row.phone)).length;
  const selectedSet = new Set(selected);

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function selectAllShown() {
    setSelected((prev) => Array.from(new Set([...prev, ...students.map((row) => row.id)])));
  }

  function clearSelection() {
    setSelected([]);
  }

  function onClassFilterChange(value: string) {
    setClassFilter(value);
    setStreamFilter("");
  }

  const scopeCount = scope === "selected" ? selected.length : withPhone;

  function openConfirm() {
    setSendError("");
    if (tab === "results" && !selectedExamId) {
      setSendError("Chagua mtihani kwanza.");
      return;
    }
    if (tab === "custom" && !customText.trim()) {
      setSendError("Andika ujumbe kwanza.");
      return;
    }
    if (scope === "selected" && selected.length === 0) {
      setSendError("Chagua angalau mwanafunzi mmoja, au chagua kuwatumia wote kwenye kichujio.");
      return;
    }
    setConfirmOpen(true);
  }

  async function sendSms() {
    if (sending) return;
    setSending(true);
    setSendError("");
    setSendResult(null);
    try {
      const payload: Record<string, unknown> = {
        action: tab,
        ...(tab === "results" ? { examId: selectedExamId } : { message: customText.trim() }),
        ...(scope === "selected"
          ? { studentIds: selected }
          : { classId: classFilter || undefined, streamId: streamFilter || undefined }),
      };
      const res = await authedFetch("/api/sms", { method: "POST", body: JSON.stringify(payload) });
      const data = (await res.json()) as SmsSendResponse;
      if (!res.ok) {
        setSendError(data.error ?? "Imeshindikana kutuma SMS.");
        setConfirmOpen(false);
        return;
      }
      setSendResult(data);
      setConfirmOpen(false);
    } catch (error) {
      setSendError(errorMessage(error, "Imeshindikana kutuma SMS."));
      setConfirmOpen(false);
    } finally {
      setSending(false);
    }
  }

  const missingPhones = students.length - withPhone;

  if (showHistory) {
    return <SmsHistory onClose={() => setShowHistory(false)} />;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">SMS kwa Wazazi</h2>
          <p className="page-sub">
            Tuma matokeo au ujumbe maalum kwa wazazi kupitia Africa&apos;s Talking. Chagua wanafunzi au tuma kwa wote.
          </p>
        </div>
        <div className="page-head-right">
          <button className="sm-add-btn sms-history-btn" onClick={() => setShowHistory(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
            Histori
          </button>
          <span className="active-chip">● {students.length.toLocaleString()} Wanafunzi</span>
        </div>
      </div>

      <div className="sms-tabs">
        <button className={`sms-tab${tab === "results" ? " sms-tab--active" : ""}`} onClick={() => setTab("results")}>
          Matokeo ya Mtihani
        </button>
        <button className={`sms-tab${tab === "custom" ? " sms-tab--active" : ""}`} onClick={() => setTab("custom")}>
          Ujumbe Maalum
        </button>
      </div>

      {configured === false && (
        <div className="sms-config-card">
          <div className="sms-config-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
          </div>
          <div className="sms-config-body">
            <h3 className="sms-config-title">SMS haijasanidiwa bado</h3>
            <p className="sms-config-text">
              Ili kutuma SMS halisi, weka credentials za Africa&apos;s Talking kwenye faili{" "}
              <code>.env.local</code> kwenye kompyuta ya server, kisha anzisha app upya. Unaweza kuona onyesho la
              ujumbe hapa chini hata kabla ya kusanidi.
            </p>
            <ul className="sms-config-list">
              <li><code>AFRICASTALKING_USERNAME</code> — jina lako la app (tumia <code>sandbox</code> kwa majaribio)</li>
              <li><code>AFRICASTALKING_API_KEY</code> — API key kutoka Africa&apos;s Talking dashboard</li>
              <li><code>AFRICASTALKING_SENDER_ID</code> — (si lazima) jina la mtumaji / short code</li>
            </ul>
            <p className="sms-config-text sms-config-text--muted">
              Pata credentials: login <strong>account.africastalking.com</strong> → Settings → API Key.
            </p>
          </div>
        </div>
      )}

      <div className="sms-layout">
        <div className="panel sms-recipients">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Wapokeaji</h3>
              <p className="panel-sub">
                {withPhone.toLocaleString()} wana namba halali
                {missingPhones > 0 ? ` · ${missingPhones} hawana namba` : ""}
              </p>
            </div>
          </div>

          <div className="sms-filters">
            <div className="sm-search-bar">
              <svg className="sm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input
                className="sm-search"
                type="text"
                placeholder="Tafuta jina, namba ya usajili..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select className="st-filter" value={classFilter} onChange={(event) => onClassFilterChange(event.target.value)}>
              <option value="">Madarasa yote</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
            <select
              className="st-filter"
              value={streamFilter}
              onChange={(event) => setStreamFilter(event.target.value)}
              disabled={!classFilter}
            >
              <option value="">Mikondo yote</option>
              {streamOptions.map((stream) => (
                <option key={stream.id} value={stream.id}>{stream.name}</option>
              ))}
            </select>
          </div>

          <div className="sms-selectbar">
            <span className="sms-selected-count">{selected.length} wamechaguliwa</span>
            <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={selectAllShown} disabled={students.length === 0}>
              Chagua wote walioonyeshwa
            </button>
            <button className="cm-btn cm-btn--ghost cm-btn--sm" onClick={clearSelection} disabled={selected.length === 0}>
              Ondoa uteuzi
            </button>
          </div>

          {dbError ? (
            <div className="st-empty-state">
              Imeshindikana kupakia wanafunzi.
              <div><button className="cm-btn cm-btn--ghost st-retry" onClick={() => setRefreshToken((n) => n + 1)}>Jaribu tena</button></div>
            </div>
          ) : loading ? (
            <div className="me-loading"><Spinner size={20} /></div>
          ) : students.length === 0 ? (
            <div className="st-empty-state">Hakuna wanafunzi wanaofanana na kichujio.</div>
          ) : (
            <div className="sms-table-wrap">
              <table className="sm-table sms-table">
                <thead>
                  <tr>
                    <th style={{ width: 42 }}>
                      <input
                        type="checkbox"
                        checked={students.length > 0 && students.every((row) => selectedSet.has(row.id))}
                        onChange={(event) => (event.target.checked ? selectAllShown() : clearSelection())}
                        aria-label="Chagua wote"
                      />
                    </th>
                    <th>Mwanafunzi</th>
                    <th>Darasa</th>
                    <th>Namba ya Simu</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((row) => {
                    const valid = hasValidPhone(row.phone);
                    return (
                      <tr key={row.id} className={selectedSet.has(row.id) ? "sms-row--selected" : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedSet.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            aria-label={`Chagua ${fullName(row)}`}
                          />
                        </td>
                        <td>
                          <div className="sms-student-name">{fullName(row)}</div>
                          <div className="sms-student-meta">{row.registration_no ?? "—"}</div>
                        </td>
                        <td>{row.school_classes?.name ?? "—"}{row.streams?.name ? ` · ${row.streams.name}` : ""}</td>
                        <td>
                          <span className={`sms-phone${valid ? "" : " sms-phone--bad"}`}>
                            {row.phone ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel sms-compose">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">{tab === "results" ? "Tuma Matokeo" : "Tuma Ujumbe Maalum"}</h3>
              <p className="panel-sub">
                {tab === "results"
                  ? "Kila mzazi atapokea matokeo ya mtoto wake."
                  : "Ujumbe mmoja kwa wazazi wote waliochaguliwa."}
              </p>
            </div>
          </div>

          <div className="sms-scope">
            <label className={`sms-scope-option${scope === "selected" ? " sms-scope-option--active" : ""}`}>
              <input type="radio" name="scope" checked={scope === "selected"} onChange={() => setScope("selected")} />
              <span>
                Waliochaguliwa
                <em>{selected.length} mwanafunzi</em>
              </span>
            </label>
            <label className={`sms-scope-option${scope === "all" ? " sms-scope-option--active" : ""}`}>
              <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} />
              <span>
                Wote kwenye kichujio
                <em>{withPhone} mwanafunzi</em>
              </span>
            </label>
          </div>

          {tab === "results" ? (
            <label className="res-field sms-field">
              <span className="res-field-label">Mtihani</span>
              <span className="res-select-wrap">
                <select className="res-select" value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
                  {eligibleExams.length === 0 ? (
                    <option value="">Hakuna mtihani ulio tayari</option>
                  ) : (
                    eligibleExams.map((exam) => (
                      <option key={exam.id} value={exam.id}>{exam.name}</option>
                    ))
                  )}
                </select>
              </span>
            </label>
          ) : (
            <label className="res-field sms-field">
              <span className="res-field-label">Ujumbe</span>
              <textarea
                className="sms-textarea"
                rows={5}
                maxLength={600}
                placeholder="Andika ujumbe wako hapa..."
                value={customText}
                onChange={(event) => setCustomText(event.target.value)}
              />
              <span className="sms-hint">
                Unaweza kutumia: {"{jina}"}, {"{jina_kamili}"}, {"{regno}"}, {"{darasa}"}. Herufi {customText.length}/600.
              </span>
            </label>
          )}

          {scope === "all" && !classFilter && (
            <p className="sms-warning">Tahadhari: hujachagua darasa — ujumbe utatumwa kwa wanafunzi wote wa shule wenye namba.</p>
          )}

          {sendError && <p className="sms-error" role="alert">{sendError}</p>}

          <button className="cm-btn cm-btn--primary sms-send" onClick={openConfirm} disabled={sending || scopeCount === 0 || configured === false}>
            {sending ? <><Spinner size={14} /> Inatuma…</> : `Tuma kwa wazazi (${scopeCount})`}
          </button>

          <div className="sms-preview">
            <div className="sms-preview-head">
              <span className="sms-preview-title">Onyesho la SMS</span>
              {previewLoading && <Spinner size={13} />}
            </div>
            <div className="sms-phone">
              <div className="sms-phone-screen">
                <div className="sms-phone-top">
                  <span className="sms-phone-sender">KITUKUTU TECHNICAL</span>
                  <span className="sms-phone-time">sasa</span>
                </div>
                {previewError ? (
                  <p className="sms-preview-note">{previewError}</p>
                ) : preview.length === 0 ? (
                  <p className="sms-preview-note">
                    {tab === "results"
                      ? "Chagua mtihani ili kuona mfano wa SMS itakayotumwa."
                      : "Andika ujumbe ili kuona mfano wa SMS itakayotumwa."}
                  </p>
                ) : (
                  preview.map((example, index) => (
                    <div className="sms-bubble" key={`${example.phone}-${index}`}>
                      <div className="sms-bubble-text">{example.message}</div>
                      <div className="sms-bubble-meta">
                        {example.name}
                        {example.phone ? ` · ${example.phone}` : ""} · {example.message.length} herufi · SMS {smsParts(example.message)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {sendResult && (
        <div className="panel sms-report">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Ripoti ya Kutuma</h3>
              <p className="panel-sub">
                Zilizofanikiwa: <strong>{sendResult.summary.sent}</strong> · Zilizoshindikana: <strong>{sendResult.summary.failed}</strong> · Zilizorukwa: <strong>{sendResult.summary.skipped}</strong>
              </p>
            </div>
            <button className="cm-icon-btn" title="Funga ripoti" onClick={() => setSendResult(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>

          <div className="sms-table-wrap">
            <table className="sm-table sms-table">
              <thead>
                <tr>
                  <th>Mwanafunzi</th>
                  <th>Namba</th>
                  <th>Hali</th>
                </tr>
              </thead>
              <tbody>
                {sendResult.results.map((row) => (
                  <tr key={row.student_id ?? row.phone}>
                    <td>{row.name}</td>
                    <td>{row.phone}</td>
                    <td>
                      <span className={`sms-status${row.ok ? " sms-status--ok" : " sms-status--fail"}`}>
                        {row.ok ? row.status || "Imefanikiwa" : row.error || row.status || "Imeshindikana"}
                      </span>
                    </td>
                  </tr>
                ))}
                {sendResult.skipped.map((row) => (
                  <tr key={row.student_id} className="sms-row--skip">
                    <td>{row.name}</td>
                    <td>{row.phone ?? "—"}</td>
                    <td>
                      <span className="sms-status sms-status--skip">
                        {row.reason === "no-phone" ? "Hana namba" : row.reason === "no-result" ? "Hakuna matokeo" : row.reason}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="cm-modal-backdrop" onClick={() => (sending ? undefined : setConfirmOpen(false))}>
          <div className="cm-modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="cm-modal-title">Thibitisha kutuma SMS</h3>
            <p className="cm-modal-text">
              {tab === "results"
                ? `Ujumbe wa matokeo utatumwa kwa wazazi ${scopeCount}.`
                : `Ujumbe wako utatumwa kwa wazazi ${scopeCount}.`}
              {" "}Kila SMS ina gharama. Endelea?
            </p>
            {sendError && <p className="sms-error" role="alert">{sendError}</p>}
            <div className="cm-modal-actions">
              <button className="cm-btn cm-btn--ghost" disabled={sending} onClick={() => setConfirmOpen(false)}>Ghairi</button>
              <button className={`cm-btn cm-btn--primary${sending ? " btn-loading" : ""}`} disabled={sending} onClick={() => void sendSms()}>
                {sending ? <><Spinner size={14} /> Inatuma…</> : "Ndiyo, tuma"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
