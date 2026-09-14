/**
 * Point Supabase Auth's own emails — the signup verification code and the
 * password-reset link — at the Brevo SMTP relay, with branded templates.
 *
 * Those two emails are sent by Supabase Auth (GoTrue), not by any code in this
 * repo. They already use the Brevo relay, but from a From address on a domain
 * that has not authenticated Brevo (no Brevo DKIM, no brevo-code record), so
 * Gmail cannot verify the sender and files them in Spam or under its
 * "this message seems dangerous" banner.
 *
 * This change is INERT until the From domain is authenticated in Brevo (the
 * brevo-code, DKIM and DMARC records in AUTH_EMAIL_SETUP.md). The script checks
 * that through the Brevo API and refuses to switch otherwise.
 *
 * Secrets come from the environment at run time and are never written anywhere:
 *
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."        # Supabase personal access token
 *   $env:BREVO_SMTP_LOGIN="xxxx@smtp-brevo.com"  # Brevo -> SMTP & API -> SMTP
 *   $env:BREVO_SMTP_KEY="xsmtpsib-..."           # an SMTP key, not the API key
 *   $env:BREVO_API_KEY="xkeysib-..."             # read-only use: verifies the sender
 *   $env:AUTH_EMAIL_FROM="no-reply@your-authenticated-domain"
 *   node scripts/set-auth-email.mjs
 *
 * Flags:
 *   --dry-run          print the current hosted email settings and exit
 *   --templates-only   update subjects and templates, leave SMTP untouched
 *   --set-otp-expiry   also set the Email OTP expiration to 600 seconds
 *   --skip-brevo-check apply without confirming the domain in Brevo (not advised)
 *
 * The Email OTP expiration (mailer_otp_exp) must be 600 seconds: OTP_TTL_MINUTES
 * in src/utils/verificationCode.ts and the "expires in 10 minutes" line in both
 * templates depend on it, and GoTrue applies the same value to reset links. The
 * script refuses to run while it differs, and changes it only when
 * --set-otp-expiry is passed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envText = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
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
const templatesOnly = args.includes('--templates-only');
const setOtpExpiry = args.includes('--set-otp-expiry');
const skipBrevoCheck = args.includes('--skip-brevo-check');

const EXPECTED_OTP_EXP_SECONDS = 600;
const SENDER_NAME = process.env.AUTH_EMAIL_SENDER_NAME || 'Asian College SIL Monitoring System';

// A From address on a mailbox provider's own domain can never pass DMARC
// alignment when relayed through Brevo — that provider publishes the policy.
const FREE_MAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com',
    'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com',
]);

const projectRef = (env.VITE_SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!projectRef) {
    console.error('Could not read project ref from VITE_SUPABASE_URL in .env');
    process.exit(1);
}
if (!token) {
    console.error('Set SUPABASE_ACCESS_TOKEN to a personal access token, then rerun.');
    process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const authHeaders = { Authorization: `Bearer ${token}` };

async function readAuthConfig() {
    const res = await fetch(endpoint, { headers: authHeaders });
    const body = await res.text();
    if (!res.ok) {
        console.error(`Could not read current auth config (${res.status}): ${body}`);
        process.exit(1);
    }
    return JSON.parse(body);
}

function describe(config) {
    const template = (value) => (value ? `custom (${value.length} chars)` : 'default');
    return {
        smtp_host: config.smtp_host || '(none: Supabase built-in sender)',
        smtp_port: config.smtp_port,
        smtp_user: config.smtp_user,
        smtp_pass: config.smtp_pass ? '(set, redacted)' : '(empty)',
        smtp_admin_email: config.smtp_admin_email,
        smtp_sender_name: config.smtp_sender_name,
        smtp_max_frequency: config.smtp_max_frequency,
        rate_limit_email_sent: config.rate_limit_email_sent,
        mailer_otp_exp: config.mailer_otp_exp,
        site_url: config.site_url,
        uri_allow_list: config.uri_allow_list,
        mailer_subjects_magic_link: config.mailer_subjects_magic_link,
        mailer_templates_magic_link_content: template(config.mailer_templates_magic_link_content),
        mailer_subjects_recovery: config.mailer_subjects_recovery,
        mailer_templates_recovery_content: template(config.mailer_templates_recovery_content),
    };
}

const current = await readAuthConfig();
console.log('Current hosted auth email settings:');
console.log(describe(current));

const otpExpiryMatches = Number(current.mailer_otp_exp) === EXPECTED_OTP_EXP_SECONDS;
if (!otpExpiryMatches) {
    console.warn(`\nmailer_otp_exp is ${current.mailer_otp_exp} seconds; the app expects ${EXPECTED_OTP_EXP_SECONDS} (OTP_TTL_MINUTES = 10).`);
}

if (dryRun) {
    process.exit(0);
}

// Checked before anything is written, so a mismatch never leaves the project
// with templates that promise a 10-minute expiry the server does not enforce.
if (!otpExpiryMatches && !setOtpExpiry) {
    console.error('Rerun with --set-otp-expiry to set it to 600 seconds. Nothing was changed.');
    process.exit(1);
}

// Both flows the app uses: signInWithOtp mails an existing-or-new user through
// the Magic Link template, resetPasswordForEmail through the Recovery template.
// The signup template is code-only on purpose: a link would sign the visitor in
// and bypass the app's signup steps, and link scanners can consume it.
const update = {
    mailer_subjects_magic_link: 'Your Asian College SIL verification code: {{ .Token }}',
    mailer_templates_magic_link_content: readFileSync(resolve(process.cwd(), 'supabase/templates/auth-magic-link.html'), 'utf8'),
    mailer_subjects_recovery: 'Reset your Asian College SIL password',
    mailer_templates_recovery_content: readFileSync(resolve(process.cwd(), 'supabase/templates/auth-recovery.html'), 'utf8'),
};
if (setOtpExpiry) {
    update.mailer_otp_exp = EXPECTED_OTP_EXP_SECONDS;
}

if (!templatesOnly) {
    const smtpLogin = process.env.BREVO_SMTP_LOGIN;
    const smtpKey = process.env.BREVO_SMTP_KEY;
    const fromAddress = (process.env.AUTH_EMAIL_FROM || '').trim().toLowerCase();
    const fromDomain = fromAddress.split('@')[1] || '';

    if (!smtpLogin || !smtpKey || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromAddress)) {
        console.error('Set BREVO_SMTP_LOGIN, BREVO_SMTP_KEY and AUTH_EMAIL_FROM, or pass --templates-only.');
        process.exit(1);
    }
    if (FREE_MAIL_DOMAINS.has(fromDomain)) {
        console.error(`AUTH_EMAIL_FROM is on ${fromDomain}. Mail relayed through Brevo cannot pass DMARC for that domain; use an address on a domain you authenticate in Brevo.`);
        process.exit(1);
    }

    if (!skipBrevoCheck) {
        const brevoKey = process.env.BREVO_API_KEY;
        if (!brevoKey) {
            console.error('Set BREVO_API_KEY so the sender domain can be verified in Brevo (or pass --skip-brevo-check).');
            process.exit(1);
        }
        const brevoHeaders = { accept: 'application/json', 'api-key': brevoKey };

        const domainsRes = await fetch('https://api.brevo.com/v3/senders/domains', { headers: brevoHeaders });
        if (!domainsRes.ok) {
            console.error(`Brevo rejected the API key (${domainsRes.status}): ${await domainsRes.text()}`);
            process.exit(1);
        }
        const { domains = [] } = await domainsRes.json();
        const domain = domains.find(d => String(d.domain_name).toLowerCase() === fromDomain);
        if (!domain?.authenticated || !domain?.verified) {
            console.error(`${fromDomain} is not verified and authenticated in Brevo (found: ${JSON.stringify(domain ?? null)}).`);
            console.error('Publish the DNS records from AUTH_EMAIL_SETUP.md, click "Authenticate" in Brevo, then rerun.');
            process.exit(1);
        }

        const sendersRes = await fetch('https://api.brevo.com/v3/senders', { headers: brevoHeaders });
        const { senders = [] } = sendersRes.ok ? await sendersRes.json() : {};
        const sender = senders.find(s => String(s.email).toLowerCase() === fromAddress);
        if (!sender?.active) {
            console.error(`${fromAddress} is not an active sender in Brevo. Add it under Senders, Domains & Dedicated IPs, then rerun.`);
            process.exit(1);
        }
    }

    Object.assign(update, {
        smtp_host: 'smtp-relay.brevo.com',
        smtp_port: '587',
        smtp_user: smtpLogin,
        smtp_pass: smtpKey,
        smtp_admin_email: fromAddress,
        smtp_sender_name: SENDER_NAME,
    });
}

const res = await fetch(endpoint, {
    method: 'PATCH',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
});
if (!res.ok) {
    console.error(`Failed (${res.status}): ${await res.text()}`);
    process.exit(1);
}

const after = await readAuthConfig();
console.log('\nUpdated auth email settings for', projectRef);
console.log(describe(after));

if (Number(after.mailer_otp_exp) !== EXPECTED_OTP_EXP_SECONDS) {
    console.error(`\nWARNING: mailer_otp_exp is ${after.mailer_otp_exp}, not ${EXPECTED_OTP_EXP_SECONDS}. OTP_TTL_MINUTES in src/utils/verificationCode.ts no longer matches the server.`);
    process.exit(1);
}
