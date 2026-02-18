import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Provide a clear runtime error to help debugging env issues
  const missing = [
    !SUPABASE_URL ? 'VITE_SUPABASE_URL' : null,
    !SUPABASE_ANON_KEY ? 'VITE_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean).join(', ');
  throw new Error(`Missing Supabase environment variables: ${missing}. Add them to your .env and restart the dev server.`);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);