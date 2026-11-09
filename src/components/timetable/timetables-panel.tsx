"use client";

import { useEffect, useMemo, useState } from "react";
import type { TermNumber } from "@/lib/calendar";
import { termLabel, yearLabel } from "@/lib/calendar";
import type { Role } from "@/components/navigation/nav-config";
import { buildDownloadName, printWithFileName } from "@/lib/download-name";
import {
  DAY_NAMES,
  classSlotOpen,
  displayTime,
  type SolverInput,
  type SolverInputDay,
  type SolverInputDaySlot,
  type SolverLesson,
  type TimetableClass,
  type TimetableLabels,
} from "@/lib/timetable";
import { validateTimetable } from "@/lib/timetable-validator";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/loading";
import { useTimetable, type TimetableClientData } from "./timetable-context";

interface VersionSummary {
  id: string;
  term: string;
  academic_year: string | null;
  term_number: number | null;
  label: string | null;
  status: "draft" | "published";
  score: number | string | null;
  solver_status: string | null;
  diagnostics: unknown;
  created_at: string;
  published_at: string | null;
}

interface VersionDetail extends VersionSummary {
  input_snapshot: SolverInput | null;
}

interface LessonRow {
  id: string;
  versionId: string;
  classId: string;
  subjectId: string | null;
  teacherId: string | null;
  assignmentId: string | null;
  slotId: string;
  size: 1 | 2;
  locked: boolean;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
}

interface VersionPayload {
  version: VersionDetail;
  lessons: LessonRow[];
  error?: string;
}

interface DayData {
  day: number;
  slots: SolverInputDaySlot[];
  anchors: Map<string, LessonRow>;
  continuations: Map<string, LessonRow>;
  spans: Map<string, number>;
}

type ViewMode = "school" | "class" | "teacher";

interface MergeInfo {
  covered: boolean[];
  runStart: Map<number, number>;
  runSpan: Map<number, number>;
}

export default function TimetablesPanel({
  year,
  term,
  role,
}: {
  year: string;
  term: TermNumber;
  role: Role;
}) {
  const { data, labels, token, loading, error } = useTimetable();
  if (loading) return <div className="tt-state"><Spinner /> Loading timetables…</div>;
  if (error) return <div className="tt-state tt-state--error">{error}</div>;
  if (!data) return <div className="tt-state">No timetable data yet.</div>;
  return (
    <TimetablesBody data={data} labels={labels} token={token} year={year} term={term} role={role} />
  );
}

