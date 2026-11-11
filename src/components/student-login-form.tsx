"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { loginStudent, StudentApiError } from "@/lib/student-portal-api";

function RegIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4" />
      <path d="M6.3 6.3A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export default function StudentLoginForm() {
  const router = useRouter();
  const [registrationNo, setRegistrationNo] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    if (!registrationNo.trim() || !password) {
      setError("Enter your registration number and password.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await loginStudent(registrationNo.trim(), password);
      router.replace(result.mustChangePassword ? "/student/change-password" : "/student");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof StudentApiError
          ? err.message
          : "Could not sign in. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="auth-brand-lockup">
          <span className="auth-brand-logo">
            <Image src="/assets/logo.png" alt="" width={56} height={56} sizes="52px" priority />
          </span>
          <span>
            <span className="auth-brand-name">Amali Kitukutu</span>
            <span className="auth-brand-sub">Kitukutu Technical Secondary School</span>
          </span>
        </div>

        <div className="auth-brand-body">
          <span className="auth-brand-eyebrow">Student Portal</span>
          <h1 className="auth-brand-title">Your subjects, results and assignments in one place</h1>
          <p className="auth-brand-lead">
            Sign in to view your results, track your progress and submit assignments.
          </p>
          <hr className="auth-brand-rule" />
          <ul className="auth-brand-list">
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>View published exam results</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>Track your progress in every subject</span>
            </li>
            <li>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>Receive and submit assignments</span>
            </li>
          </ul>
        </div>

        <p className="auth-brand-foot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          <span>Sign in securely to your student account</span>
        </p>
      </section>

      <main className="auth-panel">
        <div className="auth-mobile-brand">
          <h1 className="auth-mobile-title">Welcome back</h1>
          <p className="auth-mobile-sub">Sign in with your registration number to continue</p>
        </div>

        <div className="auth-card">
          <div className="auth-logo">
            <Image src="/assets/logo.png" alt="Amali Kitukutu logo" width={56} height={56} sizes="56px" />
          </div>
          <h2 className="auth-title">Welcome back</h2>
          <p className="auth-subtitle">Sign in with your registration number and password</p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-label" htmlFor="student-reg">
                <span>Registration No.</span>
              </label>
              <div className="auth-input-wrap">
                <RegIcon />
                <input
                  className="auth-input"
                  id="student-reg"
                  name="registrationNo"
                  type="text"
                  value={registrationNo}
                  onChange={(event) => {
                    setRegistrationNo(event.target.value);
                    setError("");
                  }}
                  placeholder="S8384/0000/2026"
                  autoComplete="username"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="student-password">
                <span>Password</span>
              </label>
              <div className="auth-input-wrap">
                <LockIcon />
                <input
                  className="auth-input auth-input--pw"
                  id="student-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <div className="auth-error" role="alert">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6" />
                  <path d="M12 16h.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth-foot" style={{ marginTop: "1.4rem" }}>
            Teacher or staff? <Link href="/login">Sign in here</Link>
          </p>
          <p className="auth-foot" style={{ marginTop: ".6rem" }}>
            Forgot your password? Contact the school office.
          </p>
        </div>
      </main>
    </div>
  );
}
