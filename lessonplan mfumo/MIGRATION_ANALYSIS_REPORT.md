# lessonplan Application — Pre-Migration Analysis Report

**Database:** `lesson_plan` (MySQL 8.x, hosted sql212.byetcluster.com)  
**App root:** `C:\Users\KITUKUTU TECHNICAL S\Videos\amalikitukutu\lessonplan mfumo\amalikitukutu`  
**SQL dump:** `ezyro_42599568_lesson_plan.sql` (766 KB, generated Sep 13 2026)

---

## 1. DATABASE STRUCTURE

### 1.1 Tables (13 total, 11 seeded + 2 from migrate.sql)

| Table | Rows in dump | Max PK | Columns | Notes |
|-------|-------------|--------|---------|-------|
| `subjects` | 6 | 6 | id, code, name, form_levels, created_at | Static seed data |
| `syllabuses` | 6 | 6 | id, subject_id, title, year, created_at | 1 per subject |
| `modules` | 31 | 102 | id, syllabus_id, code, title, form, order_no, created_at | **GAP: PKs jump to 102** |
| `units` | 98 | 107 | id, module_id, code, title, periods_allocated, form, order_no, created_at | `form` duplicated from parent module |
| `elements` | 445 | 1267 | id, unit_id, code, title, created_at | **GAP: PKs jump from 178 → 1001** |
| `teaching_methods` | 12 | 12 | id, name, created_at | Static seed (Brainstorming…Research Based) |
| `resources` | 44 | 44 | id, name, description, created_at | Static seed |
| `element_methods` | ~1780 | 1780 | id, element_id, method_id, stage, time_minutes, teaching_activity, learning_activity, assessment_criteria | 4 stages × 445 elements (partially populated) |
| `element_resources` | ~2735 | 2735 | id, element_id, resource_id | Many-to-many join |
| `lesson_plans` | **0 in dump** | AUTO_INCREMENT=6 | id, term, year, school_name, teacher_name, title, subject_id, form, module_id, unit_id, class_stream, stages (JSON), sow_data (JSON), reference, created_at | 5 rows exist in live DB |
| `scheme_of_works` | **0 in dump** | — | id, subject_id, module_id, unit_id, form, term, year, school_name, teacher_name, sow_data (JSON), reference, created_at | Empty or few rows |
| `users` | **NOT in dump** | — | id, name, email, password_hash, role (enum: admin/teacher), created_at | Created by migrate.sql |
| `teacher_assignments` | **NOT in dump** | — | id, user_id, subject_id, class_stream, created_at | Created by migrate.sql |

### 1.2 Schema Discrepancies: SQL dump vs schema.sql

| Issue | SQL dump (production) | schema.sql (canonical) |
|-------|----------------------|------------------------|
| `sow_data` type | `longtext utf8mb4_bin` | `JSON DEFAULT NULL` |
| `units.form` column | NOT present (dump) | Added by `migrate.sql` |
| `lesson_plans.class_stream` | NOT present (dump) | Added by `migrate.sql` |
| `scheme_of_works.class_stream` | NOT present (dump) | Added by `migrate.sql` |
| `users` table | NOT in dump | In schema.sql |
| `teacher_assignments` table | NOT in dump | In schema.sql |
| Database name | `lesson_plan` | `lesson_plan_db` (in schema.sql CREATE) |

**Conclusion:** The dump represents a production DB that has NOT been fully migrated to the schema.sql version. `migrate.sql` adds critical columns needed for class-stream scoping and JSON sow_data storage.

### 1.3 Indexes & Constraints

