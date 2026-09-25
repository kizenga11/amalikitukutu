"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function GearMark() {
  // Technical/vocational motif used as the brand-panel watermark — not decorative filler,
  // it signals "technical school" the way a blueprint hatch signals "workshop".
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <circle cx="100" cy="100" r="46" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="100" r="14" stroke="currentColor" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i * 30 * Math.PI) / 180;
        const x1 = 100 + Math.cos(angle) * 46;
        const y1 = 100 + Math.sin(angle) * 46;
        const x2 = 100 + Math.cos(angle) * 58;
        const y2 = 100 + Math.sin(angle) * 58;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />;
      })}
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
    <div className="wrap">
      <section className="brand" aria-hidden="true">
        <div className="brand-mark">
          <GearMark />
        </div>
        <div className="brand-content">
          <Image className="brand-logo" src="/assets/logo.png" alt="" width={44} height={44} />
          <h1 className="brand-title">Amali Kitukutu</h1>
          <p className="brand-sub">Kitukutu Technical Secondary School</p>
          <p className="brand-tag">Portal ya wafanyakazi &middot; Staff portal</p>
        </div>
      </section>

      <main className="panel">
        <div className="card">
          <Image className="card-logo" src="/assets/logo.png" alt="Amali Kitukutu logo" width={40} height={40} />
          <h2 className="title">Karibu tena</h2>
          <p className="subtitle">Ingia kwenye akaunti yako ya shule &mdash; sign in to continue</p>

          <form className="form" onSubmit={handleLogin} noValidate>
            <div className="field">
              <label htmlFor="email">Barua pepe / Email</label>
              <div className="input-wrap">
                <span className="input-icon"><UserIcon /></span>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="wewe@amalikitukutu.ac.tz"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="password">Nenosiri / Password</label>
              <div className="input-wrap">
                <span className="input-icon"><LockIcon /></span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Weka nenosiri lako"
                  autoComplete="current-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Ficha nenosiri" : "Onyesha nenosiri"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="row">
              <label className="checkbox">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span className="box" aria-hidden="true" />
                <span>Nikumbuke</span>
              </label>
              <a className="link" href="mailto:info@amalikitukutu.unaux.com?subject=Password%20Reset">
                Umesahau nenosiri?
              </a>
            </div>

            {error && (
              <p className="error" role="alert">
                <AlertIcon /> {error}
              </p>
            )}

            <button className="submit" type="submit" disabled={submitting}>
              {submitting ? <span className="spinner" aria-hidden="true" /> : null}
              {submitting ? "Inaingia…" : "Ingia"}
            </button>

            <Link className="back" href="/">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="m12 19-7-7 7-7" />
                <path d="M19 12H5" />
              </svg>
              Rudi Nyumbani
            </Link>
          </form>
        </div>
      </main>

      <style jsx>{`
        :root {
          --navy: #0b1e33;
          --navy-deep: #071624;
          --amber: #f2a93b;
          --amber-dim: #d99328;
          --ink: #16212e;
          --muted: #64748b;
          --line: #e4e8ee;
          --danger: #c0362c;
          --danger-bg: #fdecea;
        }

        .wrap {
          min-height: 100dvh;
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          background: #f6f7f9;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: var(--ink);
        }

        .brand {
          position: relative;
          overflow: hidden;
          background: linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%);
          color: #eef2f7;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: clamp(28px, 5vw, 64px);
          padding-top: calc(clamp(28px, 5vw, 64px) + env(safe-area-inset-top, 0px));
        }

        .brand-mark {
          position: absolute;
          top: -6%;
          right: -8%;
          width: min(60vw, 480px);
          height: min(60vw, 480px);
          color: rgba(242, 169, 59, 0.14);
        }

        .brand-content {
          position: relative;
          z-index: 1;
          max-width: 420px;
        }

        .brand-logo {
          height: 44px;
          width: auto;
          margin-bottom: 28px;
          filter: brightness(0) invert(1);
          opacity: 0.9;
        }

        .brand-title {
          font-size: clamp(28px, 3.2vw, 40px);
          line-height: 1.15;
          font-weight: 700;
          margin: 0 0 8px;
          letter-spacing: -0.01em;
        }

        .brand-sub {
          margin: 0 0 20px;
          font-size: 16px;
          color: #b9c4d2;
        }

        .brand-tag {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--amber);
          border-top: 1px solid rgba(242, 169, 59, 0.35);
          padding-top: 14px;
        }

        .panel {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          padding-top: calc(24px + env(safe-area-inset-top, 0px));
          padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
        }

        .card {
          width: 100%;
          max-width: 400px;
        }

        .card-logo {
          display: none;
        }

        .title {
          font-size: 26px;
          font-weight: 700;
          margin: 0 0 6px;
          letter-spacing: -0.01em;
        }

        .subtitle {
          margin: 0 0 28px;
          font-size: 14.5px;
          color: var(--muted);
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .field label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 7px;
        }

        .input-wrap {
          position: relative;
          display: flex;
          align-items: center;
          border: 1.5px solid var(--line);
          border-radius: 10px;
          background: #fff;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .input-wrap:focus-within {
          border-color: var(--navy);
          box-shadow: 0 0 0 3px rgba(11, 30, 51, 0.1);
        }

        .input-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          margin-left: 14px;
          color: var(--muted);
          flex-shrink: 0;
        }

        .input-wrap input {
          flex: 1;
          min-width: 0;
          border: none;
          outline: none;
          background: transparent;
          padding: 13px 12px;
          font-size: 16px;
          color: var(--ink);
        }

        .input-wrap input::placeholder {
          color: #a3adba;
        }

        .icon-btn {
          border: none;
          background: transparent;
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          margin-right: 4px;
          cursor: pointer;
          border-radius: 8px;
        }

        .icon-btn:hover {
          color: var(--ink);
          background: #f1f3f6;
        }

        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          font-size: 13.5px;
        }

        .checkbox {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          color: var(--ink);
          user-select: none;
        }

        .checkbox input {
          position: absolute;
          opacity: 0;
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .checkbox .box {
          width: 18px;
          height: 18px;
          border: 1.5px solid var(--line);
          border-radius: 5px;
          background: #fff;
          flex-shrink: 0;
          position: relative;
          transition: background 0.15s ease, border-color 0.15s ease;
        }

        .checkbox input:checked + .box {
          background: var(--navy);
          border-color: var(--navy);
        }

        .checkbox input:checked + .box::after {
          content: "";
          position: absolute;
          left: 5px;
          top: 1px;
          width: 5px;
          height: 9px;
          border: solid #fff;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .checkbox input:focus-visible + .box {
          outline: 2px solid var(--navy);
          outline-offset: 2px;
        }

        .link {
          color: var(--navy);
          text-decoration: none;
          font-weight: 600;
        }

        .link:hover {
          text-decoration: underline;
        }

        .error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 0;
          padding: 11px 13px;
          background: var(--danger-bg);
          color: var(--danger);
          border-radius: 9px;
          font-size: 13.5px;
          line-height: 1.4;
        }

        .error :global(svg) {
          width: 17px;
          height: 17px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: none;
          border-radius: 10px;
          background: var(--navy);
          color: #fff;
          font-size: 15.5px;
          font-weight: 600;
          padding: 14px;
          min-height: 48px;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.05s ease;
        }

        .submit:hover:not(:disabled) {
          background: var(--navy-deep);
        }

        .submit:active:not(:disabled) {
          transform: scale(0.99);
        }

        .submit:disabled {
          opacity: 0.75;
          cursor: not-allowed;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-top-color: #fff;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          justify-content: center;
          margin-top: 4px;
          font-size: 13.5px;
          color: var(--muted);
          text-decoration: none;
        }

        .back:hover {
          color: var(--ink);
        }

        @media (prefers-reduced-motion: reduce) {
          .spinner {
            animation: none;
          }
        }

        @media (max-width: 860px) {
          .wrap {
            grid-template-columns: 1fr;
          }

          .brand {
            padding: 20px 24px 28px;
            padding-top: calc(20px + env(safe-area-inset-top, 0px));
            min-height: 168px;
            justify-content: center;
          }

          .brand-mark {
            width: 260px;
            height: 260px;
            top: -20%;
            right: -12%;
          }

          .brand-content {
            max-width: none;
          }

          .brand-logo {
            display: none;
          }

          .brand-title {
            font-size: 24px;
            margin-bottom: 4px;
          }

          .brand-sub {
            font-size: 13.5px;
            margin-bottom: 10px;
          }

          .brand-tag {
            font-size: 12px;
            padding-top: 10px;
          }

          .panel {
            padding: 24px 20px;
          }

          .card-logo {
            display: block;
            height: 40px;
            width: auto;
            margin: -6px auto 18px;
          }

          .title,
          .subtitle {
            text-align: center;
          }
        }

        @media (max-width: 400px) {
          .card {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
