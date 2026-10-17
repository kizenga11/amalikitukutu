"use client";

import type { ReactNode } from "react";

/* ============================================================
   Navigation configuration
   ------------------------------------------------------------
   Single source of truth for the sidebar. Every entry and every
   sub-item has a `roles` array, so changing who can see what is
   just a matter of editing the arrays below.
   ============================================================ */

/* ---- Roles (these are the role strings the system already uses) ---- */
export type Role = "Headmaster" | "Academic" | "Teacher" | "District Officer";

export const roleLabels: Record<Role, string> = {
  Headmaster: "Headmaster",
  Academic: "Academic Officer",
  Teacher: "Teacher",
  "District Officer": "District Officer",
};

const ALL_ROLES: Role[] = ["Headmaster", "Academic", "Teacher", "District Officer"];
const ADMIN_ROLES: Role[] = ["Headmaster", "Academic"];

/** Coerce an unknown/legacy role string into a known role (falls back to Teacher). */
export function resolveRole(value: unknown): Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value)
    ? (value as Role)
    : "Teacher";
}

/* ---- Nav keys (unchanged from the original app) ---- */
export type NavKey =
  | "dashboard"
  | "students"
  | "staff"
  | "classes"
  | "academic"
  | "reports"
  | "enrollment"
  | "reportcard"
  | "compare"
  | "combined"
  | "beststudent"
  | "analysis"
  | "exams"
  | "attendance"
  | "lessonplans"
  | "sms"
  | "settings";

export function isNavKey(value: unknown): value is NavKey {
  return (
    typeof value === "string" &&
    [
      "dashboard", "students", "staff", "classes", "academic", "reports", "enrollment",
      "reportcard", "compare", "combined", "beststudent", "analysis", "exams",
      "attendance", "lessonplans", "sms", "settings",
    ].includes(value)
  );
}

