import { supabase } from '../lib/supabaseClient';

export interface Profile {
    id: string;
    auth_user_id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    account_type: 'student' | 'coordinator' | 'admin';
    required_ojt_hours: number;
    absences: number;
    company_id: string | null;
    company?: { name: string; latitude?: number | null; longitude?: number | null; geofence_radius?: number | null } | null;
    department_info?: { name: string } | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
    // Onboarding fields
    birthday?: string | null;
    address?: string | null;
    contact_number?: string | null;
    year_level?: string | null;
    section?: string | null;
    course?: string | null;
    department?: string | null;
    // Enterprise fields
    department_id?: string | null;
    permissions?: any;
    is_active?: boolean;
    failed_login_attempts?: number;
    locked_until?: string | null;
}

export const profileService = {
    async getCurrentProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('*, company:companies(name, latitude, longitude, geofence_radius)')
            .eq('auth_user_id', user.id)
            .single();

        if (error) {
            console.error("Error fetching current profile:", error);
            // Don't throw for missing profile, return null or a default fallback if desired
            return null;
        }

        return data as Profile;
    },

    async updateProfile(updates: Partial<Profile>) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user logged in");

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('auth_user_id', user.id);

        if (error) {
            console.error("Error updating profile:", error);
            throw error;
        }

        return true;
    },

    async getProfileById(id: string): Promise<Profile | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, company:companies(name, address)')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching profile by id:', error);
            return null;
        }
        return data as Profile;
    },

    async uploadAvatar(file: File): Promise<string> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user logged in");

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}-${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading avatar:', uploadError);
            throw uploadError;
        }

        const { data } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return data.publicUrl;
    }
};
