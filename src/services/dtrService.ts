/**
 * DTR (Daily Time Record) Service
 * 
 * Handles reading/writing DTR records to Supabase.
 * DTR records are auto-populated from clock-in/out events.
 */

import { supabase } from '../lib/supabaseClient';

export interface DTRRecordRow {
    id: string;
    user_id: string;
    record_date: string;
    morning_in: string | null;
    morning_out: string | null;
    afternoon_in: string | null;
    afternoon_out: string | null;
    overtime_in: string | null;
    overtime_out: string | null;
    daily_total: number | null;
    created_at: string;
    updated_at: string;
}

export type DTRField = 'morning_in' | 'morning_out' | 'afternoon_in' | 'afternoon_out' | 'overtime_in' | 'overtime_out';

/**
 * Calculates daily total hours from morning_in to afternoon_out (or morning_out if no afternoon).
 * Returns hours as a decimal (e.g. 8.5).
 */
function calculateDailyTotal(record: Partial<DTRRecordRow>): number | null {
    const startTime = record.morning_in;
    const endTime = record.afternoon_out || record.morning_out;

    if (!startTime || !endTime) return null;

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    if (end <= start) return null;

    let totalMs = end - start;

    // Subtract break time (morning_out to afternoon_in)
    if (record.morning_out && record.afternoon_in) {
        const breakStart = new Date(record.morning_out).getTime();
        const breakEnd = new Date(record.afternoon_in).getTime();
        if (breakEnd > breakStart) {
            totalMs -= (breakEnd - breakStart);
        }
    }

    return Math.round((totalMs / 3600000) * 100) / 100; // Round to 2 decimals
}

export const dtrService = {
    /**
     * Upserts a single DTR field for today's date.
     * Uses the unique constraint on (user_id, record_date) to avoid duplicates.
     */
    async upsertDTRField(field: DTRField, timestamp: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // First, try to get existing record to calculate daily_total
        const { data: existing } = await supabase
            .from('dtr_records')
            .select('*')
            .eq('user_id', user.id)
            .eq('record_date', today)
            .maybeSingle();

        const updatedRecord = {
            ...(existing || {}),
            user_id: user.id,
            record_date: today,
            [field]: timestamp,
            updated_at: new Date().toISOString()
        };

        // Calculate daily total with the new field value
        const daily_total = calculateDailyTotal(updatedRecord);

        const { error } = await supabase
            .from('dtr_records')
            .upsert({
                user_id: user.id,
                record_date: today,
                [field]: timestamp,
                daily_total,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,record_date'
            });

        if (error) {
            console.error('[DTR] Upsert failed:', error);
            throw error;
        }
    },

    /**
     * Fetches all DTR records for a given month/year for the current user.
     */
    async fetchMonthDTR(month: number, year: number): Promise<DTRRecordRow[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        // Build date range for the month
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

        const { data, error } = await supabase
            .from('dtr_records')
            .select('*')
            .eq('user_id', user.id)
            .gte('record_date', startDate)
            .lt('record_date', endDate)
            .order('record_date', { ascending: true });

        if (error) {
            console.error('[DTR] Fetch failed:', error);
            return [];
        }

        return (data || []) as DTRRecordRow[];
    },

    /**
     * Subscribes to real-time changes on the dtr_records table for the current user.
     * Returns an unsubscribe function.
     */
    subscribeToChanges(
        userId: string,
        onUpdate: (record: DTRRecordRow) => void
    ): () => void {
        const channel = supabase
            .channel('dtr-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'dtr_records',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    if (payload.new && typeof payload.new === 'object') {
                        onUpdate(payload.new as DTRRecordRow);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    },

    /**
     * Formats a timestamp string to HH:mm for DTR grid display.
     */
    formatTime(timestamp: string | null): string {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    },

    /**
     * Formats daily total hours to a display string like "8.5 hrs".
     */
    formatTotal(hours: number | null): string {
        if (hours === null || hours === undefined) return '';
        return `${hours.toFixed(1)}`;
    }
};
