import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''; // We might need service key

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLogs() {
    const { data: rawLogs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'anti_cheat_flag')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log(JSON.stringify(rawLogs, null, 2));
    if (error) console.error(error);
}

checkLogs().catch(console.error);
