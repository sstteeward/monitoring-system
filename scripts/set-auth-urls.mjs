/**
 * Set the hosted Supabase Auth Site URL and redirect allow list via the
 * Management API.
 *
 * Supabase builds `{{ .ConfirmationURL }}` in the password-recovery email from
 * the `redirectTo` the client passes (src/services/auth.ts), but only when that
 * URL matches the project's redirect allow list. When it does not match, Supabase
 * silently falls back to the project Site URL — which is how reset emails end up
 * pointing at an old domain even though nothing in this repo references one.
 *
 * Requires a personal access token from https://supabase.com/dashboard/account/tokens
 *
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   node scripts/set-auth-urls.mjs https://your-app.vercel.app
 *
 * Pass --dry-run to print the current config without changing anything.
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

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const siteUrl = (args.find(a => !a.startsWith('--')) || '').trim().replace(/\/$/, '');

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
if (!dryRun && !/^https:\/\/[^/\s]+$/.test(siteUrl)) {
    console.error('Usage: node scripts/set-auth-urls.mjs https://your-app.vercel.app [--dry-run]');
    process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const authHeaders = { Authorization: `Bearer ${token}` };

const currentRes = await fetch(endpoint, { headers: authHeaders });
const currentBody = await currentRes.text();
if (!currentRes.ok) {
    console.error(`Could not read current auth config (${currentRes.status}): ${currentBody}`);
    process.exit(1);
}
const current = JSON.parse(currentBody);
console.log('Current site_url:     ', current.site_url);
console.log('Current uri_allow_list:', current.uri_allow_list);

if (dryRun) {
    process.exit(0);
}

// Keep the local dev origins so the reset flow still works from `npm run dev`.
const uriAllowList = [
    `${siteUrl}/**`,
    'http://localhost:5173/**',
    'http://127.0.0.1:5173/**',
    'http://localhost:4173/**',
    'http://127.0.0.1:4173/**',
].join(',');

const res = await fetch(endpoint, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_url: siteUrl, uri_allow_list: uriAllowList }),
});

const body = await res.text();
if (!res.ok) {
    console.error(`Failed (${res.status}): ${body}`);
    process.exit(1);
}

console.log('\nUpdated auth URLs for', projectRef);
console.log('Site URL:  ', siteUrl);
console.log('Allow list:', uriAllowList);
console.log('\nPassword reset links will now be issued against', siteUrl);
