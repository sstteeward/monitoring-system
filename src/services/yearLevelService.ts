/**
 * Year Levels — the catalog of year levels the programme offers.
 *
 * Reads go straight to the `year_levels` table (RLS lets any authenticated user
 * read). Writes go only through the two admin RPCs, which are the sole path that
 * can change the catalog; the browser never sends a label — the server derives
 * it from the number.
 *
 * Choice-offering screens call `list(true)` and fall back to the hard-coded
 * constants in src/utils/sections.ts if the migration is not deployed yet, so
 * the year selects keep working. Matching and parsing never read this catalog.
 */
import { supabase } from '../lib/supabaseClient';

export interface YearLevel {
    id: string;
    year_number: number;
    label: string;
    is_active: boolean;
    created_at: string;
}

/** PGRST202 / 42883: the table or RPC is not in the schema cache yet. */
const isMissingObject = (error: { code?: string; message?: string } | null): boolean => {
    if (!error) return false;
    return error.code === 'PGRST202'
        || error.code === '42883'
        || error.code === '42P01' // undefined_table
        || /Could not find the (function|table)|does not exist/i.test(error.message || '');
};

const MIGRATION_HINT = 'Year levels are not available yet — run supabase_year_levels.sql.';

const asError = (error: { message?: string; hint?: string } | null, fallback: string): Error =>
    new Error(error?.message || error?.hint || fallback);

export const yearLevelService = {
    /**
     * All year levels, ordered by number. `activeOnly` filters to the levels a
     * new choice may offer. Throws a friendly "run the migration" error if the
     * table is missing so consumers can fall back to the constants.
     */
    async list(activeOnly = false): Promise<YearLevel[]> {
        let query = supabase
            .from('year_levels')
            .select('id, year_number, label, is_active, created_at')
            .order('year_number', { ascending: true });

        if (activeOnly) query = query.eq('is_active', true);

        const { data, error } = await query;

        if (error) {
            if (isMissingObject(error)) throw new Error(MIGRATION_HINT);
            console.error('Error loading year levels:', error);
            throw asError(error, 'Failed to load year levels.');
        }

        return (data || []) as YearLevel[];
    },

    /** Add a year level (1–9). Label and audit actor are set server-side. */
    async create(yearNumber: number): Promise<YearLevel> {
        const { data, error } = await supabase
            .rpc('admin_create_year_level', { p_year_number: yearNumber });

        if (error) {
            if (isMissingObject(error)) throw new Error(MIGRATION_HINT);
            console.error('Error creating year level:', error);
            throw asError(error, 'Failed to add the year level.');
        }

        return data as YearLevel;
    },

    /** Activate or deactivate a year level. */
    async setActive(id: string, active: boolean): Promise<YearLevel> {
        const { data, error } = await supabase
            .rpc('admin_set_year_level_active', { p_id: id, p_active: active });

        if (error) {
            if (isMissingObject(error)) throw new Error(MIGRATION_HINT);
            console.error('Error updating year level status:', error);
            throw asError(error, 'Failed to update the year level.');
        }

        return data as YearLevel;
    },
};
