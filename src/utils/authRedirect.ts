/**
 * Single source of truth for "where does this account go after authenticating?".
 *
 * Every auth entry point (signup + OTP verification, password login, passkey login)
 * must route through here so no role can silently fall through to another portal.
 */

export type AccountType = 'student' | 'coordinator' | 'adviser' | 'company' | 'admin';

const ACCOUNT_TYPES: AccountType[] = ['student', 'coordinator', 'adviser', 'company', 'admin'];

/** Portal home for each role. Onboarding is rendered by the role dashboard itself. */
const PORTAL_HOME: Record<AccountType, string> = {
    student: '/student',
    coordinator: '/coordinator',
    adviser: '/adviser',
    company: '/company',
    admin: '/admin',
};

/**
 * Accepts anything (URL portal param, DB column, auth metadata) and returns a
 * canonical account type, or null when the value is not a known role.
 * Guards against casing/whitespace drift between the DB, backend and frontend.
 */
export function normalizeAccountType(value: unknown): AccountType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return (ACCOUNT_TYPES as string[]).includes(normalized) ? (normalized as AccountType) : null;
}

/**
 * Post-authentication destination for a role.
 * Unknown/missing roles go back to login — never to a portal, so a bad role value
 * can no longer land the user in someone else's portal.
 */
export function getPostAuthRedirect(accountType: unknown): string {
    const role = normalizeAccountType(accountType);
    return role ? PORTAL_HOME[role] : '/login';
}

/**
 * The login page belonging to a role. There is one login component (`AuthSignup`,
 * mounted at `/login`); the portal it presents comes from `?portal=<role>`, which is
 * also what the landing page's portal cards link to. Nothing new is invented here.
 *
 * The caller must derive `accountType` from the account itself (the recovery session
 * and the `profiles` row), never from the URL — otherwise `?role=admin` on the
 * change-password link would steer the redirect.
 *
 * Unknown/missing roles fall back to `/`, the portal-selection landing page, so a
 * student can never be dropped on the Admin/Adviser/Coordinator/Company login.
 */
export function getLoginRouteForAccountType(accountType: unknown): string {
    const role = normalizeAccountType(accountType);
    return role ? `/login?portal=${role}` : '/';
}

/**
 * Mirrors the per-role onboarding gates used by the dashboards
 * (StudentDashboard, AdviserDashboard, CompanyDashboard).
 * There is no `onboarding_completed` column; completion is derived from the
 * profile fields each onboarding flow fills in.
 */
export function isOnboardingComplete(profile: Record<string, unknown> | null | undefined): boolean {
    const role = normalizeAccountType(profile?.account_type);
    if (!profile || !role) return false;

    switch (role) {
        case 'student':
            return Boolean(profile.company_id && profile.course && profile.department && profile.year_level);
        case 'adviser':
            return Boolean(
                profile.adviser_type &&
                profile.contact_number &&
                profile.birthday &&
                (profile.region_code || profile.address)
            );
        case 'company':
            return Boolean(profile.company_id);
        case 'coordinator':
            return Boolean(
                profile.department &&
                profile.contact_number &&
                profile.birthday &&
                (profile.region_code || profile.address)
            );
        case 'admin':
            // No onboarding step for this role.
            return true;
    }
}

/** Debug aid for the redirect decision point (see bug: everyone landed on the Company Portal). */
export function logRedirectDecision(
    context: string,
    profile: Record<string, unknown> | null | undefined,
    destination: string
) {
    console.info('[auth-redirect]', context, {
        account_type: profile?.account_type ?? null,
        normalized_role: normalizeAccountType(profile?.account_type),
        onboarding_complete: isOnboardingComplete(profile),
        destination,
    });
}
