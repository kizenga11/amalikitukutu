// Run: node scripts/apply-migration.mjs
// Applies every .sql file in supabase/migrations (in filename order) via the
// postgres connection in .env.local, then lists the public tables.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

const env = loadEnv();
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(1);
}

const client = clientFromUrl(env.DATABASE_URL);
try {
  await client.connect();
  const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    await client.query(sql);
    console.log(`applied: ${file}`);
  }
  const tables = await client.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  console.log("Tables:", tables.rows.map((r) => r.tablename).join(", "));
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}