import { createClient } from "@supabase/supabase-js";

// Tentar variáveis com e sem prefixo VITE_
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const supabaseServiceRoleKey =
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Fallback para URL hardcoded se necessário (apenas para produção)
const FALLBACK_URL = "https://dsehaqdqnrkjrhbvkfrk.supabase.co";

const finalUrl = supabaseUrl || FALLBACK_URL;

if (!finalUrl) {
  console.error("SUPABASE_URL não configurado");
}

if (!supabaseServiceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY não configurado - atualizações de convite podem falhar");
}

// Cliente Admin com Service Role Key
// storageKey diferente para evitar conflito com o cliente principal
export const supabaseAdmin = createClient(finalUrl, supabaseServiceRoleKey || "dummy-key-will-fail", {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    storageKey: "supabase-admin-auth",
  },
});
