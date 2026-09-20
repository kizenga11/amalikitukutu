"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
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
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) {
      setError(loginError.message);
      setSubmitting(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="site-landing login-page">
      <header className="login-page-header">
        <div className="container">
          <a className="login-back" href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Back to Home
          </a>
        </div>
      </header>

      <main className="login-page-main">
        <div className="login-layout">
          <section className="login-brand-panel" aria-label="School portal branding">
            <div className="login-brand-mark">
              <img className="login-brand-img" src="/assets/logo.png" alt="Amali Kitukutu logo" />
            </div>
            <div>
              <p className="login-brand-kicker">AMALI SCHOOL</p>
              <h4>School management, made simpler.</h4>
              <p>Manage students, academics, staff, and examinations from one secure portal.</p>
            </div>
          </section>

          <section className="login-card" aria-label="Login form">
            <div className="login-logo">
              <img className="login-logo-img" src="/assets/logo.png" alt="Amali Kitukutu logo" />
            </div>
            <h2 className="login-title">Welcome back</h2>
            <p className="login-subtitle">Sign in to your Amali School account</p>

            <form className="login-form" onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <div className="login-input-wrap">
                  <UserIcon />
                  <input
                    id="email"
                    className="login-input"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@amalischool.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="password-field login-input-wrap">
                  <LockIcon />
                  <input
                    id="password"
                    className="login-input"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <div className="login-options">
                <label className="checkbox">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  <span>Remember me</span>
                </label>
                <a className="forgot-link" href="mailto:info@amalikitukutu.unaux.com?subject=Password%20Reset">Forgot password?</a>
              </div>
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="login-button" type="submit" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}