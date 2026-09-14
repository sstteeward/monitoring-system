# Auth Email Setup (signup code and password reset)

The signup verification code and the password-reset link are sent by **Supabase Auth itself**, not by code in this repo. Supabase Auth already relays them through Brevo, but under a From address whose domain has not authenticated Brevo. Gmail therefore cannot verify who sent them, which is why they land in Spam or show "This message seems dangerous". Reset emails are worse because their link points at a free-hosting domain.

The fix is a single authenticated sender: Supabase Auth → Brevo SMTP relay → a From address on a domain authenticated in Brevo, plus reset links on the real site.

> **The sender change is inert until the DNS records in step 3 exist.** `scripts/set-auth-email.mjs` checks this through the Brevo API and refuses to switch before the domain is authenticated.

## Current configuration (read 2026-09-14)

| Setting | Value | Effect |
| --- | --- | --- |
| SMTP host / login | `smtp-relay.brevo.com:587`, `a586e5001@smtp-brevo.com` | Correct relay |
| From (`smtp_admin_email`) | `sshumiwat.student@asiancollege.edu.ph` | A personal student mailbox on a domain with no Brevo DKIM or `brevo-code` record, so DMARC alignment fails. **Main cause.** |
| Site URL | `https://silmonitoringsystem.infinityfree.me/` | Reset links fall back to a free-hosting domain, a strong phishing signal |
| Redirect allow list | `https://asiancollegesilmonitoringsystem.vercel.app/,silmonitoringsystem.infinityfree.me` | No `/**` wildcard, so `…vercel.app/change-password` never matches and resets use the Site URL |
| Email OTP expiration | `3600` s | The app and templates assume 600 s (`OTP_TTL_MINUTES = 10`) |
| Brevo plan | Free, 300 emails per day | Shared with in-app notification emails |

## 1. Fix the Brevo account

1. **Create a new API key** (SMTP & API → API keys). The key currently stored in Supabase is rejected by Brevo with `401 Key not found`; no in-app notification email has ever been delivered. Replace it, and point the sender at an active Brevo sender:

   ```powershell
   supabase secrets set BREVO_API_KEY=<new-api-key> BREVO_SENDER_EMAIL=<active-brevo-sender>
   ```

2. **Create an SMTP key** (SMTP & API → SMTP → Generate a new SMTP key). This is a different credential from the API key. Never paste keys into chat, tickets or files; if one is exposed, delete it in Brevo and generate a new one.
3. **Turn off IP blocking.** Brevo blocks SMTP and API calls from unlisted IP addresses. Supabase Auth and Edge Functions do not send from fixed IPs, so under **Security → Authorised IPs**, deactivate blocking.
4. **Turn off click and open tracking for transactional email** if your plan exposes the setting. Click tracking rewrites links to a Brevo domain, which triggers Gmail's link warnings, and security scanners that follow the rewritten link can use up the one-time reset token.

## 2. Choose the sending domain

The From address must be on a domain whose DNS you can change:

| Candidate | Usable? |
| --- | --- |
| `*.vercel.app`, `*.infinityfree.me` | No, you cannot add DNS records |
| `gmail.com` or any personal mailbox | No, DMARC can never align through Brevo (the script refuses these) |
| `asiancollege.edu.ph` or a subdomain such as `sil.asiancollege.edu.ph` | Yes, if college IT adds the records (DNS is on Cloudflare) |
| A domain the team owns | Yes |

Use a role address such as `no-reply@sil.asiancollege.edu.ph`, not a personal student mailbox that stops working when its owner leaves. A subdomain also keeps this system's sending reputation separate from staff mail.

Current `asiancollege.edu.ph` records (read 2026-09-14): SPF `include:_spf.google.com include:mailgun.org ~all`, DKIM for Google and Mailgun only, DMARC `p=none`. Nothing authenticates Brevo yet.

## 3. Authenticate the domain in Brevo (whoever controls DNS)

In **Brevo → Senders, Domains & Dedicated IPs → Domains → Add a domain**, enter the domain and choose manual DNS setup. Brevo shows the exact values. Copy them rather than retyping:

| Type | Host | Value |
| --- | --- | --- |
| TXT | `@` (the domain) | `brevo-code:<value shown by Brevo>` |
| CNAME | `brevo1._domainkey` | `<value shown by Brevo>` |
| CNAME | `brevo2._domainkey` | `<value shown by Brevo>` |
| TXT | `_dmarc` | Keep the existing record for the apex. For a new subdomain: `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com` |
| TXT (SPF) | `@` | Only if Brevo lists it: add `include:spf.brevo.com` to the existing SPF record. Never publish a second SPF record |

