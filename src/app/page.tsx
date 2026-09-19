"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Dashboard from "@/components/dashboard";

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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    if (loginError) setError(loginError.message);
    setSubmitting(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loader">
          <div className="loader-logo">AM</div>
          <p className="muted">Loading…</p>
        </div>
      </main>
    );
  }

  if (user) return <Dashboard user={user} onLogout={handleLogout} />;

  return (
    <main className="site-homepage">
      <header className="site-header">
        <div className="site-brand" aria-label="Amali Kitukutu home">
          <div className="brand-mark">AM</div>
          <div>
            <p className="brand-kicker">AMALI KITUKUTU</p>
            <h1>Kitukutu Secondary Technical School</h1>
          </div>
        </div>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#about">About</a>
          <a href="#academics">Academics</a>
          <a href="#portal">Portal</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <section className="hero-section" aria-labelledby="school-heading">
        <div className="hero-copy">
          <p className="eyebrow">Welcome to our school community</p>
          <h2 id="school-heading">Kitukutu Technical School, Kitukutu Secondary Technical School, and Amali Kitukutu — building bright futures.</h2>
          <p>
            We are proud to offer learners a safe, welcoming, and inclusive environment where academics,
            technical skills, discipline, and leadership grow together. At Amali Kitukutu, every student is
            encouraged to learn, discover, and thrive.
          </p>
          <div className="cta-row">
            <a className="primary-btn" href="#portal">Access School Portal</a>
            <a className="secondary-btn" href="#about">Learn More</a>
          </div>
          <ul className="feature-list" aria-label="School highlights">
            <li>Academic excellence</li>
            <li>Technical training</li>
            <li>Supportive learning environment</li>
          </ul>
        </div>

        <aside className="hero-card" aria-label="School information card">
          <div className="hero-card-badge">School overview</div>
          <h3>Amali Kitukutu</h3>
          <p>Shule ya Amali Kitukutu is committed to nurturing confident, capable, and responsible learners.</p>
          <dl>
            <div>
              <dt>Focus</dt>
              <dd>Academic growth and practical skills</dd>
            </div>
            <div>
              <dt>Mission</dt>
              <dd>To empower every learner with knowledge and values</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="info-grid" id="about" aria-label="School features">
        <article className="info-card">
          <h3>Our Story</h3>
          <p>Kitukutu Secondary Technical School is a place where students are supported to grow academically and personally.</p>
        </article>
        <article className="info-card">
          <h3>Our Values</h3>
          <p>Integrity, excellence, respect, discipline, and innovation guide how our school community learns and lives.</p>
        </article>
        <article className="info-card" id="academics">
          <h3>Academic Excellence</h3>
          <p>We focus on high-quality teaching, strong student support, and practical learning experiences that prepare learners for the future.</p>
        </article>
      </section>

      <section className="portal-section" id="portal" aria-labelledby="portal-title">
        <div className="portal-intro">
          <p className="eyebrow">School management portal</p>
          <h3 id="portal-title">Secure access for teachers and staff</h3>
          <p>Use the portal below to sign in to the Amali School system and manage school operations safely and efficiently.</p>
        </div>

        <div className="login-layout">
          <section className="login-brand-panel" aria-label="School portal branding">
            <div className="login-brand-mark">AM</div>
            <div>
              <p className="login-brand-kicker">AMALI SCHOOL</p>
              <h4>School management, made simpler.</h4>
              <p>Manage students, academics, staff, and examinations from one secure portal.</p>
            </div>
            <div className="login-brand-line" />
          </section>

          <section className="login-card" aria-label="Login form">
            <div className="login-logo">AM</div>
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
                <a className="forgot-link" href="#forgot">Forgot password?</a>
              </div>
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="login-button" type="submit" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </section>
        </div>
      </section>

      <footer className="login-footer" id="contact">
        © 2026 Amali Kitukutu • Kitukutu Secondary Technical School • Shule ya Amali Kitukutu
      </footer>
    </main>
  );
}