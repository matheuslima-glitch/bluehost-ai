import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing VITE_SUPABASE_URL in .env file");
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    "Missing VITE_SUPABASE_SERVICE_ROLE_KEY in .env file - Get it from Supabase Dashboard > Settings > API > service_role key",
  );
}

// Cliente Admin com Service Role Key
// storageKey diferente para evitar conflito com o cliente principal
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storageKey: "supabase-admin-auth",
  },
});