On Cloudflare, set the DKIM CNAME records to **DNS only** (grey cloud); proxied records break DKIM lookups.

Wait for propagation (up to 48 hours), click **Authenticate this domain** in Brevo, then add the sender `no-reply@<domain>` under **Senders** and confirm it. Once reports show aligned passes for a few weeks, raise DMARC to `p=quarantine`.

## 4. Fix the reset-link domain (no DNS needed)

Make the real site the Site URL and allow its paths, so reset links point at it:

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
node scripts/set-auth-urls.mjs https://asiancollegesilmonitoringsystem.vercel.app
```

This sets the Site URL to the Vercel site and the allow list to `https://asiancollegesilmonitoringsystem.vercel.app/**` plus the local dev origins, which removes `silmonitoringsystem.infinityfree.me` from both. The InfinityFree copy of the site is retired: also take it offline in the InfinityFree control panel, because while it stays up it still signs users in against the same Supabase project.

## 5. Point Supabase Auth at Brevo

Run from the repo root. Secrets stay in the shell session; nothing is written to disk.

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
node scripts/set-auth-email.mjs --dry-run
```

Save that output first: it is the current configuration (SMTP password redacted) and your rollback reference.

Before the domain is authenticated, you can already apply the branded subjects and templates and correct the OTP expiration. This improves the message but does **not** fix Spam placement on its own:

```powershell
node scripts/set-auth-email.mjs --templates-only --set-otp-expiry
```

Once step 3 is done, apply the sender:

```powershell
$env:BREVO_SMTP_LOGIN="<login>@smtp-brevo.com"
$env:BREVO_SMTP_KEY="<smtp-key>"
$env:BREVO_API_KEY="<api-key>"
$env:AUTH_EMAIL_FROM="no-reply@<authenticated-domain>"
node scripts/set-auth-email.mjs
```

The script:

- refuses a personal-mailbox From domain, a domain Brevo has not authenticated and verified, or a sender that is not active;
- sets `smtp-relay.brevo.com:587`, the SMTP login and key, the From address and the sender name "Asian College SIL Monitoring System";
- sets the **Magic Link** subject and template (every signup code is sent through this template) and the **Recovery** subject and template from `supabase/templates/`;
- refuses to run while the Email OTP expiration is not 600 seconds, and sets it to 600 only when `--set-otp-expiry` is passed. `OTP_TTL_MINUTES` in `src/utils/verificationCode.ts` and the "expires in 10 minutes" line in both templates depend on it.

Setting the expiration to 600 seconds also shortens reset links to 10 minutes, and codes already sent more than 10 minutes earlier stop working.

**Rollback:** Supabase Dashboard → Authentication → Emails → SMTP Settings (and Providers → Email for the OTP expiration), re-entering the values from the saved dry-run output.

## 6. Check the send rate

Supabase allows `rate_limit_email_sent` auth emails per hour (currently 100) and one email per address per `smtp_max_frequency` seconds (currently 60, matching the app's 60-second resend cooldown). Brevo's free plan allows 300 emails per day across auth and notification mail; when it runs out, mail silently stops arriving.

## Test

1. In a fresh Gmail, Outlook, Yahoo and `.edu.ph` mailbox, request a signup code and a password reset.
2. Confirm both land in the Inbox with no warning banner, and the reset link leads to the Vercel site.
3. Open **Show original** and confirm `spf=pass`, `dkim=pass` and `dmarc=pass`, with DKIM `d=` equal to the From domain.
4. Send one message to mail-tester.com and fix every deduction it lists.
5. Complete a signup within 10 minutes, then sign in with the password.
6. Complete a reset through `/change-password` and confirm you land on the correct portal login.

A mailbox that previously marked these emails as spam may keep filing them there. That is the recipient's learned preference, not a sender failure; "Report not spam" once clears it.

## Known limits of this setup

- **No plain-text part and no Reply-To.** Supabase Auth's SMTP mailer sends HTML only and sets just From, To and Subject. Adding either would need a Supabase `send_email` Auth Hook Edge Function that calls Brevo directly. That is a larger change with its own failure mode (a broken hook stops every signup and reset), so it is not part of this setup.
- **Reset links can be consumed by link scanners.** Some corporate or school gateways open links before the recipient does, which makes the link report "expired". The signup flow is immune because the code is typed by hand. If `.edu.ph` users hit this, request a new link, or move the reset flow to a typed code later.
- `src/services/emailService.ts` (EmailJS) has no callers and no configured keys. It is dead code and should be removed separately.
