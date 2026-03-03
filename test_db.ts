import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);

async function test() {
    const j = await supabase.from('daily_journals').select('*').limit(1);
    console.log('journal keys:', Object.keys(j.data?.[0] || {}));

    const t = await supabase.from('timesheets').select('*').limit(1);
    console.log('timesheet keys:', Object.keys(t.data?.[0] || {}));
}
test();
