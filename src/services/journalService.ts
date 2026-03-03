import { supabase } from '../lib/supabaseClient';

export interface DailyJournal {
    id: string;
    user_id: string;
    entry_date: string;
    tasks: string;
    learnings: string;
    photo_urls?: string[];
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

    async uploadJournalPhotos(files: File[]): Promise<string[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const uploadPromises = files.map(async (file) => {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('journal-photos')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);

            const { data } = supabase.storage
                .from('journal-photos')
                .getPublicUrl(fileName);

            return data.publicUrl;
        });

        return Promise.all(uploadPromises);
    },

    async upsertJournal(tasks: string, learnings: string, date?: string, photo_urls?: string[]) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const entryDate = date || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .rpc('upsert_journal', {
                p_entry_date: entryDate,
                p_tasks: tasks,
                p_learnings: learnings,
                p_photo_urls: photo_urls || []
            });

        if (error) {
            console.error("Supabase upsert error:", error);
            throw new Error(`Database error: ${error.message}`);
        }
        return data as DailyJournal;
    }
};
