"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BarChart, DonutChart, LineChart } from "@/components/charts";
import {
  academicYears,
  getYear,
  termLabel,
  type TermNumber,
  yearLabel,
} from "@/lib/calendar";
import ClassManagement from "@/components/class-management";
import SubjectManagement from "@/components/subject-management";
import StudentsManagement from "@/components/students-management";
import TeachersManagement from "@/components/teachers-management";
import TeacherDashboard from "@/components/teacher-dashboard";
import ExamManagement from "@/components/exam-management";
import ResultPage from "@/components/result-page";
import StudentReportCard from "@/components/student-report-card";
import CompareResults from "@/components/compare-results";
import StudentEnrollmentStatistics from "@/components/student-enrollment-statistics";
import { StatCardSkeleton, PanelSkeleton } from "@/components/loading";
import { fetchAcademicSettings, fetchDashboardData, fetchSchoolInfo, saveAcademicSettings, saveSchoolInfo, type DashboardData, type SchoolInfo } from "@/lib/school-api";
import { DEFAULT_SCHOOL_INFO } from "@/lib/school-api";
import { readStoredJson, readStoredPeriod, writeStoredJson, writeStoredPeriod, type StoredPeriod } from "@/lib/preferences";

type Role = "Headmaster" | "Academic" | "Teacher";

const roleLabels: Record<Role, string> = {
  Headmaster: "Headmaster",
  Academic: "Academic Officer",
  Teacher: "Teacher",
};

type IconProps = { paths: React.ReactNode };

function Icon({ paths }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="icon" aria-hidden="true">
      {paths}
    </svg>
  );
}

