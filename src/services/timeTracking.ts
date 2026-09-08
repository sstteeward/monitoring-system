
import { supabase } from '../lib/supabaseClient';
import {
    DEFAULT_DAILY_LIMIT_MINUTES,
    DEFAULT_TIME_ZONE,
    DEFAULT_WARNING_LEAD_MINUTES,
} from '../utils/attendanceLimit';

export interface Timesheet {
    id: string;
    user_id: string;
    clock_in: string;
    clock_out: string | null;
    break_start: string | null;
    break_end: string | null;
    status: 'working' | 'break' | 'completed';
    clock_in_latitude?: number | null;
    clock_in_longitude?: number | null;
    clock_out_latitude?: number | null;
    clock_out_longitude?: number | null;
    requires_approval?: boolean;
    photo_url?: string | null;
    approval_status?: 'pending' | 'approved' | 'rejected' | null;
    /** Maintained by the daily-limit detector; see supabase_attendance_daily_limit.sql. */
    daily_limit_status?: 'NORMAL' | 'LIMIT_REACHED' | 'OVER_LIMIT' | null;
    limit_notification_sent?: boolean | null;
    limit_notification_sent_at?: string | null;
    over_limit_minutes?: number | null;
}

/** What the server says about today's rendered time for the signed-in student. */
export interface DailyLimitCheck {
    attendance_date: string;
    rendered_minutes: number;
    limit_minutes: number;
    warning_minutes: number;
    over_limit_minutes: number;
    state: 'NORMAL' | 'LIMIT_REACHED' | 'OVER_LIMIT';
    active_timesheet_id: string | null;
    active_clock_in: string | null;
    notification_sent: boolean;
    time_zone: string;
}

/** One logged daily-limit warning, with the delivery state of its email. */
export interface LimitAlert {
    id: string;
    student_id: string;
    student_name: string | null;
    attendance_date: string;
    alert_type: 'student_limit_reached' | 'coordinator_limit_alert';
    recipient_email: string | null;
    rendered_minutes: number;
    limit_minutes: number;
    over_limit_minutes: number;
    email_sent: boolean | null;
    email_error: string | null;
    email_attempts: number | null;
    created_at: string;
}

export interface DailyLimitConfig {
    limitMinutes: number;
    warningMinutes: number;
    timeZone: string;
}

export const DEFAULT_LIMIT_CONFIG: DailyLimitConfig = {
    limitMinutes: DEFAULT_DAILY_LIMIT_MINUTES,
    warningMinutes: DEFAULT_DAILY_LIMIT_MINUTES - DEFAULT_WARNING_LEAD_MINUTES,
    timeZone: DEFAULT_TIME_ZONE,
};

export const timeTrackingService = {
    async getTimesheets() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('timesheets')
            .select('*')
            .eq('user_id', user.id)
            .order('clock_in', { ascending: false });

        if (error) throw error;
        return data as Timesheet[];
    },

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

    async clockIn(lat?: number, lng?: number, requiresApproval: boolean = false, photoUrl?: string | null) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('timesheets')
            .insert([{
                user_id: user.id,
                status: 'working',
                clock_in: new Date().toISOString(),
                clock_in_latitude: lat,
                clock_in_longitude: lng,
                requires_approval: requiresApproval,
                photo_url: photoUrl
            }])
            .select()
            .single();

        if (error) throw error;
        return data as Timesheet;
    },

    async clockOut(id: string, latitude?: number, longitude?: number) {
        const { data, error } = await supabase
            .from('timesheets')
            .update({
                clock_out: new Date().toISOString(),
                status: 'completed',
                clock_out_latitude: latitude,
                clock_out_longitude: longitude
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Timesheet;
    },

    /**
     * The configured daily limit, from the same `ojt_hours` setting the admin
     * screen already edits — never a hard-coded 8.
     *
     * Read-only and safe to fall back on: if the setting is missing the
     * documented default applies, and the server enforces its own copy of the
     * rule regardless of what the browser believes.
     */
    async getDailyLimitConfig(): Promise<DailyLimitConfig> {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'ojt_hours')
                .maybeSingle();
            if (error || !data?.value) return DEFAULT_LIMIT_CONFIG;

            const value = data.value as { max_daily?: number; warning_lead_minutes?: number; time_zone?: string };
            const hours = Number(value.max_daily);
            const limitMinutes = Number.isFinite(hours) && hours > 0
                ? Math.min(1440, Math.max(60, Math.round(hours * 60)))
                : DEFAULT_DAILY_LIMIT_MINUTES;
            const lead = Number(value.warning_lead_minutes);
            return {
                limitMinutes,
                warningMinutes: Math.max(0, limitMinutes - (Number.isFinite(lead) && lead >= 0 ? lead : DEFAULT_WARNING_LEAD_MINUTES)),
                timeZone: value.time_zone?.trim() || DEFAULT_TIME_ZONE,
            };
        } catch {
            return DEFAULT_LIMIT_CONFIG;
        }
    },

    /**
     * Asks the server to re-evaluate the caller's own rendered time.
     *
     * This is the foreground half of the detection — it makes the warning
     * appear the moment the student crosses the limit while they are looking at
     * the page. The scheduled job is what covers a closed tab, and both call
     * the same function, so neither can send a second email.
     *
     * Returns null when the migration has not been applied yet, so the
     * dashboard falls back to its own arithmetic rather than breaking.
     */
    async checkDailyLimit(): Promise<DailyLimitCheck | null> {
        const { data, error } = await supabase.rpc('check_my_attendance_limit');
        if (error) {
            console.warn('Daily limit check unavailable:', error.message);
            return null;
        }
        return data as DailyLimitCheck;
    },

    /**
     * The daily-limit warning log, for staff.
     *
     * Delivery state comes from the notification row the email function
     * maintains, so a warning whose email failed reads as failed rather than
     * silently as "sent".
     */
    async getLimitAlerts(from: string, to: string): Promise<LimitAlert[]> {
        const { data, error } = await supabase.rpc('get_attendance_limit_alerts', { p_from: from, p_to: to });
        if (error) throw error;
        return (data || []) as LimitAlert[];
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
