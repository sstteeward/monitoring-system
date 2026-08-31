/**
 * Enable hosted Supabase passkeys via the Management API.
 *
 * Requires a personal access token from https://supabase.com/dashboard/account/tokens
 *
 * Local development (this is what localhost:5173 needs):
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   node scripts/enable-hosted-passkeys.mjs local
 *
 * Production site:
 *   node scripts/enable-hosted-passkeys.mjs prod
 *
 * A project can have only one Relying Party ID. Localhost and the Vercel
 * domain cannot be active at the same time. Use `local` while developing,
 * then `prod` before testing passkeys on the live site.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
const envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
    envText.split(/\r?\n/)
        .filter(line => line && !line.startsWith('#') && line.includes('='))
        .map(line => {
            const idx = line.indexOf('=');
            return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
);

const mode = (process.argv[2] || 'local').toLowerCase();
const configs = {
    local: {
        rpId: 'localhost',
        rpOrigins: 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173',
    },
    prod: {
        rpId: 'asiancollegesilmonitoringsystem.vercel.app',
        rpOrigins: 'https://asiancollegesilmonitoringsystem.vercel.app',
    },
};

const selected = configs[mode];
if (!selected) {
    console.error('Usage: node scripts/enable-hosted-passkeys.mjs [local|prod]');
    process.exit(1);
}

const supabaseUrl = env.VITE_SUPABASE_URL || '';
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!projectRef) {
    console.error('Could not read project ref from VITE_SUPABASE_URL in .env');
    process.exit(1);
}
if (!token) {
    console.error('Set SUPABASE_ACCESS_TOKEN to a personal access token, then rerun.');
    process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
    method: 'PATCH',
    headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        passkey_enabled: true,
        webauthn_rp_display_name: 'Asian College SIL Monitoring System',
        webauthn_rp_id: selected.rpId,
        webauthn_rp_origins: selected.rpOrigins,
    }),
});

const body = await res.text();
if (!res.ok) {
    console.error(`Failed (${res.status}): ${body}`);
    process.exit(1);
}

console.log('Passkeys enabled for', projectRef, `(${mode})`);
console.log('RP ID:', selected.rpId);
console.log('Origins:', selected.rpOrigins);
