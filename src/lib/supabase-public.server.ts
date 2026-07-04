// Server-side Supabase publishable client for public reads (respects RLS as anon).
// Load only inside server-fn handlers.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _client: ReturnType<typeof createClient<Database>> | undefined;

export function getPublicServerClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  _client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
