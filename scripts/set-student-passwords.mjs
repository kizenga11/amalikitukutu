// Set the initial student-portal password for existing students.
//
// Run:
//   node scripts/set-student-passwords.mjs
//   node scripts/set-student-passwords.mjs --reset-all
//
// The default password is Kitukutu_TECH. Passwords are stored as
// scrypt hashes (never plain text). New accounts are created with
// must_change_password = true, so students must choose a new password
// on first login. --reset-all also resets accounts that already exist.

import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const DEFAULT_PASSWORD = "Kitukutu_TECH";
const resetAll = process.argv.includes("--reset-all");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function clientFromUrl(url) {
  const u = new URL(url);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

const client = clientFromUrl(env.DATABASE_URL);
try {
  await client.connect();

  const { rows: students } = await client.query(
    `select s.id, s.registration_no, a.id as account_id
       from public.students s
       left join public.student_accounts a on a.student_id = s.id
      order by s.registration_no nulls last`,
  );

  let created = 0;
  let reset = 0;
  let skipped = 0;

  await client.query("begin");
  for (const student of students) {
    if (student.account_id && !resetAll) {
      skipped += 1;
      continue;
    }

    const passwordHash = hashPassword(DEFAULT_PASSWORD);
    if (student.account_id) {
      await client.query(
        `update public.student_accounts
            set password_hash = $1,
                must_change_password = true,
                is_active = true,
                password_changed_at = null,
                updated_at = now()
          where id = $2`,
        [passwordHash, student.account_id],
      );
      reset += 1;
    } else {
      await client.query(
        `insert into public.student_accounts (student_id, password_hash, must_change_password)
         values ($1, $2, true)`,
        [student.id, passwordHash],
      );
      created += 1;
    }
  }
  await client.query("commit");

  console.log(`Students found: ${students.length}`);
  console.log(`Accounts created: ${created}`);
  console.log(`Accounts reset: ${reset}`);
  console.log(`Accounts skipped (already existed): ${skipped}`);
  console.log(`Default password: ${DEFAULT_PASSWORD}`);
  console.log("Students must change the password on first login.");
} catch (error) {
  try {
    await client.query("rollback");
  } catch {
    // ignore rollback failure
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
