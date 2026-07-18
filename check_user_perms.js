import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('profiles').select('id, auth_user_id, account_type, permissions, email').limit(10);
  console.log('Profiles:', JSON.stringify(data, null, 2));
  console.log('Error:', error);
}

run();
