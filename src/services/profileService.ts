import { supabase } from '../lib/supabaseClient';
import { namesFromUserMetadata, pickNameField, readRegistrationName } from '../utils/registrationName';

export interface Profile {
    id: string;
    auth_user_id: string;
    email: string | null;
    first_name: string | null;
    middle_name?: string | null;
    last_name: string | null;
    account_type: 'student' | 'coordinator' | 'admin' | 'company';
    required_ojt_hours: number;
    absences: number;
    company_id: string | null;
    company?: { name: string; latitude?: number | null; longitude?: number | null; geofence_radius?: number | null; geofence_polygon?: any | null } | null;
    department_info?: { name: string } | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
    // Onboarding fields
    birthday?: string | null;
    country?: string | null;
    region?: string | null;
    region_code?: string | null;
    province?: string | null;
    province_code?: string | null;
    city_municipality?: string | null;
    city_municipality_code?: string | null;
    barangay?: string | null;
    barangay_code?: string | null;
    house_street?: string | null;
    address?: string | null;
    contact_number?: string | null;
    year_level?: string | null;
    section?: string | null;
    course?: string | null;
    department?: string | null;
    grade?: string | null;
    // Signature
    coordinator_signature?: string | null;
    // Enterprise fields
    department_id?: string | null;
    permissions?: any;
    is_active?: boolean;
    failed_login_attempts?: number;
    locked_until?: string | null;
}

export const profileService = {
    async submitCompanyRequest(name: string, address?: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No user logged in");

        const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('auth_user_id', user.id)
            .single();

        const { error } = await supabase
            .from('company_requests')
            .insert({
                name,
                address,
                requested_by: user.id,
                student_name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim()
            });

        if (error) {
            console.error('Error submitting company request:', error);
            throw error;
        }

        return true;
    },

    async getCurrentProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('*, company:companies(name, latitude, longitude, geofence_radius, geofence_polygon)')
            .eq('auth_user_id', user.id)
            .single();

        if (error) {
            console.error("Error fetching current profile:", error);
            // Don't throw for missing profile, return null or a default fallback if desired
            return null;
        }

        return await this.attachApprovedCompanyIfNeeded(
            await this.applyRegistrationNames(data as Profile, user),
            user.id
        );
    },

    async attachApprovedCompanyIfNeeded(profile: Profile, userId: string): Promise<Profile> {
        if (profile.account_type !== 'student' || profile.company_id) return profile;

        const { data: request, error: requestError } = await supabase
            .from('company_requests')
            .select('name')
            .eq('requested_by', userId)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (requestError || !request?.name) return profile;

        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('id, name, latitude, longitude, geofence_radius, geofence_polygon')
            .ilike('name', request.name)
            .limit(1)
            .maybeSingle();

        if (companyError || !company?.id) return profile;

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ company_id: company.id })
            .eq('auth_user_id', userId);

        if (updateError) {
            console.warn('Unable to attach approved company to student profile:', updateError);
        }

        return {
            ...profile,
            company_id: company.id,
            company: {
                name: company.name,
                latitude: company.latitude,
                longitude: company.longitude,
                geofence_radius: company.geofence_radius,
                geofence_polygon: company.geofence_polygon,
            },
        };
    },

    async applyRegistrationNames(profile: Profile, user: { id: string; user_metadata?: Record<string, unknown> | null }) {
        const meta = namesFromUserMetadata(user.user_metadata);
        const stored = readRegistrationName(user.id);
        const first_name = pickNameField(profile.first_name, meta.first_name, stored?.first_name);
        const middle_name = pickNameField(profile.middle_name, meta.middle_name, stored?.middle_name) || null;
        const last_name = pickNameField(profile.last_name, meta.last_name, stored?.last_name);

        const needsHeal =
            (first_name && first_name !== (profile.first_name ?? '').trim())
            || (last_name && last_name !== (profile.last_name ?? '').trim())
            || ((middle_name ?? '') !== (profile.middle_name ?? '').trim());

        if (needsHeal && (first_name || last_name || middle_name)) {
            const { error } = await supabase
                .from('profiles')
                .update({
                    first_name: first_name || null,
                    middle_name: middle_name || null,
                    last_name: last_name || null,
                })
                .eq('auth_user_id', user.id);
            if (error) {
                console.warn('Unable to persist registration name onto profile:', error);
            }
        }

        return {
            ...profile,
            first_name: first_name || null,
            middle_name,
            last_name: last_name || null,
        } as Profile;
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
