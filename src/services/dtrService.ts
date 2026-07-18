/**
 * DTR (Daily Time Record) Service
 * 
 * Handles reading/writing DTR records to Supabase.
 * DTR records are auto-populated from clock-in/out events.
 */

import { supabase } from '../lib/supabaseClient';

/**
 * Converts raw timesheet rows (clock_in/clock_out) into DTRRecordRow format.
 * Groups timesheets by date: first session → morning, second → afternoon.
 */
function convertTimesheetsToDTR(timesheets: any[]): DTRRecordRow[] {
    // Group by date
    const byDate = new Map<string, any[]>();
    timesheets.forEach(ts => {
        if (!ts.clock_in || ts.status !== 'completed') return;
        const dateStr = new Date(ts.clock_in).toLocaleDateString('en-CA'); // YYYY-MM-DD
        if (!byDate.has(dateStr)) byDate.set(dateStr, []);
        byDate.get(dateStr)!.push(ts);
    });

    const records: DTRRecordRow[] = [];

    byDate.forEach((sessions, dateStr) => {
        // Sort by clock_in time
        sessions.sort((a: any, b: any) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

        const morning = sessions[0];
        const afternoon = sessions.length > 1 ? sessions[1] : null;

        const morningIn = morning?.clock_in || null;
        const morningOut = morning?.clock_out || null;
        const afternoonIn = afternoon?.clock_in || null;
        const afternoonOut = afternoon?.clock_out || null;

        // Calculate total hours worked
        let totalMs = 0;
        sessions.forEach((s: any) => {
            if (s.clock_in && s.clock_out) {
                totalMs += new Date(s.clock_out).getTime() - new Date(s.clock_in).getTime();
            }
        });
        const dailyTotal = totalMs > 0 ? Math.round((totalMs / 3600000) * 100) / 100 : null;

        records.push({
            id: `ts-${dateStr}`,
            user_id: morning.user_id,
            record_date: dateStr,
            morning_in: morningIn,
            morning_out: morningOut,
            afternoon_in: afternoonIn,
            afternoon_out: afternoonOut,
            overtime_in: null,
            overtime_out: null,
            daily_total: dailyTotal,
            created_at: morning.clock_in,
            updated_at: morning.clock_out || morning.clock_in,
        });
    });

    // Sort by date
    records.sort((a, b) => a.record_date.localeCompare(b.record_date));
    return records;
}

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
     * Auto-corrects misplaced DTR fields caused by a previous bug where
     * afternoon clock-out was written to morning_out instead of afternoon_out.
     * Detects pattern: morning_out set without morning_in + afternoon_in set without afternoon_out.
     */
    async healMisplacedRecords(): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch all records for the current user that might be corrupted
        const { data: records, error } = await supabase
            .from('dtr_records')
            .select('*')
            .eq('user_id', user.id);

        if (error || !records) return;

        for (const record of records) {
            // Pattern: morning_out is set but morning_in is NOT, AND afternoon_in is set but afternoon_out is NOT
            // This means the clock-out was mistakenly placed in morning_out instead of afternoon_out
            if (record.morning_out && !record.morning_in && record.afternoon_in && !record.afternoon_out) {
                const { error: updateErr } = await supabase
                    .from('dtr_records')
                    .update({
                        afternoon_out: record.morning_out,
                        morning_out: null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', record.id);

                if (updateErr) {
                    console.error('[DTR] Heal misplaced record failed:', updateErr);
                } else {
                    console.log(`[DTR] Auto-corrected record ${record.record_date}: moved morning_out → afternoon_out`);
                }
            }
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

        // Try dtr_records first
        const { data, error } = await supabase
            .from('dtr_records')
            .select('*')
            .eq('user_id', user.id)
            .gte('record_date', startDate)
            .lt('record_date', endDate)
            .order('record_date', { ascending: true });

        if (!error && data && data.length > 0) {
            return data as DTRRecordRow[];
        }

        // Fallback: build DTR from timesheets
        return this._buildDTRFromTimesheets(user.id, startDate, endDate);
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
    },

    // ── Coordinator Signature Methods ──────────────────────────────────────────

    /**
     * Fetches all DTR records for a given month/year for a specific user.
     * Used by coordinators to view student DTRs.
     */
    async fetchMonthDTRForUser(userId: string, month: number, year: number): Promise<DTRRecordRow[]> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

        // Try dtr_records first
        const { data, error } = await supabase
            .from('dtr_records')
            .select('*')
            .eq('user_id', userId)
            .gte('record_date', startDate)
            .lt('record_date', endDate)
            .order('record_date', { ascending: true });

        if (!error && data && data.length > 0) {
            return data as DTRRecordRow[];
        }

        // Fallback: build DTR from timesheets
        return this._buildDTRFromTimesheets(userId, startDate, endDate);
    },

    /**
     * Fetches ALL DTR records for a user (no month filter).
     * Returns records sorted by date ascending.
     */
    async fetchAllDTRForUser(userId: string): Promise<DTRRecordRow[]> {
        const { data, error } = await supabase
            .from('dtr_records')
            .select('*')
            .eq('user_id', userId)
            .order('record_date', { ascending: true });

        if (error) {
            console.error('[DTR] Fetch all for user failed:', error);
            return [];
        }

        return (data || []) as DTRRecordRow[];
    },

    /**
     * Discovers which months have DTR data for a user.
     * Returns an array of { month, year } objects, sorted chronologically.
     */
    async fetchDTRMonthsForUser(userId: string): Promise<{ month: number; year: number }[]> {
        const seen = new Set<string>();
        const months: { month: number; year: number }[] = [];

        const addDates = (dates: string[]) => {
            dates.forEach(dateStr => {
                const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
                const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
                }
            });
        };

        // Check dtr_records
        const { data: dtrData } = await supabase
            .from('dtr_records')
            .select('record_date')
            .eq('user_id', userId)
            .order('record_date', { ascending: true });

        if (dtrData && dtrData.length > 0) {
            addDates(dtrData.map(r => r.record_date));
        }

        // Also check timesheets (the primary data source for hours)
        const { data: tsData } = await supabase
            .from('timesheets')
            .select('clock_in')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .order('clock_in', { ascending: true });

        if (tsData && tsData.length > 0) {
            addDates(tsData.map(r => r.clock_in));
        }

        // Sort chronologically
        months.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
        return months;
    },

    /**
     * Internal: builds DTR records from the timesheets table.
     * Used as fallback when dtr_records is empty.
     */
    async _buildDTRFromTimesheets(userId: string, startDate: string, endDate: string): Promise<DTRRecordRow[]> {
        const { data: tsData, error: tsError } = await supabase
            .from('timesheets')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .gte('clock_in', `${startDate}T00:00:00`)
            .lt('clock_in', `${endDate}T00:00:00`)
            .order('clock_in', { ascending: true });

        if (tsError) {
            console.error('[DTR] Timesheet fallback failed:', tsError);
            return [];
        }

        return convertTimesheetsToDTR(tsData || []);
    },

    /**
     * Saves the coordinator's signature to their profile.
     */
    async saveCoordinatorSignature(signatureDataUrl: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('profiles')
            .update({ coordinator_signature: signatureDataUrl })
            .eq('auth_user_id', user.id);

        if (error) throw error;
    },

    /**
     * Signs a specific day on a student's DTR.
     */
    async signDTRDay(studentUserId: string, recordDate: string, signatureUrl: string, dtrRecordId?: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('dtr_signatures')
            .upsert({
                user_id: studentUserId,
                record_date: recordDate,
                signed_by: user.id,
                signature_url: signatureUrl,
                dtr_record_id: dtrRecordId || null
            }, {
                onConflict: 'user_id,record_date'
            });

        if (error) {
            console.error('[DTR] Sign day failed:', error);
            throw error;
        }
    },

    /**
     * Removes a signature from a specific day.
     */
    async unsignDTRDay(studentUserId: string, recordDate: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase
            .from('dtr_signatures')
            .delete()
            .eq('user_id', studentUserId)
            .eq('record_date', recordDate)
            .eq('signed_by', user.id); // Ensure they can only unsign their own

        if (error) {
            console.error('[DTR] Unsign day failed:', error);
            throw error;
        }
    },

    /**
     * Fetches all signatures for a specific month for a student.
     */
    async fetchMonthSignatures(studentUserId: string, month: number, year: number): Promise<Record<string, string>> {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

        const { data, error } = await supabase
            .from('dtr_signatures')
            .select('record_date, signature_url')
            .eq('user_id', studentUserId)
            .gte('record_date', startDate)
            .lt('record_date', endDate);

        if (error) {
            console.error('[DTR] Fetch signatures failed:', error);
            return {};
        }

        // Return a map of YYYY-MM-DD -> signature_url
        const signatureMap: Record<string, string> = {};
        data?.forEach(sig => {
            signatureMap[sig.record_date] = sig.signature_url;
        });
        
        return signatureMap;
    }
};
