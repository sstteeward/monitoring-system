import { supabase } from '../lib/supabaseClient';

export interface DailyJournal {
    id: string;
    user_id: string;
    entry_date: string;
    tasks: string;
    learnings: string;
    created_at: string;
    updated_at: string;
}

export const journalService = {
    async getJournals() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('daily_journals')
            .select('*')
            .eq('user_id', user.id)
            .order('entry_date', { ascending: false });

        if (error) throw error;
        return data as DailyJournal[];
    },

    async getJournalForDate(date: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('daily_journals')
            .select('*')
            .eq('user_id', user.id)
            .eq('entry_date', date)
            .maybeSingle();

        if (error) throw error;
        return data as DailyJournal | null;
    },

    async upsertJournal(tasks: string, learnings: string, date?: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const entryDate = date || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('daily_journals')
            .upsert({
                user_id: user.id,
                entry_date: entryDate,
                tasks: tasks,
                learnings: learnings,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id, entry_date'
            })
            .select()
            .single();

        if (error) throw error;
        return data as DailyJournal;
    }
};
