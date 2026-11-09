"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TermNumber } from "@/lib/calendar";
import { termLabel, yearLabel } from "@/lib/calendar";
import { precheck, type TimetableLabels } from "@/lib/timetable";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/loading";
import { useTimetable } from "./timetable-context";

interface VersionRow {
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

interface GenerateResult {
  versionId?: string;
  status?: string;
  objective?: number | null;
  diagnostics?: string[];
  error?: string;
  issues?: { message: string }[];
}

export default function GeneratePanel({
  year,
  term,
  onShowTimetable,
}: {
  year: string;
  term: TermNumber;
  onShowTimetable: () => void;
}) {
  const { data, labels, loading, error, token, refresh } = useTimetable();
  if (loading) return <div className="tt-state"><Spinner /> Loading generator…</div>;
  if (error) return <div className="tt-state tt-state--error">{error}</div>;
  if (!data) return <div className="tt-state">No timetable data yet.</div>;
  return (
    <GenerateBody
      data={data}
      labels={labels}
      token={token}
      year={year}
      term={term}
      onShowTimetable={onShowTimetable}
      refreshData={refresh}
    />
  );
}

function GenerateBody({
  data,
  labels,
  token,
  year,
  term,
  onShowTimetable,
  refreshData,
}: {
  data: NonNullable<ReturnType<typeof useTimetable>["data"]>;
  labels: Required<TimetableLabels>;
  token: string | null;
  year: string;
  term: TermNumber;
  onShowTimetable: () => void;
  refreshData: () => void;
}) {
  const termKey = `${year}:${term}`;
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [versionsError, setVersionsError] = useState("");
  const [tick, setTick] = useState(0);
  const [label, setLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [problem, setProblem] = useState("");
  const [busyVersion, setBusyVersion] = useState("");

  const loadVersions = useCallback(() => setTick((value) => value + 1), []);

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
        setVersionsError("");
        setVersions((rows ?? []) as VersionRow[]);
      }
      setVersionsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [termKey, tick]);

  const issues = useMemo(() => precheck(data.input, labels), [data.input, labels]);
  const periodTotal = useMemo(
    () => data.input.assignments.reduce((sum, assignment) => sum + assignment.periods, 0),
    [data.input.assignments],
  );
  const lessonSlots = useMemo(
    () => data.slots.filter((slot) => slot.kind === "lesson").length,
    [data.slots],
  );

  const bestScore = useMemo(() => {
    const scores = versions
      .map((version) => scoreValue(version.score))
      .filter((value): value is number => value !== null);
    return scores.length ? Math.min(...scores) : null;
  }, [versions]);