const icons = {
  dashboard: <Icon paths={<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>} />,
  students: <Icon paths={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
  staff: <Icon paths={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></>} />,
  classes: <Icon paths={<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>} />,
  academic: <Icon paths={<><path d="M22 10v6" /><path d="M2 10 12 5l10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></>} />,
  reports: <Icon paths={<><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>} />,
  reportcard: <Icon paths={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /></>} />,
  compare: <Icon paths={<><path d="M8 3v9" /><path d="M4 12h8v9H4z" /><path d="M16 3h4v9h-4z" /><path d="M16 16h4v5h-4z" /></>} />,
  exams: <Icon paths={<><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="m9 14 2 2 4-4" /></>} />,
  settings: <Icon paths={<><circle cx="12" cy="12" r="3" /><path d="M12 2h1v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /></>} />,
  bell: <Icon paths={<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>} />,
  logout: <Icon paths={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><line x1="21" y1="12" x2="9" y2="12" /></>} />,
  menu: <Icon paths={<><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>} />,
  close: <Icon paths={<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>} />,
  chevron: <Icon paths={<><path d="m6 9 6 6 6-6" /></>} />,
  trendUp: <Icon paths={<><path d="m22 7-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>} />,
  trendDown: <Icon paths={<><path d="m22 17-8.5-8.5-5 5L2 7" /><path d="M16 17h6v-6" /></>} />,
  check: <Icon paths={<><path d="M20 6 9 17l-5-5" /></>} />,
};

type NavKey = "dashboard" | "students" | "staff" | "classes" | "academic" | "reports" | "enrollment" | "reportcard" | "compare" | "exams" | "settings";

function isNavKey(value: unknown): value is NavKey {
  return typeof value === "string" && [
    "dashboard", "students", "staff", "classes", "academic", "reports", "enrollment", "reportcard", "compare", "exams", "settings",
  ].includes(value);
}

type NavItemDef = { key: NavKey; label: string; icon: React.ReactNode };
type NavGroup = { key: string; label: string; items: NavItemDef[] };

const navGroups: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [{ key: "dashboard", label: "Dashboard", icon: icons.dashboard }],
  },
  {
    key: "records",
    label: "Records",
    items: [
      { key: "students", label: "Students", icon: icons.students },
      { key: "staff", label: "Staff", icon: icons.staff },
      { key: "classes", label: "Classes", icon: icons.classes },
    ],
  },
  {
    key: "academics",
    label: "Academics",
    items: [
      { key: "academic", label: "Subjects", icon: icons.academic },
      { key: "exams", label: "Exams", icon: icons.exams },
    ],
  },
  {
    key: "reports",
    label: "Reporting",
    items: [
      { key: "reports", label: "Result", icon: icons.reports },
      { key: "enrollment", label: "Enrollment Report", icon: icons.reports },
      { key: "reportcard", label: "Report Card", icon: icons.reportcard },
      { key: "compare", label: "Compare", icon: icons.compare },
    ],
  },
  {
    key: "system",
    label: "Settings",
    items: [{ key: "settings", label: "Settings", icon: icons.settings }],
  },
];

const roleAccess: Record<Role, NavKey[]> = {
  Headmaster: ["dashboard", "students", "staff", "classes", "academic", "reports", "enrollment", "reportcard", "compare", "exams", "settings"],
  Academic: ["dashboard", "students", "staff", "classes", "academic", "reports", "enrollment", "reportcard", "compare", "exams", "settings"],
  Teacher: ["dashboard", "exams", "reports", "compare"],
};

type Period = StoredPeriod;

function loadStoredPeriod(): Period {
  return readStoredPeriod();
}

function persistPeriod(period: Period) {
  writeStoredPeriod(period);
}

export default function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const role = (user.user_metadata?.role as Role) || "Teacher";
  const navigationKey = `active-nav:${user.id}`;
  const [active, setActive] = useState<NavKey>(() =>
    readStoredJson<NavKey>(navigationKey, "dashboard", isNavKey)
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [activePeriod, setActivePeriod] = useState<Period>(loadStoredPeriod);
  const [viewPeriod, setViewPeriod] = useState<Period>(loadStoredPeriod);

  useEffect(() => {
    fetchAcademicSettings()
      .then((settings) => {
        if (!settings) return;
        const period: Period = { yearId: settings.activeYearId, term: settings.activeTerm };
        if (!academicYears.some((year) => year.id === period.yearId)) return;
        setActivePeriod(period);
        setViewPeriod(period);
        persistPeriod(period);
      })
      .catch(() => {
        // DB unavailable - keep localStorage period
      });
  }, []);

  const allowedKeys = roleAccess[role] ?? roleAccess.Teacher;
  const visibleNavGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((n) => allowedKeys.includes(n.key)) }))
    .filter((group) => group.items.length > 0);
  const effectiveActive: NavKey = allowedKeys.includes(active) ? active : "dashboard";
  const initials = (user.email ?? "U").split("@")[0].slice(0, 2).toUpperCase();
  const title = navGroups.flatMap((group) => group.items).find((n) => n.key === effectiveActive)?.label ?? "Dashboard";

  useEffect(() => {
    const activeGroup = navGroups.find((group) => group.items.some((n) => n.key === effectiveActive))?.key;
    if (activeGroup) {
      setOpenGroups((current) => ({ ...current, [activeGroup]: true }));
    }
  }, [effectiveActive]);

  function pickNav(key: NavKey) {
    if (!allowedKeys.includes(key)) return;
    setActive(key);
    writeStoredJson(navigationKey, key);
    setSidebarOpen(false);
  }

  function applyPeriod(period: Period) {
    setActivePeriod(period);
    setViewPeriod(period);
    persistPeriod(period);
    saveAcademicSettings({ activeYearId: period.yearId, activeTerm: period.term }).catch(() => {
      // DB unavailable - period saved in localStorage only
    });
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-brand">
          <img className="brand-logo-img" src="/assets/logo.png" alt="Amali Kitukutu logo" />
          <div>
            <div className="sidebar-brand-name">AMALI SCHOOL</div>
            <div className="sidebar-brand-sub">Management Portal</div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">{icons.close}</button>
        </div>

        <nav className="side-nav">
          {visibleNavGroups.map((group) => {
            const open = openGroups[group.key] === true;
            return (
              <div className={`nav-group${open ? " nav-group--open" : " nav-group--closed"}`} key={group.key}>
                <button
                  type="button"
                  className="nav-group-label"
                  onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !open }))}
                  aria-expanded={open}
                >
                  <span>{group.label}</span>
                  {icons.chevron}
                </button>
                {open && group.items.map((item) => (
                  <button
                    key={item.key}
                    className={`nav-item${effectiveActive === item.key ? " nav-item--active" : ""}`}
                    onClick={() => pickNav(item.key)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-btn menu-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open menu">{icons.menu}</button>
            <div className="topbar-title">{title}</div>
          </div>

          <div className="topbar-right">
            <button className="icon-btn" aria-label="Notifications">{icons.bell}</button>
            <button className="logout-btn" onClick={onLogout}>{icons.logout}<span>Log out</span></button>
            <div className="profile-wrap">
              <button className="profile-btn" onClick={() => setProfileOpen((v) => !v)} aria-haspopup="menu" aria-expanded={profileOpen}>
                <div className="avatar">{initials}</div>
                <div className="profile-meta">
                  <div className="profile-name">{user.email ?? "User"}</div>
                  <div className="profile-role">{roleLabels[role]}</div>
                </div>
                {icons.chevron}
              </button>
              {profileOpen && (
                <>
                  <div className="profile-backdrop" onClick={() => setProfileOpen(false)} />
                  <div className="dropdown" role="menu">
                    <div className="dropdown-head">
                      <div className="avatar">{initials}</div>
                      <div>
                        <div className="dropdown-name">{user.email ?? "User"}</div>
                        <div className="dropdown-email">{roleLabels[role]}</div>
                      </div>
                    </div>
                    <div className="dropdown-divider" />
                    {allowedKeys.includes("settings") && (
                      <button className="dropdown-item" onClick={() => pickNav("settings")}>Settings</button>
                    )}
                    <button className="dropdown-item dropdown-item--danger" onClick={onLogout}>{icons.logout}<span>Log out</span></button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          {effectiveActive === "dashboard" && (role === "Teacher" ? (
            <TeacherDashboard authUserId={user.id} />
          ) : (
            <DashboardView
              period={viewPeriod}
              onPeriod={setViewPeriod}
              activePeriod={activePeriod}
            />
          ))}
          {effectiveActive === "settings" && (
            <SettingsPanel active={activePeriod} onSave={applyPeriod} />
          )}
          {effectiveActive === "classes" && <ClassManagement />}
          {effectiveActive === "academic" && <SubjectManagement />}
          {effectiveActive === "students" && <StudentsManagement />}
          {effectiveActive === "staff" && <TeachersManagement />}
          {effectiveActive === "exams" && <ExamManagement teacherId={role === "Teacher" ? user.id : undefined} />}
          {effectiveActive === "reports" && <ResultPage role={role} />}
          {effectiveActive === "enrollment" && <StudentEnrollmentStatistics />}
          {effectiveActive === "reportcard" && <StudentReportCard />}
          {effectiveActive === "compare" && <CompareResults />}
        </main>
      </div>
    </div>
  );
}

function DashboardView({
  period,
  onPeriod,
  activePeriod,
}: {
  period: Period;
  onPeriod: (period: Period) => void;
  activePeriod: Period;
}) {
  const { yearId, term } = period;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setDbError(null);
      try {
        const result = await fetchDashboardData(yearId, term);
        if (!cancelled) setData(result);
      } catch (err: unknown) {
        if (!cancelled) {
          setData(null);
          setDbError(err instanceof Error ? err.message : "Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [yearId, term]);

  const terms = getYear(yearId).terms;
  const isActive = activePeriod.yearId === yearId && activePeriod.term === term;

  if (loading) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">School Overview</h2>
            <p className="page-sub">Summary and key metrics for {termLabel(term)} of {yearLabel(yearId)}.</p>
          </div>
          <div className="page-head-right">
            {isActive && <span className="active-chip">● Active</span>}
            <PeriodPicker
              yearId={yearId}
              term={term}
              terms={terms}
              onYear={(year) => onPeriod({ ...period, yearId: year })}
              onTerm={(nextTerm) => onPeriod({ ...period, term: nextTerm })}
            />
          </div>
        </div>
        <div className="stats-grid">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <div className="section-grid">
          <PanelSkeleton lines={5} />
          <PanelSkeleton lines={4} />
        </div>
      </>
    );
  }

  if (dbError || !data) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2 className="page-title">School Overview</h2>
            <p className="page-sub">Summary and key metrics for {termLabel(term)} of {yearLabel(yearId)}.</p>
          </div>
          <div className="page-head-right">
            {isActive && <span className="active-chip">● Active</span>}
          </div>
        </div>
        <div className="db-empty">
          <h3>Dashboard data not ready</h3>
          <p>Could not read data from the database. Make sure the tables exist and have been seeded.</p>
          <pre className="db-error">{dbError}</pre>
        </div>
      </>
    );
  }

  const avgScore = data.avgPerformance;
  const stats = [
    { label: "Total Students", value: data.totalStudents.toLocaleString(), change: null, up: true, icon: icons.students },
    { label: "Teaching Staff", value: data.teachingStaff.toLocaleString(), change: null, up: true, icon: icons.staff },
    { label: "Active Classes", value: data.activeClasses.toLocaleString(), change: null, up: true, icon: icons.classes },
    { label: "Avg Performance", value: `${avgScore}%`, change: null, up: true, icon: icons.academic },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">School Overview</h2>
          <p className="page-sub">Summary and key metrics for {termLabel(term)} of {yearLabel(yearId)}.</p>
        </div>
        <div className="page-head-right">
          {isActive && <span className="active-chip">● Active</span>}
          <PeriodPicker
            yearId={yearId}
            term={term}
            terms={terms}
            onYear={(year) => onPeriod({ ...period, yearId: year })}
            onTerm={(nextTerm) => onPeriod({ ...period, term: nextTerm })}
          />
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-top">
              <span className="stat-icon">{s.icon}</span>
            </div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="section-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Student Attendance</h3>
              <p className="panel-sub">Daily attendance rate this week</p>
            </div>
            <span className="panel-badge">Weekly</span>
          </div>
          <BarChart data={data.attendance} highlight={3} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Student Distribution</h3>
              <p className="panel-sub">By gender</p>
            </div>
          </div>
          <div className="donut-wrap">
            <DonutChart
              centerTop={data.totalStudents.toLocaleString()}
              centerBottom="Students"
              segments={[
                { label: "Boys", value: data.genderDistribution[0]?.value ?? 0, color: "#6d28d9" },
                { label: "Girls", value: data.genderDistribution[1]?.value ?? 0, color: "#d4af37" },
              ]}
            />
          </div>
          <div className="legend">
            {data.genderDistribution.map((item, i) => (
              <div className="legend-item" key={item.label}>
                <span className={`legend-dot legend-dot--${i}`} />
                <span>{item.label}</span>
                <strong>{item.value}%</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-grid section-grid--alt">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Performance Trend</h3>
              <p className="panel-sub">Mean score per term in {yearLabel(yearId)}</p>
            </div>
            <span className="panel-badge">{yearLabel(yearId)}</span>
          </div>
          <LineChart points={data.performanceTrend} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Subject Performance</h3>
              <p className="panel-sub">End of term mean scores</p>
            </div>
          </div>
          <table className="subject-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Class</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {data.subjectPerformance.map((row) => (
                <tr key={row.subject}>
                  <td><div className="subject-name">{row.subject}</div><div className="subject-class">{row.class}</div></td>
                  <td>
                    <div className="score-bar">
                      <div className={`score-bar-fill${row.score >= 80 ? " score-bar-fill--good" : row.score >= 75 ? " score-bar-fill--mid" : " score-bar-fill--low"}`} style={{ width: `${row.score}%` }} />
                    </div>
                    <div className="score-value">
                      <strong>{row.score}%</strong>
                      <span className={row.up ? "trend trend--up" : "trend trend--down"}>{row.up ? "▲" : "▼"}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function PeriodPicker({
  yearId,
  term,
  terms,
  onYear,
  onTerm,
}: {
  yearId: string;
  term: TermNumber;
  terms: TermNumber[];
  onYear: (year: string) => void;
  onTerm: (term: TermNumber) => void;
}) {
  return (
    <div className="period-picker">
      <label className="period-picker-label">
        <span>Academic Year</span>
        <select className="period-select" value={yearId} onChange={(event) => onYear(event.target.value)}>
          {academicYears.map((year) => (
            <option key={year.id} value={year.id}>{year.label}</option>
          ))}
        </select>
      </label>
      <label className="period-picker-label">
        <span>Term</span>
        <select className="period-select" value={term} onChange={(event) => onTerm(Number(event.target.value) as TermNumber)}>
          {terms.map((t) => (
            <option key={t} value={t}>{termLabel(t)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SettingsPanel({ active, onSave }: { active: Period; onSave: (period: Period) => void }) {
  const [yearId, setYearId] = useState(active.yearId);
  const [term, setTerm] = useState<TermNumber>(active.term);
  const [saved, setSaved] = useState(false);
  const dirty = yearId !== active.yearId || term !== active.term;
  const terms = getYear(yearId).terms;

  const [school, setSchool] = useState<SchoolInfo>(DEFAULT_SCHOOL_INFO);
  const [savedSchool, setSavedSchool] = useState<SchoolInfo>(DEFAULT_SCHOOL_INFO);
  const [schoolLoading, setSchoolLoading] = useState(true);
  const [schoolSaved, setSchoolSaved] = useState(false);
  const [schoolError, setSchoolError] = useState("");

  useEffect(() => {
    let activePanel = true;
    fetchSchoolInfo()
      .then((info) => {
        setSchool(info);
        setSavedSchool(info);
      })
      .catch(() => {
        if (activePanel) setSchoolError("Could not load school information.");
      })
      .finally(() => activePanel && setSchoolLoading(false));
    return () => {
      activePanel = false;
    };
  }, []);

  const schoolDirty =
    school.name !== savedSchool.name ||
    school.council !== savedSchool.council ||
    school.district !== savedSchool.district ||
    school.address !== savedSchool.address ||
    school.unionLogo !== savedSchool.unionLogo ||
    school.schoolLogo !== savedSchool.schoolLogo;

  async function handleSchoolSave() {
    if (!schoolDirty) return;
    setSchoolError("");
    try {
      await saveSchoolInfo(school);
      setSavedSchool(school);
      setSchoolSaved(true);
      window.setTimeout(() => setSchoolSaved(false), 2500);
    } catch {
      setSchoolError("Could not save school information.");
    }

  }

  function handleLogoChange(field: "unionLogo" | "schoolLogo", file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSchoolError("Please select an image file for the logo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSchoolError("Each logo must be 2 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSchool((current) => ({ ...current, [field]: reader.result }));
        setSchoolError("");
      }
    };
    reader.onerror = () => setSchoolError("Could not read the selected logo.");
    reader.readAsDataURL(file);
  }

  function handleSave() {
    if (!dirty) return;
    onSave({ yearId, term });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Settings</h2>
          <p className="page-sub">Manage your school portal configuration.</p>
        </div>
        <span className="active-chip">● Active: {termLabel(active.term)} · {yearLabel(active.yearId)}</span>
      </div>

      <div className="settings-card">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">Academic Calendar</h3>
            <p className="panel-sub">Set the Active Academic Year and Active Term used across the portal.</p>
          </div>
        </div>

        <div className="settings-form">
          <label className="settings-field">
            <span className="settings-field-label">Active Academic Year</span>
            <select className="settings-select" value={yearId} onChange={(event) => setYearId(event.target.value)}>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>{year.label}</option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            <span className="settings-field-label">Active Term</span>
            <select className="settings-select" value={term} onChange={(event) => setTerm(Number(event.target.value) as TermNumber)}>
              {terms.map((t) => (
                <option key={t} value={t}>{termLabel(t)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="settings-actions">
          <span className={`settings-status${saved ? " settings-status--ok" : ""}`}>
            {saved ? "Saved" : dirty ? "Unsaved changes" : "Up to date"}
          </span>
          <button className="settings-save" onClick={handleSave} disabled={!dirty}>
            {icons.check}<span>Save changes</span>
          </button>
        </div>
      </div>

      <div className="settings-card">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">School Information</h3>
            <p className="panel-sub">Official details shown on printed result reports.</p>
          </div>
        </div>

        {schoolLoading ? (
          <div className="me-loading-panel">Loading…</div>
        ) : (
          <>
            <div className="settings-form settings-form--stack">
              <label className="settings-field">
                <span className="settings-field-label">School Name</span>
                <input className="settings-input" value={school.name} onChange={(event) => setSchool({ ...school, name: event.target.value })} placeholder="e.g. AMALI SECONDARY SCHOOL" />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">District (Wilaya)</span>
                <input className="settings-input" value={school.district} onChange={(event) => setSchool({ ...school, district: event.target.value })} placeholder="e.g. KINONDONI" />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Council</span>
                <input className="settings-input" value={school.council} onChange={(event) => setSchool({ ...school, council: event.target.value })} placeholder="e.g. ILALA MUNICIPAL COUNCIL" />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Address (P.O. Box)</span>
                <input className="settings-input" value={school.address} onChange={(event) => setSchool({ ...school, address: event.target.value })} placeholder="e.g. P.O. Box 12345, DAR ES SALAAM" />
              </label>
              <div className="settings-logo-grid">
                <label className="settings-field">
                  <span className="settings-field-label">Union Logo (left)</span>
                  <input className="settings-input" type="file" accept="image/*" onChange={(event) => handleLogoChange("unionLogo", event.target.files?.[0])} />
                  {school.unionLogo && <img className="settings-logo-preview" src={school.unionLogo} alt="Union logo preview" />}
                </label>
                <label className="settings-field">
                  <span className="settings-field-label">School Logo (right)</span>
                  <input className="settings-input" type="file" accept="image/*" onChange={(event) => handleLogoChange("schoolLogo", event.target.files?.[0])} />
                  {school.schoolLogo && <img className="settings-logo-preview" src={school.schoolLogo} alt="School logo preview" />}
                </label>
              </div>
            </div>
            {schoolError && <p className="error-message" role="alert">{schoolError}</p>}
            <div className="settings-actions">
              <span className={`settings-status${schoolSaved ? " settings-status--ok" : ""}`}>
                {schoolSaved ? "Saved" : schoolDirty ? "Unsaved changes" : "Up to date"}
              </span>
              <button className="settings-save" onClick={handleSchoolSave} disabled={!schoolDirty}>
                {icons.check}<span>Save changes</span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}