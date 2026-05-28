import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    // Authenticate as a user to test RLS
    // Wait, let's just query it anonymously first
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'anti_cheat_flag')
        .order('created_at', { ascending: false })
        .limit(5);
        
    console.log("Raw logs:", JSON.stringify(data, null, 2));
    
    if (data && data.length > 0) {
        const userIds = [...new Set(data.map(l => l.user_id).filter(Boolean))];
        console.log("User IDs found:", userIds);
        
        if (userIds.length > 0) {
            const { data: profiles, error: pErr } = await supabase
                .from('profiles')
                .select('*')
                .in('auth_user_id', userIds);
            console.log("Profiles found:", profiles?.length);
            console.log("Profiles Error:", pErr);
        }
    }
}
run();