function TimetablesBody({
  data,
  labels,
  token,
  year,
  term,
  role,
}: {
  data: TimetableClientData;
  labels: Required<TimetableLabels>;
  token: string | null;
  year: string;
  term: TermNumber;
  role: Role;
}) {
  const isAdmin = role === "Headmaster" || role === "Academic";
  const termKey = `${year}:${term}`;

  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionsError, setVersionsError] = useState("");
  const [versionsTick, setVersionsTick] = useState(0);

  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailTick, setDetailTick] = useState(0);

  const [mode, setMode] = useState<ViewMode>(isAdmin ? "school" : "teacher");
  const [day, setDay] = useState<number | "all">(1);
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const [dragId, setDragId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [busyLesson, setBusyLesson] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setVersionsLoading(true);
      const { data: rows, error: loadError } = await supabase
        .from("timetable_version")
        .select(
          "id, term, academic_year, term_number, label, status, score, solver_status, diagnostics, created_at, published_at",
        )
        .eq("term", termKey)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (loadError) {
        setVersionsError(loadError.message);
        setVersions([]);
      } else {
        const list = (rows ?? []) as VersionSummary[];
        setVersions(isAdmin ? list : list.filter((entry) => entry.status === "published"));
        setVersionsError("");
      }
      setVersionsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [termKey, versionsTick, isAdmin]);

  const selectedVersion = versions.find((version) => version.id === selectedId) ?? versions[0] ?? null;
  const selectedVersionId = selectedVersion?.id ?? "";

  useEffect(() => {
    if (!selectedVersionId || !token) return;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetail(null);
      setLessons([]);
      setDetailError("");
      setActionError("");
      try {
        const response = await fetch(`/api/timetable/versions/${selectedVersionId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as VersionPayload;
        if (cancelled) return;
        if (!response.ok) {
          setDetailError(payload.error ?? "Could not load this timetable version.");
        } else {
          setDetail(payload.version);
          setLessons(payload.lessons ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDetailError(loadError instanceof Error ? loadError.message : "Could not load this timetable version.");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedVersionId, token, detailTick]);

  const input = useMemo<SolverInput | null>(() => {
    if (detail?.input_snapshot) return detail.input_snapshot;
    if (!detail) return null;
    return data.input;
  }, [detail, data.input]);

  const days = useMemo<SolverInputDay[]>(() => {
    if (input && input.days.length > 0) {
      return [...input.days].sort((a, b) => a.id - b.id);
    }
    const grouped = new Map<number, SolverInputDaySlot[]>();
    for (const slot of data.slots) {
      const bucket = grouped.get(slot.day) ?? [];
      bucket.push({
        id: slot.id,
        start: slot.start,
        end: slot.end,
        kind: slot.kind,
        label: slot.label ?? undefined,
        appliesTo: slot.appliesTo,
      });
      grouped.set(slot.day, bucket);
    }
    return [...grouped]
      .sort((a, b) => a[0] - b[0])
      .map(([id, slots]) => ({
        id,
        slots: [...slots].sort(
          (a, b) =>
            data.slots.findIndex((slot) => slot.id === a.id) -
            data.slots.findIndex((slot) => slot.id === b.id),
        ),
      }));
  }, [input, data.slots]);

  const classes = useMemo(
    () =>
      [...data.classes].sort(
        (a, b) => a.formLevel - b.formLevel || a.label.localeCompare(b.label),
      ),
    [data.classes],
  );

  const activeDayId = days.some((entry) => entry.id === day) ? day : days[0]?.id ?? 1;
  const activeClass = classes.find((entry) => entry.id === classId) ?? classes[0];
  const defaultTeacher = data.viewerTeacherId ?? data.teachers[0]?.id ?? "";
  const activeTeacherId = teacherId || defaultTeacher;
  const activeTeacher = data.teachers.find((entry) => entry.id === activeTeacherId);

  const viewLabels = useMemo<Required<TimetableLabels>>(() => {
    const slotById = new Map(
      days.flatMap((entry) =>
        entry.slots.map((slot) => [
          slot.id,
          `${slot.label ?? slot.kind} ${displayTime(slot.start)}-${displayTime(slot.end)}`,
        ] as const),
      ),
    );
    return {
      ...labels,
      slot: (id: string) => slotById.get(id) ?? labels.slot(id),
    };
  }, [days, labels]);

  const solverLessons = useMemo<SolverLesson[]>(() => {
    if (!input) return [];
    const dayBySlot = new Map<string, number>();
    for (const entry of input.days) {
      for (const slot of entry.slots) dayBySlot.set(slot.id, entry.id);
    }
    return lessons.map((lesson) => ({
      classId: lesson.classId,
      subjectId: lesson.subjectId ?? "",
      teacherId: lesson.teacherId ?? "",
      assignmentId: lesson.assignmentId ?? undefined,
      slotId: lesson.slotId,
      size: lesson.size,
      day: dayBySlot.get(lesson.slotId) ?? 1,
    }));
  }, [input, lessons]);

  const validationIssues = useMemo(() => {
    if (!input) return [];
    const locked = solverLessons.filter((_, index) => lessons[index]?.locked);
    return validateTimetable(input, solverLessons, { locked, labels: viewLabels });
  }, [input, solverLessons, lessons, viewLabels]);

  const canEdit = isAdmin && detail?.status === "draft";

  async function patchLesson(lesson: LessonRow, body: { slotId?: string; locked?: boolean }) {
    if (!token) {
      setActionError("Your session is still loading. Try again in a moment.");
      return;
    }
    setBusyLesson(lesson.id);
    setActionError("");
    setActionNotice("");
    try {
      const response = await fetch(`/api/timetable/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string;
        issues?: { message: string }[];
      };
      if (!response.ok) {
        const details = (payload.issues ?? []).map((issue) => issue.message).join(" ");
        setActionError([payload.error ?? "The change was refused.", details].filter(Boolean).join(" "));
        return;
      }
      setActionNotice(
        body.slotId ? "Lesson moved." : body.locked === false ? "Lesson unlocked." : "Lesson locked.",
      );
      setDetailTick((value) => value + 1);
    } catch (patchError) {
      setActionError(patchError instanceof Error ? patchError.message : "Could not save the lesson.");
    } finally {
      setBusyLesson("");
    }
  }

  function dropOnSlot(slotId: string) {
    if (!dragId) return;
    const lesson = lessons.find((entry) => entry.id === dragId);
    setDragId(null);
    if (!lesson || lesson.slotId === slotId || lesson.locked) return;
    void patchLesson(lesson, { slotId });
  }

  const versionLabel = selectedVersion?.label || "Timetable";
  const fileBase = buildDownloadName([versionLabel, "Timetable", yearLabel(year), termLabel(term)]);

  function printCurrent() {
    printWithFileName(fileBase, () => {
      const root = document.documentElement;
      const style = document.createElement("style");
      style.textContent = "@page { size: A4 landscape; margin: 10mm; }";
      root.classList.add("tt-printing");
      document.head.appendChild(style);
      const cleanup = () => {
        root.classList.remove("tt-printing");
        style.remove();
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
      window.setTimeout(cleanup, 4000);
    });
  }

  function exportExcel() {
    const html = buildExcelHtml(days, classes, lessons);
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileBase}.xls`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const dayData = useMemo(() => {
    const map = new Map<number, DayData>();
    for (const entry of days) map.set(entry.id, buildDayData(entry, lessons));
    return map;
  }, [days, lessons]);

  const diagnostics = diagnosticList(detail?.diagnostics);

  return (
    <div className="tt-panel-stack">
      <section className="tt-card tt-toolbar-card">
        <div className="tt-card-head tt-toolbar-head">
          <div>
            <h2>Timetables</h2>
            <p>{termLabel(term)} · {yearLabel(year)}</p>
          </div>
          <div className="tt-actions tt-no-print">
            <button
              type="button"
              className="cm-btn cm-btn--ghost"
              onClick={() => setVersionsTick((value) => value + 1)}
              disabled={versionsLoading}
            >
              Refresh
            </button>
            <button type="button" className="cm-btn cm-btn--ghost" onClick={printCurrent} disabled={!detail}>
              Print / PDF
            </button>
            <button type="button" className="cm-btn cm-btn--ghost" onClick={exportExcel} disabled={days.length === 0}>
              Excel
            </button>
          </div>
        </div>

        <div className="tt-toolbar-grid tt-no-print">
          <label className="tt-field tt-field--tight">
            <span>Version</span>
            <select value={selectedVersionId} onChange={(event) => setSelectedId(event.target.value)}>
              {versions.length === 0 && <option value="">No versions</option>}
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {(version.label || "Untitled")} · {version.status} · {scoreText(version.score)}
                </option>
              ))}
            </select>
          </label>

          <div className="tt-field tt-field--tight tt-field--view">
            <span>View</span>
            <div className="tt-segmented">
              <button type="button" className={mode === "school" ? "is-active" : ""} onClick={() => setMode("school")}>
                School
              </button>
              <button type="button" className={mode === "class" ? "is-active" : ""} onClick={() => setMode("class")}>
                By class
              </button>
              <button type="button" className={mode === "teacher" ? "is-active" : ""} onClick={() => setMode("teacher")}>
                By teacher
              </button>
            </div>
          </div>

          {mode === "class" && (
            <label className="tt-field tt-field--tight">
              <span>Class</span>
              <select value={activeClass?.id ?? ""} onChange={(event) => setClassId(event.target.value)}>
                {classes.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
            </label>
          )}

          {mode === "teacher" && (
            <label className="tt-field tt-field--tight">
              <span>Teacher</span>
              <select
                value={activeTeacherId}
                onChange={(event) => setTeacherId(event.target.value)}
                disabled={!isAdmin && Boolean(data.viewerTeacherId)}
              >
                {data.teachers.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="tt-field tt-field--tight">
            <span>Validator</span>
            <div>
              <span className={`tt-badge ${validationIssues.length === 0 ? "tt-badge--ok" : "tt-badge--bad"}`}>
                {detail ? (validationIssues.length === 0 ? "Valid" : `${validationIssues.length} issue${validationIssues.length === 1 ? "" : "s"}`) : "—"}
              </span>
            </div>
          </div>

          <div className="tt-field tt-field--tight">
            <span>Status</span>
            <div>
              <span className={`tt-badge ${detail?.status === "published" ? "tt-badge--ok" : "tt-badge--draft"}`}>
                {detail ? (detail.status === "published" ? "Published" : canEdit ? "Draft · editable" : "Draft") : "—"}
              </span>
            </div>
          </div>
        </div>

        {mode === "school" && (
          <div className="tt-tabs tt-no-print">
            {days.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`tt-tab${activeDayId === entry.id ? " is-active" : ""}`}
                onClick={() => setDay(entry.id)}
              >
                {DAY_NAMES[entry.id - 1] ?? `Day ${entry.id}`}
              </button>
            ))}
            <button
              type="button"
              className={`tt-tab${day === "all" ? " is-active" : ""}`}
              onClick={() => setDay("all")}
            >
              All days
            </button>
          </div>
        )}

        {versionsError && <div className="tt-note tt-note--error">{versionsError}</div>}
        {detailError && <div className="tt-note tt-note--error">{detailError}</div>}
        {actionError && <div className="tt-note tt-note--error">{actionError}</div>}
        {actionNotice && <div className="tt-note tt-note--ok">{actionNotice}</div>}

        {detail?.status === "published" && isAdmin && (
          <div className="tt-note tt-note--warn">
            This version is published. Unpublish it on the Generate page before editing lessons.
          </div>
        )}

        {validationIssues.length > 0 && (
          <div className="tt-note tt-note--warn">
            <strong>The validator found hard-rule issues.</strong>
            <ul className="tt-issue-list">
              {validationIssues.map((issue, index) => (
                <li key={`${issue.code}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}

        {diagnostics.length > 0 && (
          <div className="tt-note tt-note--warn">
            <strong>Generator notes</strong>
            <ul className="tt-issue-list">
              {diagnostics.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="tt-card tt-view-card">
        {versionsLoading || detailLoading ? (
          <div className="tt-state"><Spinner /> Loading timetable…</div>
        ) : versions.length === 0 ? (
          <div className="tt-empty">
            No timetable has been generated for this term yet.
          </div>
        ) : !detail ? (
          <div className="tt-empty">Select a version to view its timetable.</div>
        ) : lessons.length === 0 ? (
          <div className="tt-empty">This version has no lessons. Generate again after fixing the issues above.</div>
        ) : (
          <div className="tt-print-root">
            {mode === "school" ? (
              (day === "all" ? days : days.filter((entry) => entry.id === activeDayId)).map((entry) => (
                <div key={entry.id} className="tt-print-day">
                  <PrintHeading
                    title={`${DAY_NAMES[entry.id - 1] ?? `Day ${entry.id}`}`}
                    subtitle={`${versionLabel} · ${termLabel(term)} ${yearLabel(year)}`}
                  />
                  <SchoolDayTable
                    data={dayData.get(entry.id)}
                    entry={entry}
                    classes={classes}
                    canEdit={canEdit}
                    dragId={dragId}
                    busyLesson={busyLesson}
                    onDragStart={setDragId}
                    onDragEnd={() => setDragId(null)}
                    onDropSlot={dropOnSlot}
                    onToggleLock={(lesson) => void patchLesson(lesson, { locked: !lesson.locked })}
                  />
                </div>
              ))
            ) : (
              <div className="tt-print-day">
                <PrintHeading
                  title={
                    mode === "class"
                      ? `${activeClass?.label ?? "Class"} · weekly timetable`
                      : `${activeTeacher?.name ?? "Teacher"} · weekly timetable`
                  }
                  subtitle={`${versionLabel} · ${termLabel(term)} ${yearLabel(year)}`}
                />
                <WeeklyGrid
                  days={days}
                  lessons={lessons}
                  classes={classes}
                  mode={mode}
                  classId={activeClass?.id ?? ""}
                  teacherId={activeTeacherId}
                />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function PrintHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="tt-print-heading">
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}

function SchoolDayTable({
  data,
  entry,
  classes,
  canEdit,
  dragId,
  busyLesson,
  onDragStart,
  onDragEnd,
  onDropSlot,
  onToggleLock,
}: {
  data: DayData | undefined;
  entry: SolverInputDay;
  classes: TimetableClass[];
  canEdit: boolean;
  dragId: string | null;
  busyLesson: string;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropSlot: (slotId: string) => void;
  onToggleLock: (lesson: LessonRow) => void;
}) {
  if (!data) return null;
  const merges = buildColumnMerges(entry.slots, classes);

  return (
    <div className="tt-table-wrap tt-table-wrap--grid">
      <table className="tt-grid tt-grid--school">
        <colgroup>
          <col className="tt-col-class" />
          {entry.slots.map((slot) => (
            <col key={slot.id} className={`tt-col-slot tt-col-slot--${slot.kind}`} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="tt-grid-class">Class</th>
            {entry.slots.map((slot) => (
              <th key={slot.id} className={`tt-slot-head tt-slot-head--${slot.kind}`}>
                <span>{displayTime(slot.start)} - {displayTime(slot.end)}</span>
                {slot.kind !== "lesson" && <em>{slot.label ?? slot.kind.toUpperCase()}</em>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((cls, rowIndex) => (
            <tr key={cls.id}>
              <th className="tt-grid-class" title={cls.streamName}>{cls.label}</th>
              {entry.slots.map((slot) => {
                const merge = merges.get(slot.id);
                if (merge && merge.covered[rowIndex]) {
                  const start = merge.runStart.get(rowIndex);
                  if (start !== rowIndex) return null;
                  const span = merge.runSpan.get(rowIndex) ?? 1;
                  return (
                    <td
                      key={slot.id}
                      className={`tt-merged tt-merged--${slot.kind}`}
                      rowSpan={span}
                    >
                      {slot.label ?? (slot.kind === "break" ? "BREAK" : "SPECIAL")}
                    </td>
                  );
                }

                const key = `${cls.id}|${slot.id}`;
                const lesson = data.anchors.get(key);
                const continuation = data.continuations.get(key);
                if (continuation) return null;

                if (lesson) {
                  const span = data.spans.get(key) ?? 1;
                  const draggable = canEdit && !lesson.locked && !busyLesson;
                  return (
                    <td
                      key={slot.id}
                      colSpan={span}
                      className={`tt-lesson${lesson.locked ? " is-locked" : ""}${dragId === lesson.id ? " is-dragging" : ""}`}
                      draggable={draggable}
                      onDragStart={(event) => {
                        if (!draggable) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", lesson.id);
                        onDragStart(lesson.id);
                      }}
                      onDragEnd={onDragEnd}
                      onDragOver={(event) => {
                        if (canEdit) event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        onDropSlot(slot.id);
                      }}
                      title={`${lesson.subjectName} · ${lesson.teacherName}`}
                    >
                      <div className="tt-lesson-subject">{lesson.subjectCode}</div>
                      <div className="tt-lesson-teacher">{lesson.teacherName}</div>
                      {canEdit && (
                        <button
                          type="button"
                          className="tt-lock"
                          onClick={() => onToggleLock(lesson)}
                          onMouseDown={(event) => event.stopPropagation()}
                          disabled={busyLesson === lesson.id}
                          aria-label={lesson.locked ? "Unlock lesson" : "Lock lesson"}
                          title={lesson.locked ? "Unlock lesson" : "Lock lesson"}
                        >
                          {lesson.locked ? "Locked" : "Lock"}
                        </button>
                      )}
                    </td>
                  );
                }

                const open = classSlotOpen(cls.id, slot);
                return (
                  <td
                    key={slot.id}
                    className={`tt-free${open ? "" : " is-closed"}`}
                    onDragOver={(event) => {
                      if (canEdit) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      onDropSlot(slot.id);
                    }}
                  >
                    {open ? "FREE" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeeklyGrid({
  days,
  lessons,
  classes,
  mode,
  classId,
  teacherId,
}: {
  days: SolverInputDay[];
  lessons: LessonRow[];
  classes: TimetableClass[];
  mode: ViewMode;
  classId: string;
  teacherId: string;
}) {
  const maxSlots = Math.max(0, ...days.map((entry) => entry.slots.length));
  const classById = new Map(classes.map((entry) => [entry.id, entry]));
  const filtered = mode === "teacher" ? lessons.filter((lesson) => lesson.teacherId === teacherId) : lessons;

  const dayMaps = days.map((entry) => buildDayData(entry, filtered));

  // Cells covered by the second half of a double. They are rendered as part
  // of the anchor cell (rowSpan) instead of a separate "↳" row.
  const merged = new Set<string>();
  const slotLocation = new Map<string, { day: number; position: number }>();
  for (const entry of days) {
    entry.slots.forEach((slot, position) => slotLocation.set(slot.id, { day: entry.id, position }));
  }
  for (const lesson of filtered) {
    if (lesson.size !== 2) continue;
    if (mode === "class" && lesson.classId !== classId) continue;
    const location = slotLocation.get(lesson.slotId);
    if (!location) continue;
    const entry = days.find((dayEntry) => dayEntry.id === location.day);
    const next = entry?.slots[location.position + 1];
    if (!next) continue;
    if (mode === "class" && !classSlotOpen(lesson.classId, next)) continue;
    merged.add(`${location.day}|${location.position + 1}`);
  }

  return (
    <div className="tt-table-wrap tt-table-wrap--grid">
      <table className="tt-grid tt-grid--week">
        <thead>
          <tr>
            <th className="tt-grid-class">Slot</th>
            {days.map((entry) => (
              <th key={entry.id} className="tt-slot-head">
                {DAY_NAMES[entry.id - 1] ?? `Day ${entry.id}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxSlots }).map((_, position) => (
            <tr key={position}>
              <th className="tt-grid-class">{position + 1}</th>
              {days.map((entry, dayIndex) => {
                const slot = entry.slots[position];
                if (!slot) return <td key={entry.id} className="tt-week-empty" />;
                if (merged.has(`${entry.id}|${position}`)) return null;
                const data = dayMaps[dayIndex];
                const key = mode === "class" ? `${classId}|${slot.id}` : "";
                const lesson = mode === "class" ? data.anchors.get(key) : findBySlot(filtered, slot.id, "anchor");
                const continues = merged.has(`${entry.id}|${position + 1}`);
                const transition = `${displayTime(slot.start)} - ${displayTime(slot.end)}`;

                if (slot.kind === "break") {
                  return (
                    <td key={entry.id} className="tt-merged tt-merged--break">
                      <div className="tt-week-time">{transition}</div>
                      {slot.label ?? "BREAK"}
                    </td>
                  );
                }

                if (slot.kind === "special") {
                  const closedForClass = mode === "class" && !classSlotOpen(classId, slot);
                  if (closedForClass) {
                    return (
                      <td key={entry.id} className="tt-merged tt-merged--special">
                        <div className="tt-week-time">{transition}</div>
                        {slot.label ?? "SPECIAL"}
                      </td>
                    );
                  }
                }

                if (lesson) {
                  const cls = classById.get(lesson.classId);
                  return (
                    <td
                      key={entry.id}
                      rowSpan={continues ? 2 : undefined}
                      className={`tt-lesson${lesson.locked ? " is-locked" : ""}`}
                    >
                      <div className="tt-week-time">{transition}</div>
                      <div className="tt-lesson-subject">
                        {mode === "class" ? lesson.subjectCode : `${cls?.label ?? "Class"} · ${lesson.subjectCode}`}
                      </div>
                      {mode === "class" && <div className="tt-lesson-teacher">{lesson.teacherName}</div>}
                    </td>
                  );
                }

                const open = mode === "class" ? classSlotOpen(classId, slot) : true;
                return (
                  <td key={entry.id} className={`tt-free${open ? "" : " is-closed"}`}>
                    <div className="tt-week-time">{transition}</div>
                    {mode === "class" && open ? "FREE" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function findBySlot(
  lessons: LessonRow[],
  slotId: string,
  kind: "anchor" | "continuation",
  day?: SolverInputDay,
): LessonRow | undefined {
  if (kind === "anchor") return lessons.find((lesson) => lesson.slotId === slotId);
  if (!day) return undefined;
  return lessons.find((lesson) => {
    if (lesson.size !== 2) return false;
    const index = day.slots.findIndex((slot) => slot.id === lesson.slotId);
    if (index < 0) return false;
    const next = day.slots[index + 1];
    return next?.id === slotId && classSlotOpen(lesson.classId, next);
  });
}

function buildDayData(entry: SolverInputDay, lessons: LessonRow[]): DayData {
  const anchors = new Map<string, LessonRow>();
  const continuations = new Map<string, LessonRow>();
  const spans = new Map<string, number>();
  const slotIndex = new Map(entry.slots.map((slot, index) => [slot.id, index]));

  for (const lesson of lessons) {
    const index = slotIndex.get(lesson.slotId);
    if (index === undefined) continue;
    const key = `${lesson.classId}|${lesson.slotId}`;
    anchors.set(key, lesson);
    spans.set(key, 1);
    if (lesson.size === 2) {
      const next = entry.slots[index + 1];
      if (next && classSlotOpen(lesson.classId, next)) {
        continuations.set(`${lesson.classId}|${next.id}`, lesson);
        spans.set(key, 2);
      }
    }
  }

  return { day: entry.id, slots: entry.slots, anchors, continuations, spans };
}

function buildColumnMerges(slots: SolverInputDaySlot[], classes: TimetableClass[]): Map<string, MergeInfo> {
  const result = new Map<string, MergeInfo>();
  for (const slot of slots) {
    if (slot.kind === "lesson") continue;
    const scopeAll = slot.appliesTo.length === 0 || slot.appliesTo.includes("*");
    const covered = classes.map((cls) => slot.kind === "break" || scopeAll || slot.appliesTo.includes(cls.id));
    if (!covered.some(Boolean)) continue;
    const runStart = new Map<number, number>();
    const runSpan = new Map<number, number>();
    let index = 0;
    while (index < covered.length) {
      if (!covered[index]) {
        index += 1;
        continue;
      }
      let end = index;
      while (end + 1 < covered.length && covered[end + 1]) end += 1;
      for (let cursor = index; cursor <= end; cursor += 1) {
        runStart.set(cursor, index);
        runSpan.set(cursor, end - index + 1);
      }
      index = end + 1;
    }
    result.set(slot.id, { covered, runStart, runSpan });
  }
  return result;
}

function buildExcelHtml(days: SolverInputDay[], classes: TimetableClass[], lessons: LessonRow[]): string {
  const body = days.map((entry) => {
    const data = buildDayData(entry, lessons);
    const header = entry.slots
      .map((slot) => `<th>${escapeHtml(displayTime(slot.start))}-${escapeHtml(displayTime(slot.end))}</th>`)
      .join("");
    const rows = classes
      .map((cls) => {
        const cells = entry.slots
          .map((slot) => {
            if (slot.kind === "break" || (slot.kind === "special" && !classSlotOpen(cls.id, slot))) {
              return `<td class="special">${escapeHtml(slot.label ?? slot.kind.toUpperCase())}</td>`;
            }
            const key = `${cls.id}|${slot.id}`;
            const lesson = data.anchors.get(key);
            if (lesson) {
              return `<td>${escapeHtml(lesson.subjectCode)}<br>${escapeHtml(lesson.teacherName)}</td>`;
            }
            if (data.continuations.has(key)) return `<td>↳</td>`;
            return `<td class="free">FREE</td>`;
          })
          .join("");
        return `<tr><th>${escapeHtml(cls.label)}</th>${cells}</tr>`;
      })
      .join("");
    return `<h3>${escapeHtml(DAY_NAMES[entry.id - 1] ?? `Day ${entry.id}`)}</h3><table><thead><tr><th>Class</th>${header}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif}
    table{border-collapse:collapse;margin-bottom:18px}
    th,td{border:1px solid #9aa5a2;padding:4px 6px;font-size:11px;text-align:center;vertical-align:middle}
    th{background:#e6efec;font-weight:bold}
    td.special{background:#fdf0d5}
    td.free{color:#8a9a96}
  </style></head><body>${body.join("")}</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreText(value: number | string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "—";
}

function diagnosticList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