  async function generate() {
    if (!token) {
      setProblem("Your session is still loading. Try again in a moment.");
      return;
    }
    setRunning(true);
    setProblem("");
    setResult(null);
    try {
      const response = await fetch("/api/timetable/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          term: termKey,
          academicYear: year,
          termNumber: term,
          label: label.trim() || null,
          timeLimit: data.rules.timeLimit,
        }),
      });
      const payload = (await response.json()) as GenerateResult;
      if (!response.ok) {
        const detail = payload.issues?.map((issue) => issue.message).join(" ");
        setProblem([payload.error ?? "Generation failed.", detail].filter(Boolean).join(" "));
      } else {
        setResult(payload);
      }
      loadVersions();
      refreshData();
    } catch (generateError) {
      setProblem(generateError instanceof Error ? generateError.message : "Could not run the generator.");
    } finally {
      setRunning(false);
    }
  }

  async function publish(version: VersionRow) {
    setBusyVersion(version.id);
    setProblem("");
    try {
      if (version.status === "published") {
        const { error: unpublishError } = await supabase
          .from("timetable_version")
          .update({ status: "draft", published_at: null })
          .eq("id", version.id);
        if (unpublishError) throw unpublishError;
      } else {
        const { error: clearError } = await supabase
          .from("timetable_version")
          .update({ status: "draft", published_at: null })
          .eq("term", termKey)
          .eq("status", "published");
        if (clearError) throw clearError;
        const { error: publishError } = await supabase
          .from("timetable_version")
          .update({ status: "published", published_at: new Date().toISOString() })
          .eq("id", version.id);
        if (publishError) throw publishError;
      }
      loadVersions();
    } catch (publishError) {
      setProblem(publishError instanceof Error ? publishError.message : "Could not change the version status.");
    } finally {
      setBusyVersion("");
    }
  }

  async function remove(version: VersionRow) {
    if (!window.confirm("Delete this timetable version and all of its lessons?")) return;
    setBusyVersion(version.id);
    setProblem("");
    try {
      const { error: deleteError } = await supabase.from("timetable_version").delete().eq("id", version.id);
      if (deleteError) throw deleteError;
      loadVersions();
    } catch (deleteError) {
      setProblem(deleteError instanceof Error ? deleteError.message : "Could not delete the version.");
    } finally {
      setBusyVersion("");
    }
  }

  return (
    <div className="tt-panel-stack">
      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Generate timetable</h2>
            <p>{termLabel(term)} · {yearLabel(year)} · time limit {data.rules.timeLimit}s</p>
          </div>
          <span className="tt-badge">{lessonSlots} lesson slots</span>
        </div>

        <div className="tt-stats-row">
          <div className="tt-stat"><strong>{data.classes.length}</strong><span>Classes</span></div>
          <div className="tt-stat"><strong>{data.input.assignments.length}</strong><span>Subject assignments</span></div>
          <div className="tt-stat"><strong>{periodTotal}</strong><span>Periods per week</span></div>
          <div className="tt-stat"><strong>{versions.length}</strong><span>Saved versions</span></div>
        </div>

        {data.slots.length === 0 && (
          <div className="tt-note tt-note--warn">
            No day slots yet. Open Setup and create the week timeline before generating.
          </div>
        )}

        {issues.length > 0 ? (
          <div className="tt-note tt-note--warn">
            <strong>Pre-checks found {issues.length} issue{issues.length === 1 ? "" : "s"}.</strong>
            <ul className="tt-issue-list">
              {issues.map((issue, index) => (
                <li key={`${issue}-${index}`}>{issue}</li>
              ))}
            </ul>
            <p>Relax a rule, add lesson slots, or reduce subject periods.</p>
          </div>
        ) : (
          data.slots.length > 0 && (
            <div className="tt-note tt-note--ok">Pre-checks passed. Ready to generate.</div>
          )
        )}

        <div className="tt-generate-row">
          <label className="tt-field tt-field--grow">
            <span>Version label (optional)</span>
            <input
              type="text"
              value={label}
              placeholder={`Draft ${versions.length + 1}`}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="cm-btn cm-btn--primary tt-generate-btn"
            onClick={generate}
            disabled={running || !token || data.slots.length === 0}
          >
            {running ? <><Spinner size={16} /> Generating…</> : "Generate"}
          </button>
        </div>

        {running && (
          <div className="tt-running">
            <Spinner size={18} />
            <span>The solver is working. A long time limit can take up to {data.rules.timeLimit} seconds.</span>
          </div>
        )}

        {problem && <div className="tt-note tt-note--error">{problem}</div>}

        {result && !problem && (
          <div className={`tt-note ${result.status === "infeasible" ? "tt-note--error" : "tt-note--ok"}`}>
            <strong>{statusLabel(result.status)}</strong>
            {typeof result.objective === "number" && <span> · penalty {result.objective}</span>}
            {result.diagnostics && result.diagnostics.length > 0 && (
              <ul className="tt-issue-list">
                {result.diagnostics.map((message, index) => (
                  <li key={`${message}-${index}`}>{message}</li>
                ))}
              </ul>
            )}
            {result.versionId && (
              <div className="tt-actions">
                <button type="button" className="cm-btn cm-btn--ghost cm-btn--sm" onClick={onShowTimetable}>
                  Open in Timetables
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="tt-card">
        <div className="tt-card-head">
          <div>
            <h2>Versions</h2>
            <p>Lower penalty is better. Only one version can be published per term.</p>
          </div>
          <button type="button" className="cm-btn cm-btn--ghost cm-btn--sm" onClick={loadVersions} disabled={versionsLoading}>
            Refresh
          </button>
        </div>

        {versionsError && <div className="tt-note tt-note--error">{versionsError}</div>}

        {versionsLoading ? (
          <div className="tt-state"><Spinner /> Loading versions…</div>
        ) : versions.length === 0 ? (
          <div className="tt-empty">No timetable versions for this term yet.</div>
        ) : (
          <div className="tt-table-wrap">
            <table className="tt-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Penalty</th>
                  <th>Solver</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => {
                  const score = scoreValue(version.score);
                  const best = score !== null && bestScore !== null && score === bestScore;
                  return (
                    <tr key={version.id}>
                      <td>
                        <strong>{version.label || "Untitled version"}</strong>
                        {best && <span className="tt-best">Best</span>}
                        <div className="tt-muted">{version.id.slice(0, 8)}</div>
                      </td>
                      <td>
                        <span className={`tt-badge ${version.status === "published" ? "tt-badge--ok" : "tt-badge--draft"}`}>
                          {version.status === "published" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td><strong>{score === null ? "—" : score}</strong></td>
                      <td>{version.solver_status ?? "—"}</td>
                      <td>{formatDate(version.created_at)}</td>
                      <td>
                        <div className="tt-row-actions">
                          <button
                            type="button"
                            className="cm-btn cm-btn--ghost cm-btn--sm"
                            onClick={() => publish(version)}
                            disabled={busyVersion === version.id}
                          >
                            {version.status === "published" ? "Unpublish" : "Publish"}
                          </button>
                          <button
                            type="button"
                            className="cm-btn cm-btn--danger cm-btn--sm"
                            onClick={() => remove(version)}
                            disabled={busyVersion === version.id}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function scoreValue(value: number | string | null): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "optimal":
      return "Optimal timetable found";
    case "feasible":
      return "Feasible timetable found";
    case "infeasible":
      return "No timetable satisfies the hard rules";
    default:
      return "Generation finished";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
