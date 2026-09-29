import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

// True once .env.local has both values. The app shows setup help instead of crashing when it doesn't.
export const isConfigured = Boolean(url && key);

export const supabase = isConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
