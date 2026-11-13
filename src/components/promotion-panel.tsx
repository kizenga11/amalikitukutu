"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import StudentConfirmDialog from "@/components/student-confirm-dialog";

interface PromotionClassRow {
  classId: string;
  className: string;
  formLevel: number;
  studentCount: number;
  targetClassId: string | null;
  targetClassName: string | null;
  graduates: boolean;
}

interface PromotionPreview {
  fromYear: string;
  toYear: string;
  alreadyPromoted: boolean;
  totalStudents: number;
  totalGraduating: number;
  totalEnrollments: number;
  totalTeachingAssignments: number;
  totalStreamTeachers: number;
  classes: PromotionClassRow[];
  warnings: string[];
}

interface PromotionResult {
  fromYear: string;
  toYear: string;
  promoted: number;
  graduated: number;
  enrollments: number;
  teachingAssignments: number;
  streamTeachers: number;
  warnings: string[];
}

async function currentToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

export default function PromotionPanel({
  activeYear,
  onPromoted,
}: {
  activeYear: string;
  onPromoted: (year: string) => void;
}) {
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [setActive, setSetActive] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    setPreview(null);
    setResult(null);
    setError("");
    setConfirmOpen(false);
  }, [activeYear]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const token = await currentToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch(
        `/api/promotion?fromYear=${encodeURIComponent(activeYear)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const payload = (await response.json()) as PromotionPreview & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load the promotion preview.");
      setPreview(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the promotion preview.");
    } finally {
      setLoading(false);
    }
  }, [activeYear]);

  async function handlePromote() {
    if (!preview) return;
    setApplying(true);
    setError("");
    try {
      const token = await currentToken();
      if (!token) throw new Error("Your session has expired. Please sign in again.");
      const response = await fetch("/api/promotion", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fromYear: preview.fromYear,
          toYear: preview.toYear,
          setActiveYear: setActive,
        }),
      });
      const payload = (await response.json()) as PromotionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not promote students.");
      setResult(payload);
      setPreview(null);
      setConfirmOpen(false);
      if (setActive) onPromoted(preview.toYear);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not promote students.");
      setConfirmOpen(false);
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="settings-card settings-card--wide">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">Promote Students</h3>
            <p className="panel-sub">
              Move Form I → II → III → IV, graduate Form IV, and carry subject
              enrollments, streams and teacher assignments into the next academic
              year. This year&apos;s exam results stay untouched.
            </p>
          </div>
        </div>

        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        {result ? (
          <div className="promotion-result">
            <p className="promotion-result-title">
              Promotion {result.fromYear} → {result.toYear} completed.
            </p>
            <ul className="promotion-list">
              <li>{result.promoted} student(s) moved up one form.</li>
              <li>{result.graduated} Form IV student(s) graduated.</li>
              <li>{result.enrollments} subject enrollment(s) copied.</li>
              <li>{result.teachingAssignments} teacher assignment(s) copied.</li>
              <li>{result.streamTeachers} stream teacher(s) copied.</li>
            </ul>
            {result.warnings.length > 0 && (
              <ul className="promotion-warnings">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="settings-actions">
              <button className="settings-save" type="button" onClick={() => void loadPreview()}>
                <span>Check next year</span>
              </button>
            </div>
          </div>
        ) : preview ? (
          <>
            <p className="promotion-lead">
              Preview for <strong>{preview.fromYear} → {preview.toYear}</strong>
            </p>

            {preview.alreadyPromoted ? (
              <p className="promotion-note">
                Students were already promoted from {preview.fromYear} to {preview.toYear}.
                Nothing else will be changed.
              </p>
            ) : (
              <>
                <div className="promotion-table-wrap">
                  <table className="promotion-table">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>Students</th>
                        <th>To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.classes.map((row) => (
                        <tr key={row.classId}>
                          <td>{row.className}</td>
                          <td>{row.studentCount}</td>
                          <td>{row.graduates ? "Graduated" : row.targetClassName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="promotion-list">
                  <li>
                    <strong>{preview.totalStudents}</strong> student(s) will move up;{" "}
                    <strong>{preview.totalGraduating}</strong> will graduate.
                  </li>
                  <li>
                    <strong>{preview.totalEnrollments}</strong> subject enrollment(s),{" "}
                    <strong>{preview.totalTeachingAssignments}</strong> teacher assignment(s) and{" "}
                    <strong>{preview.totalStreamTeachers}</strong> stream teacher(s) will be
                    copied into {preview.toYear}.
                  </li>
                  <li>
                    Exams and marks for {preview.fromYear} are kept exactly as they are.
                  </li>
                </ul>

                {preview.warnings.length > 0 && (
                  <ul className="promotion-warnings">
                    {preview.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}

                <label className="promotion-check">
                  <input
                    type="checkbox"
                    checked={setActive}
                    onChange={(event) => setSetActive(event.target.checked)}
                  />
                  <span>
                    Set the active academic year to {preview.toYear} and Term 1 after promotion.
                  </span>
                </label>

                <div className="settings-actions">
                  <button
                    className="settings-save settings-save--danger"
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={applying}
                  >
                    <span>Promote students</span>
                  </button>
                  <button
                    className="settings-secondary"
                    type="button"
                    onClick={() => void loadPreview()}
                    disabled={applying}
                  >
                    Refresh
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="promotion-note">
              Current active year: <strong>{activeYear}</strong>. Preview the move to{" "}
              <strong>{Number(activeYear) + 1}</strong> before changing anything.
            </p>
            <div className="settings-actions">
              <button className="settings-save" type="button" onClick={() => void loadPreview()} disabled={loading}>
                <span>{loading ? "Loading…" : "Load preview"}</span>
              </button>
            </div>
          </>
        )}
      </div>

      <StudentConfirmDialog
        open={confirmOpen}
        title={`Promote students ${preview?.fromYear ?? ""} → ${preview?.toYear ?? ""}?`}
        message={
          preview
            ? `${preview.totalStudents} student(s) will move up and ${preview.totalGraduating} will graduate. ` +
              `Subject enrollments and teacher assignments will be copied into ${preview.toYear}. ` +
              `This cannot be run twice for the same years.`
            : ""
        }
        confirmLabel="Yes, promote"
        tone="danger"
        busy={applying}
        onConfirm={() => void handlePromote()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
