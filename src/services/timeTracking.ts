
import { supabase } from '../lib/supabaseClient';

export interface Timesheet {
    id: string;
    user_id: string;
    clock_in: string;
    clock_out: string | null;
    break_start: string | null;
    break_end: string | null;
    status: 'working' | 'break' | 'completed';
}

export const timeTrackingService = {
    async getCurrentSession() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;



        // Check if we found a session that isn't completed.
        // However, the query logic above with .or might be tricky with multiple conditions.
        // Better strategy: just get the latest entry and check its status.
        const { data: latest, error: matchError } = await supabase
            .from('timesheets')
            .select('*')
            .eq('user_id', user.id)
            .order('clock_in', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (matchError) throw matchError;

        // If the latest session is completed, user is not currently working.
        if (latest && latest.status !== 'completed') {
            return latest as Timesheet;
        }

        return null;
    },

    async clockIn() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('timesheets')
            .insert([
                {
                    user_id: user.id,
                    clock_in: new Date().toISOString(),
                    status: 'working'
                }
            ])
            .select()
            .single();

        if (error) throw error;
        return data as Timesheet;
    },

    async clockOut(id: string) {
        const { data, error } = await supabase
            .from('timesheets')
            .update({
                clock_out: new Date().toISOString(),
                status: 'completed'
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Timesheet;
    },

    async startBreak(id: string) {
        const { data, error } = await supabase
            .from('timesheets')
            .update({
                break_start: new Date().toISOString(),
                status: 'break'
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Timesheet;
    },

    async endBreak(id: string) {
        const { data, error } = await supabase
            .from('timesheets')
            .update({
                break_end: new Date().toISOString(), // In a real app, you might want an array of breaks, but for this simple version we assume one break or last break
                status: 'working'
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Timesheet;
    }
};
