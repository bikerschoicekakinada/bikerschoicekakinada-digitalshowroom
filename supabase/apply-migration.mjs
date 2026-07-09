// Apply migration via Supabase Management API
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "migrations/20260706_configurator_schema.sql"), "utf8");

const PROJECT_REF = process.env.VITE_SUPABASE_PROJECT_ID;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;

// Use the Supabase REST API pg endpoint via service role
const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  method: "HEAD",
  headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
});
console.log("Supabase reachable:", res.status);

// Use @supabase/supabase-js to execute each statement via a stored procedure
// But first, let's try a simpler approach: use fetch to the SQL execute endpoint
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 3 && !s.startsWith("--"));

console.log(`Executing ${statements.length} statements...`);

let ok = 0;
const errors = [];

for (const stmt of statements) {
  const fullStmt = stmt.endsWith(";") ? stmt : stmt + ";";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ query: fullStmt }),
    });
    if (r.ok) {
      ok++;
    } else {
      const body = await r.text();
      errors.push({ stmt: fullStmt.slice(0, 80), error: body });
    }
  } catch (e) {
    errors.push({ stmt: fullStmt.slice(0, 80), error: String(e) });
  }
}

console.log(`Done: ${ok}/${statements.length} ok`);
if (errors.length) {
  console.log("Errors (may be benign IF NOT EXISTS):");
  for (const e of errors) console.log(" -", e.stmt, "=>", e.error.slice(0, 120));
}
