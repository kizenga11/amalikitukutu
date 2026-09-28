"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function friendlyError(message: string) {
	const lower = message.toLowerCase();
	if (lower.includes("invalid login credentials")) return "Invalid email or password. Please try again.";
	if (lower.includes("email not confirmed")) return "Your account has not been confirmed yet. Contact the school office.";
	if (lower.includes("rate limit") || lower.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
	if (lower.includes("failed to fetch")) return "Cannot reach the server. Please check your internet connection.";
	return message;
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

function ArrowLeftIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="m12 19-7-7 7-7" />
			<path d="M19 12H5" />
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}

function ShieldIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
			<path d="m9 12 2 2 4-4" />
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
		if (submitting) return;
		setSubmitting(true);
		setError("");

		const { error: loginError } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password,
		});

		if (loginError) {
			setError(friendlyError(loginError.message));
			setSubmitting(false);
			return;
		}

		if (!remember) {
			try {
				for (const key of Object.keys(window.localStorage)) {
					if (key.includes("auth-token")) window.localStorage.removeItem(key);
				}
			} catch {
				/* storage blocked — session stays for this tab only */
			}
		}

		router.push("/");
		router.refresh();
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
					<span className="auth-brand-eyebrow">Staff Portal</span>
					<h1 className="auth-brand-title">School management, in one place</h1>
					<p className="auth-brand-lead">
						Classes, teachers, exams and results &mdash; all in one secure system.
					</p>
					<hr className="auth-brand-rule" />
					<ul className="auth-brand-list">
						<li>
							<CheckIcon />
							<span>Class, teacher and subject management</span>
						</li>
						<li>
							<CheckIcon />
							<span>Exams, uploads and report cards</span>
						</li>
						<li>
							<CheckIcon />
							<span>Analytics and reports for Headmaster and Academic</span>
						</li>
					</ul>
				</div>

				<p className="auth-brand-foot">
					<ShieldIcon />
					<span>Sign in securely with your staff account</span>
				</p>
			</section>

			<main className="auth-panel">
				<div className="auth-mobile-brand">
					<h1 className="auth-mobile-title">Welcome back</h1>
					<p className="auth-mobile-sub">Sign in to your school account to continue</p>
				</div>

				<div className="auth-card">
					<div className="auth-logo">
						<Image src="/assets/logo.png" alt="Amali Kitukutu logo" width={56} height={56} sizes="56px" />
					</div>
					<h2 className="auth-title">Welcome back</h2>
					<p className="auth-subtitle">Sign in to your school account to continue</p>

					<form className="auth-form" onSubmit={handleLogin} noValidate>
						<div className="auth-field">
							<label className="auth-label" htmlFor="email">
								<span>Email address</span>
							</label>
							<div className="auth-input-wrap">
								<UserIcon />
								<input
									className="auth-input"
									id="email"
									name="email"
									type="email"
									inputMode="email"
									value={email}
									onChange={(event) => {
										setEmail(event.target.value);
										setError("");
									}}
									placeholder="you@amalischool.com"
									autoComplete="email"
									autoCapitalize="none"
									spellCheck={false}
									required
								/>
							</div>
						</div>

						<div className="auth-field">
							<label className="auth-label" htmlFor="password">
								<span>Password</span>
							</label>
							<div className="auth-input-wrap">
								<LockIcon />
								<input
									className="auth-input auth-input--pw"
									id="password"
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

						<div className="auth-options">
							<label className="auth-check">
								<input
									type="checkbox"
									checked={remember}
									onChange={(event) => setRemember(event.target.checked)}
								/>
								<span>Remember me</span>
							</label>
							<a
								className="auth-link"
								href="mailto:info@amalikitukutu.unaux.com?subject=Password%20Reset%20Request&body=Please%20reset%20my%20Amali%20Kitukutu%20staff%20portal%20password.%20Email:"
							>
								Forgot password?
							</a>
						</div>

						{error ? (
							<p className="auth-error" role="alert">
								<AlertIcon />
								<span>{error}</span>
							</p>
						) : null}

						<button className="auth-submit" type="submit" disabled={submitting}>
							{submitting ? <span className="spinner" aria-hidden="true" /> : null}
							{submitting ? "Signing in…" : "Sign in"}
						</button>

						<p className="auth-sep">or</p>

						<Link className="auth-back" href="/">
							<ArrowLeftIcon />
							Back to home
						</Link>
					</form>

					<p className="auth-foot">
						Having trouble signing in?{" "}
						<a href="mailto:info@amalikitukutu.unaux.com">Contact us</a> &middot; &copy; Amali Kitukutu
					</p>
				</div>
			</main>
		</div>
	);
}
