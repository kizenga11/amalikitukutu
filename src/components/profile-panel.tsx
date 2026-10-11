"use client";

import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Tab = "profile" | "password";
type Feedback = { type: "success" | "error"; text: string } | null;

interface ProfilePanelProps {
  user: User;
  roleLabel: string;
  initialTab?: Tab;
  onClose: () => void;
  onSaved: (data: { name: string; phone: string }) => void;
}

function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "Current password is incorrect.";
  if (lower.includes("rate limit") || lower.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (lower.includes("failed to fetch")) return "Cannot reach the server. Check your connection.";
  if (lower.includes("same password") || lower.includes("different from the old")) return "New password must be different from the current one.";
  return message;
}

function scorePassword(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

const STRENGTH_LABELS = ["Weak", "Weak", "Fair", "Good", "Strong"];

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function ProfilePanel({
  user,
  roleLabel,
  initialTab = "profile",
  onClose,
  onSaved,
}: ProfilePanelProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState(((user.user_metadata?.name as string) ?? "").trim());
  const [phone, setPhone] = useState(((user.user_metadata?.phone as string) ?? "").trim());
  const [email, setEmail] = useState(user.email ?? "");
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Feedback>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<Feedback>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((data: { name?: string; phone?: string; email?: string }) => {
        if (!active) return;
        setName(((data.name as string) ?? "").trim());
        setPhone(((data.phone as string) ?? "").trim());
        if (data.email) setEmail(data.email);
      })
      .catch(() => {
        /* keep metadata fallback already in state */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const initials = (name || email || "U").slice(0, 2).toUpperCase();
  const strength = scorePassword(next);
  const emailLocked = Boolean(user.email);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;

    const trimmedName = name.replace(/\s+/g, " ").trim();
    const trimmedPhone = phone.trim();

    if (trimmedName.length < 2) {
      setProfileMsg({ type: "error", text: "Please enter your full name." });
      return;
    }
    if (trimmedPhone && !/^[0-9+()\-\s]{7,20}$/.test(trimmedPhone)) {
      setProfileMsg({ type: "error", text: "Please enter a valid phone number." });
      return;
    }

    setSaving(true);
    setProfileMsg(null);

    const { error: metaError } = await supabase.auth.updateUser({
      data: { ...(user.user_metadata ?? {}), name: trimmedName, phone: trimmedPhone },
    });

    if (metaError) {
      setSaving(false);
      setProfileMsg({ type: "error", text: friendlyAuthError(metaError.message) });
      return;
    }

    let staffSynced = true;
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
      });
      staffSynced = res.ok;
    } catch {
      staffSynced = false;
    }

    onSaved({ name: trimmedName, phone: trimmedPhone });
    setSaving(false);
    setProfileMsg({
      type: "success",
      text: staffSynced
        ? "Profile updated successfully."
        : "Profile updated. Staff record will sync when the connection is back.",
    });
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pwSaving) return;

    if (!current || !next || !confirm) {
      setPwMsg({ type: "error", text: "Fill in all password fields." });
      return;
    }
    if (next.length < 8 || /\s/.test(next)) {
      setPwMsg({ type: "error", text: "New password must be at least 8 characters with no spaces." });
      return;
    }
    if (next !== confirm) {
      setPwMsg({ type: "error", text: "New password and confirmation do not match." });
      return;
    }
    if (next === current) {
      setPwMsg({ type: "error", text: "New password must be different from the current password." });
      return;
    }
    if (!user.email) {
      setPwMsg({ type: "error", text: "This account has no email address to verify against." });
      return;
    }

    setPwSaving(true);
    setPwMsg(null);

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });

    if (verifyError) {
      setPwSaving(false);
      setPwMsg({ type: "error", text: friendlyAuthError(verifyError.message) });
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });

    if (updateError) {
      setPwSaving(false);
      setPwMsg({ type: "error", text: friendlyAuthError(updateError.message) });
      return;
    }

    try {
      await supabase.auth.signOut({ scope: "others" });
    } catch {
      /* other sessions may not be available to revoke */
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setPwSaving(false);
    setPwMsg({ type: "success", text: "Password changed. Other devices have been signed out." });
  }

  return (
    <div className="pf-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sm-modal pf-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pf-head">
          <div className="pf-identity">
            <div className="pf-avatar">{initials}</div>
            <div className="pf-identity-meta">
              <div className="pf-name">{name || email || "User"}</div>
              <div className="pf-email">{email}</div>
              <span className="pf-role">{roleLabel}</span>
            </div>
          </div>
          <button type="button" className="cm-icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="pf-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "profile"}
            className={`pf-tab${tab === "profile" ? " pf-tab--active" : ""}`}
            onClick={() => setTab("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "password"}
            className={`pf-tab${tab === "password" ? " pf-tab--active" : ""}`}
            onClick={() => setTab("password")}
          >
            Password
          </button>
        </div>

        {tab === "profile" ? (
          <form className="sm-form-grid pf-form" onSubmit={handleProfileSubmit} noValidate>
            <label className="sm-field">
              <span className="sm-field-label">Full name</span>
              <input
                className="sm-input"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. John Mwita"
                autoComplete="name"
                disabled={loading}
              />
            </label>

            <label className="sm-field">
              <span className="sm-field-label">Phone</span>
              <input
                className="sm-input"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. 0712 000 000"
                autoComplete="tel"
                disabled={loading}
              />
            </label>

            <label className="sm-field pf-field--wide">
              <span className="sm-field-label">Email</span>
              <input className="sm-input" type="email" value={email} readOnly disabled />
            </label>

            <label className="sm-field pf-field--wide">
              <span className="sm-field-label">Role</span>
              <input className="sm-input" type="text" value={roleLabel} readOnly disabled />
            </label>

            {profileMsg && (
              <p className={`pf-alert pf-alert--${profileMsg.type}`} role="status">
                {profileMsg.text}
              </p>
            )}

            <div className="sm-modal-actions pf-actions">
              <button type="button" className="cm-btn cm-btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="cm-btn cm-btn--primary" disabled={saving || loading}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <form className="sm-form-grid pf-form" onSubmit={handlePasswordSubmit} noValidate>
            <label className="sm-field pf-field--wide">
              <span className="sm-field-label">Current password</span>
              <input
                className="sm-input"
                type={showPw ? "text" : "password"}
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
            </label>

            <label className="sm-field pf-field--wide">
              <span className="sm-field-label">New password</span>
              <div className="pf-input-wrap">
                <input
                  className="sm-input"
                  type={showPw ? "text" : "password"}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  placeholder="At least 8 characters, no spaces"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="pf-pw-toggle"
                  onClick={() => setShowPw((value) => !value)}
                  aria-label={showPw ? "Hide passwords" : "Show passwords"}
                >
                  <EyeIcon off={showPw} />
                </button>
              </div>
              {next && (
                <div className="pf-strength" data-score={strength}>
                  <div className="pf-strength-bar">
                    <span style={{ width: `${(strength / 4) * 100}%` }} />
                  </div>
                  <span className="pf-strength-label">{STRENGTH_LABELS[strength]}</span>
                </div>
              )}
            </label>

            <label className="sm-field pf-field--wide">
              <span className="sm-field-label">Confirm new password</span>
              <input
                className="sm-input"
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </label>

            <p className="pf-hint pf-field--wide">
              Use at least 8 characters with a mix of letters, numbers and symbols. You will stay signed in on this device.
            </p>

            {pwMsg && (
              <p className={`pf-alert pf-alert--${pwMsg.type}`} role="status">
                {pwMsg.text}
              </p>
            )}

            <div className="sm-modal-actions pf-actions">
              <button type="button" className="cm-btn cm-btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="cm-btn cm-btn--primary" disabled={pwSaving}>
                {pwSaving ? "Updating…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
