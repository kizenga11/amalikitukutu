import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows, error } = await admin
  .from("staff")
  .select("id, name, email, password, auth_user_id")
  .eq("role", "Teacher")
  .not("email", "is", null)
  .not("password", "is", null)
  .is("auth_user_id", null);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

console.log(`Found ${rows?.length ?? 0} teacher(s) without an auth account.`);

async function findUserByEmail(email) {
  const target = email.trim().toLowerCase();
  let page = 1;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users?.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (!data?.nextPage || page >= (data?.lastPage ?? 0)) return null;
    page += 1;
  }
}

for (const row of rows ?? []) {
  const meta = { role: "Teacher", staff_id: row.id, name: row.name };
  const existing = await findUserByEmail(row.email);

  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      email: row.email,
      password: row.password,
      user_metadata: meta,
    });
    await admin.from("staff").update({ auth_user_id: existing.id }).eq("id", row.id);
    console.log(`linked: ${row.email} (reused auth user ${existing.id})`);
    continue;
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: row.email,
    password: row.password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (createError) {
    console.error(`failed: ${row.email} -> ${createError.message}`);
    continue;
  }
  await admin.from("staff").update({ auth_user_id: created.user.id }).eq("id", row.id);
  console.log(`created: ${row.email} (auth user ${created.user.id})`);
}

console.log("backfill done.");