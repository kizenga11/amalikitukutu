"use client";

import "./student-portal.css";

/**
 * Full-screen progress shown while the student session is being cleared.
 * Keeps the user informed instead of leaving a frozen-looking page.
 */
export default function StudentLogoutOverlay() {
  return (
    <div className="sp-logout-overlay" role="status" aria-live="assertive" aria-busy="true">
      <div className="sp-logout-card">
        <span className="sp-logout-spinner" aria-hidden="true" />
        <strong>Inatoka kwenye akaunti…</strong>
        <span className="sp-logout-progress" aria-hidden="true"><i /></span>
        <span className="sp-logout-hint">Tafadhali subia kidogo. Upelekwa kwenye ukurasa wa kuingia.</span>
      </div>
    </div>
  );
}
