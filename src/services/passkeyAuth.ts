import { supabase } from '../lib/supabaseClient';

type PasskeyAuth = typeof supabase.auth & {
    signInWithPasskey: (credentials?: unknown) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
    registerPasskey: (credentials?: unknown) => Promise<{ data: { id?: string } | null; error: { message?: string; code?: string } | null }>;
    passkey: {
        list: () => Promise<{ data: PasskeyRecord[] | null; error: { message?: string; code?: string } | null }>;
        delete: (args: { passkeyId: string }) => Promise<{ error: { message?: string; code?: string } | null }>;
    };
};

export type PasskeyRecord = {
    id: string;
    friendly_name?: string | null;
    created_at?: string;
    last_used_at?: string | null;
};

export function isPasskeySupported() {
    return typeof window !== 'undefined'
        && window.isSecureContext
        && typeof window.PublicKeyCredential !== 'undefined'
        && 'credentials' in navigator
        && typeof navigator.credentials?.get === 'function'
        && typeof navigator.credentials?.create === 'function';
}

/** Check if the device has a native platform authenticator (Windows Hello, Touch ID, Face ID, Android Biometric) */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (!isPasskeySupported()) return false;
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
    try {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

export function formatPasskeyError(err: unknown, fallback = 'Passkey authentication could not be completed.') {
    const e = err as { message?: string; code?: string; error_code?: string; name?: string } | null;
    const code = e?.code || e?.error_code || '';
    const message = e?.message || (err instanceof Error ? err.message : '');
    const name = e?.name || '';
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const onLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

    // 1. Native WebAuthn user cancellation or abort (don't display error message)
    if (
        name === 'NotAllowedError' ||
        name === 'AbortError' ||
        /abort|cancel|not allowed|user cancelled/i.test(message)
    ) {
        return '';
    }

    // 2. Passkey already registered
    if (name === 'InvalidStateError' || /already registered/i.test(message)) {
        return 'This device or security key is already registered as a passkey on your account.';
    }

    // 3. Not supported on device/browser
    if (name === 'NotSupportedError' || /not supported/i.test(message)) {
        return 'Your device or browser does not support this passkey operation.';
    }

    // 4. Supabase Auth specific error codes
    if (code === 'passkey_disabled' || /passkeys are disabled/i.test(message)) {
        return onLoopback
            ? 'Passkeys are not enabled yet. In Supabase Dashboard → Authentication → Passkeys, turn them on, set Relying Party ID to localhost, and add origin http://localhost:5173.'
            : 'Passkeys are not currently enabled on the system. Please use password login or contact an administrator.';
    }

    if (code === 'webauthn_credential_not_found' || /no credential|not found/i.test(message)) {
        return 'No passkey found for this account on this device. Sign in with your password, then register a passkey in Settings → Security.';
    }

    if (/origin|rp id|relying party|securityerror/i.test(message)) {
        return onLoopback
            ? 'This local origin is blocked by the project Relying Party ID. In Supabase Dashboard → Authentication → Passkeys set Relying Party ID to localhost and Origins to http://localhost:5173 and http://127.0.0.1:5173.'
            : 'This domain is not configured for passkeys. Please sign in with your password.';
    }

    if (code === 'email_not_confirmed') {
        return 'Please confirm your email address before using a passkey.';
    }

    return message || fallback;
}

function getPasskeyAuth(): PasskeyAuth {
    const auth = supabase.auth as PasskeyAuth;
    if (typeof auth.signInWithPasskey !== 'function' || typeof auth.registerPasskey !== 'function') {
        throw new Error('Passkey support is not available in this app build.');
    }
    return auth;
}

export async function signInWithPasskey() {
    const { data, error } = await getPasskeyAuth().signInWithPasskey();
    if (error) throw error;
    return data;
}

export async function registerCurrentUserPasskey() {
    const { data, error } = await getPasskeyAuth().registerPasskey();
    if (error) throw error;
    return data;
}

export async function listCurrentUserPasskeys() {
    const { data, error } = await getPasskeyAuth().passkey.list();
    if (error) throw error;
    return data ?? [];
}

export async function deleteCurrentUserPasskey(passkeyId: string) {
    const { error } = await getPasskeyAuth().passkey.delete({ passkeyId });
    if (error) throw error;
}
