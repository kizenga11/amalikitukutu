import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1).replace(/^['"]|['"]$/g, "")];
    }),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const demoUsers = [
  { email: "headmaster@amalischool.com", password: "Amali@2026HM!", role: "Headmaster" },
  { email: "academic@amalischool.com", password: "Amali@2026AC!", role: "Academic" },
  { email: "teacher@amalischool.com", password: "Amali@2026TR!", role: "Teacher" },
];

const { data, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const demoUser of demoUsers) {
  const existing = data.users.find((user) => user.email === demoUser.email);
  const result = existing
    ? await supabase.auth.admin.updateUserById(existing.id, {
        password: demoUser.password,
        email_confirm: true,
        user_metadata: { role: demoUser.role },
      })
    : await supabase.auth.admin.createUser({
        email: demoUser.email,
        password: demoUser.password,
        email_confirm: true,
        user_metadata: { role: demoUser.role },
      });

  if (result.error) throw result.error;
  console.log(`ready: ${demoUser.email} (${demoUser.role})`);
}