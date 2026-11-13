"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  changeStudentPassword,
  fetchStudentMe,
  logoutStudent,
  StudentApiError,
  type StudentMe,
} from "@/lib/student-portal-api";
import "./student-portal.css";

function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="m3 3 18 18" />
          <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4" />
          <path d="M6.3 6.3A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export default function StudentChangePasswordForm() {
  const router = useRouter();
  const [me, setMe] = useState<StudentMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchStudentMe();
        if (!cancelled) setMe(profile);
      } catch (err) {
        if (!cancelled && err instanceof StudentApiError && err.status === 401) {
          router.replace("/student/login");
          return;
        }
        if (!cancelled) {
          setError(
            err instanceof StudentApiError
              ? err.message
              : "Could not load your information.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Fill in all three fields.");
      return;
    }
    if (newPassword.length < 8) {
      setError("The new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("The new password must be different from the current one.");
      return;
    }

    setSubmitting(true);
    try {
      await changeStudentPassword(currentPassword, newPassword);
      router.replace("/student");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof StudentApiError
          ? err.message
          : "Could not change the password.",
      );
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutStudent();
    } catch {
      // Ignore network errors while logging out.
    }
    router.replace("/student/login");
  }

  const forced = Boolean(me?.mustChangePassword);

  if (loading) {
    return (
      <div className="sp-standalone">
        <div className="sp-card sp-card--narrow">
          <p className="sp-muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-standalone">
      <div className="sp-card sp-card--narrow">
        <div className="sp-card-brand">
          <Image src="/assets/logo.png" alt="Amali Kitukutu logo" width={46} height={46} sizes="46px" />
          <div>
            <strong>Amali Kitukutu</strong>
            <span>Student Portal</span>
          </div>
        </div>

        <h1 className="sp-card-title">Change password</h1>
        <p className="sp-card-sub">
          {forced
            ? "You must change the initial password before using the portal."
            : "Choose a new password that only you can remember."}
        </p>

        {me && (
          <p className="sp-note">
            Signed in as <strong>{me.student.fullName || me.student.registrationNo}</strong>{" "}
            ({me.student.registrationNo})
          </p>
        )}

        <form className="sp-form" onSubmit={handleSubmit} noValidate>
          <label className="sp-field">
            <span>Current password</span>
            <div className="sp-input-wrap">
              <input
                className="sp-input"
                type={showPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setError("");
                }}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="sp-eye"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>
          </label>

          <label className="sp-field">
            <span>New password</span>
            <input
              className="sp-input"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setError("");
              }}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <small className="sp-hint">At least 8 characters. Do not reuse the school's initial password.</small>
          </label>

          <label className="sp-field">
            <span>Confirm new password</span>
            <input
              className="sp-input"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setError("");
              }}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error && (
            <div className="sp-alert sp-alert--error" role="alert">
              {error}
            </div>
          )}

          <button className="sp-btn sp-btn--primary" type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save password"}
          </button>
        </form>

        <div className="sp-card-actions">
          {!forced && (
            <Link className="sp-link" href="/student">
              Back to portal
            </Link>
          )}
          <button type="button" className="sp-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
