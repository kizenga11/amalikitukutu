# Amali School Portal

School management portal for **Amali School** — students, staff, classes,
subjects, examinations, results (Tanzanian NECTA CSEE grading), lesson plans,
schemes of work, and syllabus management, all in one secure web app.

## Tech stack

- **Next.js 16** (App Router, React 19, TypeScript) + **Tailwind CSS 4**
- **Supabase** — Postgres database, Row Level Security, Auth (email/password)
- **docx** — server-side `.docx` export for lesson plans and schemes of work
- **Vitest** for unit tests

## Prerequisites

- Node.js 20+
- A Supabase project (free tier is enough)
- `npm` (or your preferred package manager)

## Project structure

```
supabase/migrations/     SQL migrations (run in filename order)
scripts/                 Node scripts: migrations, seeding, data fixes
src/app/page.tsx         Login + role-aware dashboard shell
src/app/layout.tsx       Root layout
src/app/api/             Server-only routes (auth + docx generation)
src/components/          UI modules (dashboard, students, exams, results…)
src/lib/                 Clients, grading logic, fetch helpers, docx builders
src/lib/grading.ts       Pure NECTA grading/ranking math (unit-tested)
src/lib/grading.test.ts  Vitest unit tests
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file:

   ```bash
   cp .env.example .env.local
   ```

   Fill in the values from your Supabase project:

   | Variable | Where to find it |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (anon/public) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (service_role, **secret**) |
   | `DATABASE_URL` | Supabase → Project Settings → Database → Connection string |

   > Never commit `.env.local` or share the service role key. It is already
   > ignored by `.gitignore`.

## Database setup

Apply the migrations to your Supabase database:

```bash
node scripts/apply-migration.mjs
```

This runs every `.sql` file in `supabase/migrations/` in filename order through
the Postgres connection in `.env.local`, then lists the resulting tables. The
same files can also be run one-by-one from the **Supabase Dashboard → SQL
Editor**.

## Seeding

All seed scripts are safe to re-run (idempotent). They use the service role key.

| Command | What it does |
| --- | --- |
| `node scripts/apply-migration.mjs` | Creates all tables, RLS policies |
| `node scripts/seed-dashboard.mjs` | Classes, streams, subjects, ~1,284 students, 86 staff, performance, attendance, academic years |
| `node scripts/seed-demo-users.mjs` | Creates demo logins: `headmaster@amalischool.com`, `academic@amalischool.com`, `teacher@amalischool.com` |
| `node scripts/backfill-teacher-auth.mjs` | Creates Supabase Auth users for `staff` rows that have an email but no linked account |
| `node scripts/seed-lesson-plan.mjs` | Forms, school row, teacher↔subject↔form links, and demo syllabus so the Lesson Plan / SOW generators work |
| `node scripts/seed-exam-marks.mjs` | Example exam + marks for demo data |
| `node scripts/migrate-lessonplan.mjs` | One-off: imports legacy PHP "lessonplan" curriculum dump |

**Demo passwords**

| Email | Role |
| --- | --- |
| `headmaster@amalischool.com` | Headmaster |
| `academic@amalischool.com` | Academic Officer |
| `teacher@amalischool.com` | Teacher |

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Auth is on the root
page; after signing in you land on the role-aware dashboard (Headmaster /
Academic get the full portal, Teachers get a scoped view).

## Quality checks

```bash
npm test    # Vitest unit tests (grading logic etc.)
npm run lint
npx tsc --noEmit   # type check
npm run build
```

## Features by module

- **Dashboard** — student/staff/class counts, attendance, gender split,
  subject performance, per-term trend; teachers get a scoped dashboard.
- **Students** — registration, search, pagination, class/stream assignment,
  subject enrolment (compulsory vs optional).
- **Staff** — teacher CRUD, teaching assignments (subject × class × stream),
  teacher accounts via `/api/teacher-account`.
- **Classes** — form levels with streams.
- **Academic** — subjects with type (compulsory/optional), stream scope and
  practical flag.
- **Exams & Results** — exam setup per class, marks entry (theory/practical,
  absences), NECTA CSEE grading, divisions, ranking, pass rates and report cards.
- **Lesson Plans** — generate from real syllabus data, print to `.docx`.
- **Scheme of Work (SOW)** — build term schemes per subject/form, save and
  export to `.docx`.
- **Syllabus** — manage main/specific competences and learning activities.
- **Settings** — active academic year/term, school info and logos shown on
  printed reports.

## Roles & access

Roles come from the Supabase user's `user_metadata.role`:

| Module | Headmaster | Academic | Teacher |
| --- | --- | --- | --- |
| Dashboard / Results / Report cards / Compare / Exams | ✔ | ✔ | ✔ (scoped) |
| Students / Staff / Classes / Academic / Settings / Syllabus | ✔ | ✔ | — |

Note: role gating is enforced in the UI and in the server API routes; write
tighter Row Level Security policies per module before exposing the portal
publicly.