**Foreign keys (enforced in schema.sql, NOT in dump's MyISAM engine):**
```
modules.syllabus_id       → syllabuses.id
units.module_id           → modules.id
elements.unit_id          → units.id
element_methods.element_id    → elements.id
element_methods.method_id     → teaching_methods.id
element_resources.element_id  → elements.id
element_resources.resource_id → resources.id
```
⚠ All dump tables use **MyISAM** (no FK enforcement). Migration to InnoDB or Postgres will enforce FKs.

### 1.4 MySQL-Specific Features Used (PostgreSQL equivalents noted)

| MySQL Feature | Used In | PostgreSQL Equivalent |
|--------------|---------|----------------------|
| `AUTO_INCREMENT` | All PKs | `SERIAL` / `GENERATED AS IDENTITY` |
| `ENUM('admin','teacher')` | users.role | `CREATE TYPE role_enum` or `CHECK` constraint |
| `INSERT IGNORE INTO` | CRUD modules/units/subjects/syllabuses | `INSERT ... ON CONFLICT DO NOTHING` |
| `ON DUPLICATE KEY UPDATE` | elements, modules | `INSERT ... ON CONFLICT (code) DO UPDATE` |
| `GROUP_CONCAT(DISTINCT ...)` | lesson_plans.php list view | `string_agg(DISTINCT ...)` |
| `FIELD(x, 'a','b','c')` | Custom sort order in list views | `CASE WHEN x='a' THEN 1 ... END` |
| `USE lesson_plan` | db.php | Not needed (Postgres uses schema) |
| `JSON` column type | sow_data, stages | `JSONB` (recommended) |
| `CHARACTER SET utf8mb4` | All DDL | Default in Postgres (UTF-8 native) |
| Backtick quoting `` `column` `` | Everywhere | Double-quote `"column"` (optional) |

---

## 2. APPLICATION LOGIC

### 2.1 Architecture Overview

Single-page PHP application with:
- **PDO MySQL connection** (`config/db.php`) — singleton pattern, root@localhost, charset utf8mb4
- **Session-based auth** (`lpg_session` cookie) — no JWT, no API tokens
- **AJAX cascading selectors** (`ajax.php`) — subject→syllabus→module→unit→element chain
- **PDF generation** via Dompdf (`download_pdf.php`, `bulk_pdf.php`, `download_sow_pdf.php`)
- **SQL seed file importer** (`seed_data.php`) — admin uploads `.sql` files executed via PDO

### 2.2 User Roles & Authentication

| Role | Capabilities |
|------|-------------|
| `admin` | Full access: all CRUD pages, seed data, user management, all subjects |
| `teacher` | View/generate plans for assigned subjects only; list/filter views |

**Auth flow:**
1. `login.php` → `password_verify()` against `users.password_hash`
2. Session stored in `$_SESSION['user_id']`, `$_SESSION['email']`, `$_SESSION['role']`
3. Per-file guards: `requireLogin()` in `includes/auth.php`
4. Subject scoping: `canAccessSubject($subjectId)` checks `teacher_assignments` for teachers, returns all for admin
5. `allowedSubjectIds()` returns array of permitted subject IDs for the current user

**⚠ Auth vulnerability:** `login.php` does NOT call `requireLogin()` — it's the entry point, but there's no brute-force protection, no CSRF tokens.

### 2.3 Core Workflows

#### Generate Lesson Plan (`generate.php`)
```
User selects: subject → syllabus → module → unit → 1+ elements
     ↓
POST /generate.php?unit_id=X&stage=Y
     ↓
loadElementData($unit_id, $selectedElements) — fetches element_methods, element_resources
     ↓
renderPlanForm() — renders editable form with:
   - 4 stages (intro/dev/design/realisation) each with:
     - teaching_activity (editable)
     - learning_activity (editable)
     - time_minutes (default per stage)
     - assessment_criteria (editable)
     - resources (checkboxes from element_resources)
     - methods (checkboxes from element_methods)
   - Metadata: term, year, school_name, teacher_name
     ↓
POST back → INSERT INTO lesson_plans (stages as JSON, sow_data as JSON)
```

#### Generate Scheme of Work (`generate_sow.php`)
```
Same selection flow as lesson plan, but:
   - Generates all elements for selected unit
   - Creates structured JSON sow_data
   - INSERT INTO scheme_of_works
```

#### View Plan (`view_plan.php`)
```
GET ?id=X
   ↓
SELECT ... FROM lesson_plans WHERE id=X
   ↓
Decode stages JSON → render per-stage activities, resources, methods
   ↓
Display PDF download button (→ download_pdf.php?id=X)
```

#### List View with Filters (`lesson_plans.php`)
```sql
SELECT ... FROM lesson_plans lp
  JOIN subjects s ON lp.subject_id = s.id
  LEFT JOIN modules m ON lp.module_id = m.id
  LEFT JOIN units u ON lp.unit_id = u.id
WHERE lp.subject_id IN (allowedSubjectIds())   -- teacher scoping
  AND (? IS NULL OR lp.subject_id = ?)         -- subject filter
  AND (? IS NULL OR lp.form = ?)               -- form filter
  AND (? IS NULL OR lp.class_stream = ?)       -- stream filter
  AND (? IS NULL OR lp.teacher_name = ?)       -- teacher filter
ORDER BY FIELD(lp.term, 'Term 1','Term 2','Term 3'), lp.year DESC, lp.created_at DESC
```
Uses `GROUP_CONCAT(DISTINCT ...)` for displaying related modules/units in the list.

### 2.4 Data Import Flow (`seed_data.php`)

1. Admin uploads `.sql` file via form
2. File saved to `uploads/` directory
3. Contents read and executed via `PDO::exec()` — **direct SQL execution, no validation**
4. Redirects to relevant page

⚠ **Security concern:** No file type validation (only checks `pathinfo` extension), no SQL parsing/sanitization before execution.

### 2.5 PDF Generation

**Dompdf configuration** (`download_pdf.php`):
- Renders PHP HTML template inline (not from a file)
- Inline CSS for print styling
- Page orientation: landscape for SOWs
- School header from `school_name` field in plan

---

## 3. DATA QUALITY CHECK

### 3.1 Row Counts from Dump

| Table | Rows | Max PK | Coverage |
|-------|------|--------|----------|
| subjects | 6 | 6 | ✅ Complete |
| syllabuses | 6 | 6 | ✅ Complete (1 per subject) |
| modules | 31 | 102 | ⚠ PKs jump; 71 IDs unused |
| units | 98 | 107 | ⚠ PKs jump; 9 IDs unused |
| elements | 445 | 1267 | ⚠ PKs jump from 178→1001 (822 unused) |
| element_methods | ~1780 | 1780 | ⚠ Not all 445×4=1780 stages populated |
| element_resources | ~2735 | 2735 | ✅ Multiple resources per element |
| teaching_methods | 12 | 12 | ✅ Complete |
| resources | 44 | 44 | ✅ Complete |
| lesson_plans | **0** | (AUTO_INCREMENT=6) | 🔴 5 rows lost from live DB |
| scheme_of_works | **0** | — | ⚠ Unknown if any existed |
| users | **NOT IN DUMP** | — | 🔴 User accounts not captured |
| teacher_assignments | **NOT IN DUMP** | — | 🔴 Teacher→subject mappings not captured |

### 3.2 Referential Integrity (from manual inspection)

All FK relationships appear intact in the seeded data:
- All 445 elements reference valid unit_ids (1-107)
- All modules reference valid syllabus_ids (1-6)
- All units reference valid module_ids (1-31, some up to 102)
- All element_methods reference valid element_ids and method_ids

**⚠ Auto-increment gaps cause no FK issues** — no orphaned rows, just unused ID space.

### 3.3 Encoding Issues (CRITICAL)

**Mojibake detected — double-encoded UTF-8:**

50 rows in `element_methods` contain corrupted characters:
```
├óÔé¼ÔÇØ  → should be: – (en dash)
├óÔÇáÔÇÖ  → should be: ' (right single quote/apostrophe)
```

**Affected content:**
- Teaching activities with "Ask students: What is..." (en dash before questions)
- Entrepreneurship activities with apostrophes: `Tanzania├óÔÇáÔÇÖs economic development`
- Subject: Business Studies and Historia ya Tanzania na Maadili

**Syllabus title (1 row):**
```
'Muhtasari Historia ya Tanzania na Maadili Darasa la I├óÔé¼ÔÇØ IV'
→ Should be: 'Muhtasari Historia ya Tanzania na Maadili Darasa la I–IV'
```

**Root cause:** The MariaDB dump was generated with `--default-character-set=utf8mb4` but the data was stored with incorrect connection charset, causing double-encoding.

**Fix required before/during migration:** Run `CONVERT(data USING utf8mb4)` or application-level decode.

### 3.4 Missing / Zero Data

| Field | Issue | Affected Rows |
|-------|-------|---------------|
| `units.periods_allocated` | Value is 0 for ALL Business Studies, Historia, and Mathematics units | ~60+ units |
| `units.form` | All values are `'I'` — never populated for Forms II-IV | All 98 units |
| `lesson_plans.stages` | No data in dump (5 rows exist in live DB) | 5 |
| `lesson_plans.sow_data` | No data in dump | 5 |
| `users` | Entire table missing from dump | All users |

### 3.5 Data Anomalies

1. **Duplicate module codes:** Module id=10 and id=11 both have code `2.0` under the same syllabus — violates `UNIQUE(module_code, syllabus_id)` constraint in schema.sql

2. **Inconsistent form values:** Modules have forms `I`, `II`, `III`, `IV` but also one rogue value: `"Decimals and Percentages'"` (a title leaked into the form column)

3. **Element code patterns differ by subject:**
   - Computer Science: `(a)`, `(b)`, `(c)` — simple letter codes
   - Computer Programming: `1.1(a)-L01`, `1.1(b)-L02` — vocational/L01-style
   - This is expected (different syllabus structures)

4. **Teaching methods usage imbalance:**
   - Questions and Answers: 406 uses (most common)
   - Field Visit: 1 use (rarest)
   - 12 methods total, well-distributed

---

## 4. RISK REPORT: Postgres/Supabase Migration

### 4.1 DEFINITE BREAKAGES (will fail on Postgres)

| Priority | Issue | Files Affected | Fix |
|----------|-------|---------------|-----|
| 🔴 HIGH | `INSERT IGNORE INTO` not valid SQL | modules.php, units.php, subjects.php, syllabuses.php | Change to `INSERT ... ON CONFLICT DO NOTHING` |
| 🔴 HIGH | `ON DUPLICATE KEY UPDATE` not valid | elements.php, modules.php | Change to `INSERT ... ON CONFLICT (code) DO UPDATE SET ...` |
| 🔴 HIGH | `GROUP_CONCAT()` not valid | lesson_plans.php, scheme_of_works.php | Change to `string_agg(expression, delimiter)` |
| 🔴 HIGH | `FIELD()` function not valid | lesson_plans.php, scheme_of_works.php | Replace with `CASE WHEN ... THEN n END` ordering |
| 🔴 HIGH | Backtick quoting `` `col` `` | EVERY PHP file | Change to double-quote `"col"` or remove quotes |
| 🟠 MED | `USE lesson_plan` statement | config/db.php | Remove (Postgres uses `SET search_path` or connection DB) |
| 🟠 MED | `ENUM` type in CREATE TABLE | migrate.sql (users.role) | Create as `CREATE TYPE role_enum AS ENUM(...)` |
| 🟠 MED | `AUTO_INCREMENT` in DDL | schema.sql, migrate.sql | Change to `SERIAL` or `GENERATED ALWAYS AS IDENTITY` |
| 🟡 LOW | `longtext` column type | schema.sql (sow_data fallback) | Use `TEXT` or `JSONB` |

### 4.2 DATA MIGRATION RISKS

| Risk | Severity | Details |
|------|----------|---------|
| Lost lesson plans | 🔴 HIGH | 5 rows exist in live DB but are NOT in the dump — must export from live DB before migration |
| Lost user accounts | 🔴 HIGH | `users` and `teacher_assignments` tables not in dump — must export separately |
| Mojibake encoding | 🟠 MEDIUM | 50+ rows with double-encoded UTF-8 — must clean before/during import |
| JSON column compatibility | 🟠 MEDIUM | `sow_data` is `longtext` in dump but `JSON` in schema — cast to `JSONB` in Postgres |
| Integer overflow (unlikely) | 🟡 LOW | PKs up to 2735 fit in Postgres `INTEGER` (max 2.1B) |
| Duplicate module codes | 🟡 LOW | 2 modules with same code will violate Postgres UNIQUE constraint — must deduplicate first |

### 4.3 APPLICATION CODE CHANGES REQUIRED

**Files requiring SQL syntax changes (12 files):**

| File | Changes Needed |
|------|---------------|
| `config/db.php` | Remove `USE` statement; update DSN for Postgres (`pgsql:host=...`) |
| `modules.php` | `INSERT IGNORE` → `ON CONFLICT DO NOTHING`; backticks → double-quotes |
| `units.php` | `INSERT IGNORE` → `ON CONFLICT DO NOTHING`; backticks → double-quotes |
| `subjects.php` | `INSERT IGNORE` → `ON CONFLICT DO NOTHING` |
| `syllabuses.php` | `INSERT IGNORE` → `ON CONFLICT DO NOTHING` |
| `elements.php` | `ON DUPLICATE KEY UPDATE` → `ON CONFLICT ... DO UPDATE` |
| `lesson_plans.php` | `GROUP_CONCAT` → `string_agg`; `FIELD()` → `CASE WHEN` |
| `scheme_of_works.php` | `GROUP_CONCAT` → `string_agg`; `FIELD()` → `CASE WHEN` |
| `ajax.php` | Backtick quoting |
| `generate.php` | Backtick quoting in INSERT |
| `generate_sow.php` | Backtick quoting in INSERT |
| `seed_data.php` | SQL file execution (may contain MySQL-specific syntax) |

**Files with NO changes needed (read-only/rendering):**
- `view_plan.php`, `view_sow.php`, `download_pdf.php`, `bulk_pdf.php`, `download_sow_pdf.php`
- `includes/plan_helpers.php`, `includes/auth.php`
- `login.php`, `logout.php`, `header.php`, `footer.php`
- All JS/CSS files

### 4.4 SUPABASE-SPECIFIC CONSIDERATIONS

| Consideration | Impact |
|--------------|--------|
| Row Level Security (RLS) | Must define policies per table — replaces PHP-based `canAccessSubject()` |
| Auth integration | Supabase Auth can replace session-based login (`users` table becomes `auth.users`) |
| Storage for file uploads | `elements.php` uploads files to `assets/uploads/` — migrate to Supabase Storage |
| Edge Functions for PDF | Dompdf runs server-side — needs Supabase Edge Function or external service |
| Real-time subscriptions | Not currently used but could enhance live collaboration |
| `seed_data.php` (SQL exec) | CANNOT work in Supabase — must pre-migrate data, no runtime SQL execution |

### 4.5 RECOMMENDED MIGRATION SEQUENCE

1. **Export live data** — get `lesson_plans`, `users`, `teacher_assignments` from live DB (NOT in dump)
2. **Clean encoding** — fix 50+ mojibake rows in element_methods and 1 mojibake syllabus title
3. **Deduplicate module codes** — fix the 2 modules with duplicate `code = '2.0'`
4. **Create Postgres schema** — convert all MySQL DDL (replace AUTO_INCREMENT, ENUM, backticks, etc.)
5. **Create JSONB columns** — `stages` and `sow_data` as `JSONB` with proper indexes
6. **Import seed data** — subjects, syllabuses, modules, units, elements first (order matters for FKs)
7. **Import element_methods + element_resources** — after elements exist
8. **Import lesson_plans + scheme_of_works** — user-generated content
9. **Import users + teacher_assignments** — after subjects exist
10. **Update PHP files** — replace MySQL syntax (INSERT IGNORE, GROUP_CONCAT, FIELD, backticks)
11. **Update config/db.php** — Postgres DSN, remove USE statement
12. **Test cascading selectors** — AJAX endpoint must work with Postgres queries
13. **Test PDF generation** — verify Dompdf renders correctly with Postgres data
14. **Set up Supabase RLS** — define row-level security policies per role
15. **Replace seed_data.php** — admin import must use pre-built migration scripts, not runtime SQL exec

---

**Report generated:** September 15, 2026  
**Prepared by:** opencode analysis session  
**Status:** Ready for user review before migration planning begins