/* ---- Icons (inline SVG, same approach the project already uses) ---- */
function Icon({ paths }: { paths: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="icon"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

export const navIcons = {
  dashboard: <Icon paths={<><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>} />,
  people: <Icon paths={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><path d="M16 3.128a4 4 0 0 1 0 7.744" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /></>} />,
  teaching: <Icon paths={<><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></>} />,
  results: <Icon paths={<><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>} />,
  settings: <Icon paths={<><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" /><circle cx="12" cy="12" r="3" /></>} />,
  students: <Icon paths={<><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>} />,
  staff: <Icon paths={<><path d="M10 15H6a4 4 0 0 0-4 4v2" /><path d="m14.305 16.53.923-.382" /><path d="m15.228 13.852-.923-.383" /><path d="m16.852 12.228-.383-.923" /><path d="m16.852 17.772-.383.924" /><path d="m19.148 12.228.383-.923" /><path d="m19.53 18.696-.382-.924" /><path d="m20.772 13.852.924-.383" /><path d="m20.772 16.148.924.383" /><circle cx="18" cy="15" r="3" /><circle cx="9" cy="7" r="4" /></>} />,
  classes: <Icon paths={<><path d="M14 21v-3a2 2 0 0 0-4 0v3" /><path d="M18 5v16" /><path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6" /><path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11" /><path d="M6 5v16" /><circle cx="12" cy="9" r="2" /></>} />,
  subjects: <Icon paths={<><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" /></>} />,
  exams: <Icon paths={<><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>} />,
  attendance: <Icon paths={<><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" /></>} />,
  lessonPlans: <Icon paths={<><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></>} />,
  result: <Icon paths={<><path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><circle cx="12" cy="8" r="6" /></>} />,
  combined: <Icon paths={<><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" /></>} />,
  reportCard: <Icon paths={<><path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3.072" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="m6.69 16.479 1.29 4.88a.5.5 0 0 1-.698.591l-1.843-.849a1 1 0 0 0-.88.001l-1.846.85a.5.5 0 0 1-.693-.593l1.29-4.88" /><circle cx="5" cy="14" r="3" /></>} />,
  compare: <Icon paths={<><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M11 18H8a2 2 0 0 1-2-2V9" /></>} />,
  enrollment: <Icon paths={<><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>} />,
  bestStudent: <Icon paths={<><path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978" /><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978" /><path d="M18 9h1.5a1 1 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" /><path d="M6 9H4.5a1 1 0 0 1 0-5H6" /></>} />,
  analysis: <Icon paths={<><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></>} />,
  sms: <Icon paths={<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8" /><path d="M8 13h5" /></>} />,
  chevron: <Icon paths={<><path d="m6 9 6 6 6-6" /></>} />,
  chevronRight: <Icon paths={<><path d="m9 18 6-6-6-6" /></>} />,
  close: <Icon paths={<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>} />,
  panelClose: <Icon paths={<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></>} />,
  panelOpen: <Icon paths={<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></>} />,
};

/* ---- Menu model ---- */
export type MenuLink = { kind: "link"; key: NavKey; label: string; icon: ReactNode; roles: Role[] };
export type MenuGroup = { kind: "group"; key: string; label: string; icon: ReactNode; roles: Role[]; items: MenuLink[] };
export type MenuEntry = MenuLink | MenuGroup;

/* ============================================================
   THE MENU  (edit `roles` here to change visibility)
   ============================================================ */
export const menuConfig: MenuEntry[] = [
  {
    kind: "link",
    key: "dashboard",
    label: "Dashboard",
    icon: navIcons.dashboard,
    roles: ALL_ROLES,
  },
  {
    kind: "group",
    key: "people",
    label: "People",
    icon: navIcons.people,
    roles: ADMIN_ROLES,
    items: [
      { kind: "link", key: "students", label: "Students", icon: navIcons.students, roles: ADMIN_ROLES },
      { kind: "link", key: "staff", label: "Staff", icon: navIcons.staff, roles: ADMIN_ROLES },
      { kind: "link", key: "classes", label: "Classes", icon: navIcons.classes, roles: ADMIN_ROLES },
    ],
  },
  {
    kind: "group",
    key: "teaching",
    label: "Teaching",
    icon: navIcons.teaching,
    roles: ["Headmaster", "Academic", "Teacher"],
    items: [
      { kind: "link", key: "academic", label: "Subjects", icon: navIcons.subjects, roles: ["Headmaster", "Academic", "Teacher"] },
      { kind: "link", key: "exams", label: "Exams", icon: navIcons.exams, roles: ["Headmaster", "Academic", "Teacher"] },
      { kind: "link", key: "attendance", label: "Attendance", icon: navIcons.attendance, roles: ["Headmaster", "Academic", "Teacher"] },
      { kind: "link", key: "lessonplans", label: "Lesson Plans", icon: navIcons.lessonPlans, roles: ["Headmaster", "Academic", "Teacher"] },
    ],
  },
  {
    kind: "group",
    key: "results",
    label: "Results",
    icon: navIcons.results,
    roles: ALL_ROLES,
    items: [
      { kind: "link", key: "reports", label: "Result", icon: navIcons.result, roles: ALL_ROLES },
      { kind: "link", key: "combined", label: "Combined Results", icon: navIcons.combined, roles: ALL_ROLES },
      { kind: "link", key: "reportcard", label: "Report Card", icon: navIcons.reportCard, roles: ["Headmaster", "Academic", "District Officer"] },
      { kind: "link", key: "compare", label: "Compare", icon: navIcons.compare, roles: ALL_ROLES },
      { kind: "link", key: "enrollment", label: "Enrollment Report", icon: navIcons.enrollment, roles: ["Headmaster", "Academic", "District Officer"] },
      { kind: "link", key: "beststudent", label: "Best Student", icon: navIcons.bestStudent, roles: ALL_ROLES },
      { kind: "link", key: "sms", label: "SMS kwa Wazazi", icon: navIcons.sms, roles: ADMIN_ROLES },
      // Kept for feature parity: Subject Analysis was already only visible to Teachers.
      { kind: "link", key: "analysis", label: "Subject Analysis", icon: navIcons.analysis, roles: ["Teacher"] },
    ],
  },
  {
    kind: "link",
    key: "settings",
    label: "Settings",
    icon: navIcons.settings,
    roles: ADMIN_ROLES,
  },
];

/* ---- Helpers ---- */
export function visibleMenuFor(role: Role): MenuEntry[] {
  return menuConfig
    .filter((entry) => entry.roles.includes(role))
    .map((entry) =>
      entry.kind === "group"
        ? { ...entry, items: entry.items.filter((item) => item.roles.includes(role)) }
        : entry,
    )
    .filter((entry) => entry.kind === "link" || entry.items.length > 0);
}

export function allowedKeysFor(role: Role): NavKey[] {
  return visibleMenuFor(role).flatMap((entry) =>
    entry.kind === "group" ? entry.items.map((item) => item.key) : [entry.key],
  );
}

export function allNavItems(): MenuLink[] {
  return menuConfig.flatMap((entry) => (entry.kind === "group" ? entry.items : [entry]));
}

export function navItemLabel(key: NavKey): string {
  return allNavItems().find((item) => item.key === key)?.label ?? "Dashboard";
}

export type Crumb = { label: string; key?: NavKey };

export function breadcrumbsFor(active: NavKey, entries: MenuEntry[]): Crumb[] {
  for (const entry of entries) {
    if (entry.kind === "group") {
      const index = entry.items.findIndex((item) => item.key === active);
      if (index >= 0) {
        const first = entry.items[0];
        const crumbs: Crumb[] = [];
        crumbs.push(first.key === active ? { label: entry.label } : { label: entry.label, key: first.key });
        crumbs.push({ label: entry.items[index].label, key: active });
        return crumbs;
      }
    } else if (entry.key === active) {
      return [{ label: entry.label, key: active }];
    }
  }
  return [{ label: "Dashboard", key: "dashboard" }];
}
