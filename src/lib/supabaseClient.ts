import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // `experimental.passkey` is provided by @supabase/supabase-js 2.105+.
    auth: { experimental: { passkey: true } } as any,
});

if (typeof window !== 'undefined') {
    (window as any).__supabase = supabase;
}
