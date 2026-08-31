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
        && 'PublicKeyCredential' in window
        && 'credentials' in navigator;
}

export function formatPasskeyError(err: unknown, fallback = 'Passkey could not be completed.') {
    const e = err as { message?: string; code?: string; error_code?: string; name?: string } | null;
    const code = e?.code || e?.error_code || '';
    const message = e?.message || (err instanceof Error ? err.message : '');
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const onLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

    if (code === 'passkey_disabled' || /passkeys are disabled/i.test(message)) {
        return onLoopback
            ? 'Passkeys are not enabled yet. In Supabase Dashboard → Authentication → Passkeys, turn them on, set Relying Party ID to localhost, and add origin http://localhost:5173.'
            : 'Passkeys are not enabled yet. In Supabase Dashboard → Authentication → Passkeys, turn them on and set Relying Party ID to asiancollegesilmonitoringsystem.vercel.app.';
    }
    if (code === 'webauthn_credential_not_found') {
        return 'No passkey is registered for this account yet. Sign in with your password, then add a passkey from Settings → Security.';
    }
    if (/origin|rp id|relying party|securityerror/i.test(message)) {
        return onLoopback
            ? 'This local origin is blocked because the project Relying Party ID is still the production domain. In Supabase Dashboard → Authentication → Passkeys set Relying Party ID to localhost and Origins to http://localhost:5173 and http://127.0.0.1:5173. Switch those back to the Vercel domain before using passkeys on the live site.'
            : 'This page origin is not allowed for passkeys. Add it under Supabase Dashboard → Authentication → Passkeys → Origins.';
    }
    if (code === 'email_not_confirmed') {
        return 'Confirm your email before using a passkey.';
    }
    if (/abort|cancel|not allowed/i.test(message) || e?.name === 'NotAllowedError') {
        return '';
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
