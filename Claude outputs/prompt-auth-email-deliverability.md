# CODING-AGENT PROMPT — Fix: signup verification codes and password-reset emails land in Spam / show Gmail "Looks safe?" and "Mark not spam" banners

> Repository: `C:\Users\stewa\monitoring-system` (Asian College SIL Monitoring System)
> Linked Supabase project ref: `ncwesnnihbyghasbnemd` **[CONFIRMED — `supabase/.temp/project-ref`, `.env`]**
>
> This is a **diagnose-then-fix** task. **Most of the root cause is NOT in the source tree** — it is in hosted Supabase Auth configuration and in DNS. Do not begin editing code until Section 15 (Phase 0) has produced evidence.
>
> **Deliverability is a property of the sending identity, not of the application.** No amount of HTML tweaking fixes an unauthenticated sender. Work the causes in the order given.

---

## 1. CONTEXT

Users report that the emails carrying the **6-digit signup verification code** and the **password-reset link** arrive in the Spam folder, or arrive in the inbox with a Gmail warning banner — "Looks safe?" / "Mark as not spam" / "This message seems dangerous". The problem is reported as worst on the **forgot-password** flow.

### 1.1 Terminology correction — verify this before designing anything **[CONFIRMED]**

The user calls this "2FA". **The codebase contains no post-login two-factor / MFA feature.** What actually exists, and what these emails actually are:

| What the user calls it | What the code actually does | Where |
|---|---|---|
| "2FA code in the email" | A **signup-time email OTP**: `supabase.auth.signInWithOtp({ shouldCreateUser: true })` — the code that both creates the account and proves the address | `src/components/AuthSignup.tsx:237` |
| "forgetting a password" | A **password-recovery magic link**: `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/change-password' })` | `src/services/auth.ts:524-553`, called from `AuthSignup.tsx:601` |

There is also passkey/WebAuthn sign-in (`src/services/passkeyAuth.ts`, `[auth.passkey] enabled = true` in `supabase/config.toml:42-43`), which sends no email. **Do not build an MFA feature.** Fix the deliverability of the two email flows above.

**Both of those emails are generated and sent by Supabase Auth (GoTrue) itself — not by any code in this repository.** That is the whole reason this defect exists. See Section 2.

---

## 2. CURRENT IMPLEMENTATION (verified against the codebase)

### 2.1 The system has **three separate email senders** **[CONFIRMED]**

| # | Path | Sender / transport | What it sends | Configured where |
|---|---|---|---|---|
| **A** | **Supabase Auth (GoTrue)** | **Not configured anywhere in this repo** | **Signup OTP code, password-reset link, any email-change confirmation** | Hosted dashboard only — `supabase/config.toml` has **no `[auth.email]`, no `[auth.email.smtp]`, no `[auth.email.template.*]`** section |
| B | Edge Function `notification-email` | **Brevo REST API** (`https://api.brevo.com/v3/smtp/email`), `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` | In-app notifications, subject prefixed `[Asian College SIL]` | `supabase/functions/notification-email/index.ts:166-170, 299-323`; `supabase/config.toml:21-26` |
| C | `src/services/emailService.ts` | **EmailJS REST API** from the **browser**, `VITE_EMAILJS_*` | Company request approved/rejected, company account verified/rejected | `.env` / `.env.example`; falls back to `console.log` simulation when unset (`emailService.ts:130`) |

**This is the central finding.** Path B already has a properly authenticated transactional provider (Brevo) wired up and working. Path A — the exact flow the user is complaining about — **does not use it**. Nothing in `supabase/functions/` is a `send_email` auth hook; the four functions present are `google-calendar`, `notification-email`, `set-signup-password`, `web-push-notification`.

Therefore path A is sending through whatever is set in the hosted project's **Authentication → Emails → SMTP Settings**. If that has never been set, it is Supabase's **built-in email service**, which:

- sends from a **Supabase-owned shared domain**, not from any Asian College domain, so **SPF/DKIM/DMARC cannot align with the brand the email claims to be from**;
- shares sending IP reputation with every other project on the platform;
- is documented by Supabase as **for development/testing only**, with a very low rate limit (on the order of a few messages per hour).

An unauthenticated, shared-reputation sender writing "Asian College" in the body and linking to a Vercel domain is precisely the shape Gmail flags. **[INFERRED — strongly supported by the absence of any SMTP config in the repo, but the live dashboard value must be read in Phase 0 before you act on it.]**

### 2.2 The repo already has the mechanism to configure hosted auth settings **[CONFIRMED]**

`scripts/set-auth-urls.mjs` reads `VITE_SUPABASE_URL` from `.env`, derives the project ref, and `PATCH`es `https://api.supabase.com/v1/projects/{ref}/config/auth` with a `SUPABASE_ACCESS_TOKEN`. Its header comment documents exactly this class of bug:

> "Supabase builds `{{ .ConfirmationURL }}` in the password-recovery email from the `redirectTo` the client passes … but only when that URL matches the project's redirect allow list. When it does not match, Supabase silently falls back to the project Site URL — which is how reset emails end up pointing at an old domain."

**The same Management API endpoint carries the SMTP and email-template fields.** This is the established in-repo pattern for this kind of change — follow it rather than inventing a new one.

### 2.3 The OTP lifetime is pinned to a hosted setting **[CONFIRMED]**

`src/utils/verificationCode.ts:21` — `OTP_TTL_MINUTES = 10`, with the comment "Must match the Supabase project's Authentication → Email OTP expiration setting (600 seconds)." The expiry classification (`classifyRejectedCode`, `rejectedCodeMessage`) compares two **server** timestamps from `server_now_ms()`. **Any hosted auth change you make must leave the 600-second OTP expiry alone**, or this constant and all its tests go wrong.

### 2.4 What the Brevo path already does right — reuse it as the reference **[CONFIRMED]**

`supabase/functions/notification-email/index.ts` is the house standard for an outbound email:

- table-based responsive HTML, max-width 560px, system font stack (l. 122-161);
- brand header (`#047857` green, "Asian College" / "SIL Monitoring System");
- **every interpolated value HTML-escaped** via `escapeHtml` (l. 51-58);
- **action URLs validated** — only an app-relative path is accepted, anything else falls back to the portal root, so a row can never redirect a recipient off-site (`buildPortalUrl`, l. 92-100);
- explicit sender object `{ email: senderEmail, name: senderName }`;
- a footer explaining **why** the recipient is getting the message and where to change it.

Any new email template must match this. Note what it currently **lacks** and what you should add for auth mail: a **plain-text alternative**, a **Reply-To**, and a `List-Unsubscribe` header where appropriate.

### 2.5 Incidental finding — report, do not fix in this task

`supabase/config.toml:2-8` declares `[functions.corbado-auth]` with `entrypoint = "./functions/corbado-auth/index.ts"`, but **no `corbado-auth` directory exists** under `supabase/functions/`. Stale config. Out of scope.

---

## 3. EXISTING FILES (responsibilities)

| Path | Responsibility |
|---|---|
| `src/components/AuthSignup.tsx` | Signup (email OTP), login, forgot-password form, passkey login. `handleSendVerification` l. 218-292 (OTP send + 60s resend cooldown at l. 273); `handleForgotPassword` l. 586-609 |
| `src/services/auth.ts` | `resetPasswordForEmail` (l. 524-553) — the only caller of Supabase password recovery; sets `redirectTo: ${window.location.origin}/change-password`; audit-logs both success and failure as `PASSWORD_RESET` / module `Authentication` |
| `src/utils/verificationCode.ts` | OTP TTL constant + user-facing OTP copy + expired-vs-invalid classification |
| `src/utils/email.ts` | `normalizeEmail`, `isDuplicateEmailError`, `EMAIL_ALREADY_REGISTERED_MESSAGE` |
| `src/components/UpdatePasswordView.tsx` | The `/change-password` landing page for the recovery link; resolves the account type from the recovery session (never from the URL) and routes to the right portal login |
| `src/utils/authRedirect.ts` | `getPostAuthRedirect`, `getLoginRouteForAccountType`, `normalizeAccountType` |
| `supabase/functions/notification-email/index.ts` | **Reference implementation** for Brevo sending, HTML template, escaping, URL safety, idempotent send-claim |
| `supabase/config.toml` | Edge Function declarations, `[auth.passkey]`, `[auth.webauthn]`. **No email/SMTP configuration at all** |
| `scripts/set-auth-urls.mjs` | **Pattern to follow**: Management API `PATCH /v1/projects/{ref}/config/auth` for hosted auth settings |
| `src/services/emailService.ts` | Legacy browser-side EmailJS sender (path C) — a third sender identity for the same brand |
| `.env` / `.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WEB_PUSH_PUBLIC_KEY`, `VITE_EMAILJS_*`. **No Brevo values** — those are Edge Function secrets, set in the dashboard, and must stay server-side |
| `vercel.json` | SPA rewrites; `/api/*` passthrough. The deployed origin is what ends up in reset links |

---

## 4. RANKED HYPOTHESES — investigate in this order

**H1 — Auth emails are going through Supabase's built-in email service, or through an SMTP sender whose domain is not DNS-authenticated.** *(most likely; explains both the Spam placement and the Gmail banner)*
- **H1a** No custom SMTP configured at all → Supabase shared sender, no alignment with the college/app domain.
- **H1b** Custom SMTP is configured, but the sending domain has **no SPF record**, **no DKIM selector published**, or **no DMARC record** — so Gmail cannot authenticate it. Since Gmail's Feb-2024 sender rules, an unauthenticated sender to Gmail addresses is heavily penalised and frequently banner-flagged. *(external platform fact, not a codebase fact)*
- **H1c** SMTP is configured but `smtp_admin_email` (the From address) is on a **different domain** than the one DKIM-signs the message → DMARC alignment fails even though DKIM "passes".
- **H1d** The Brevo account/domain used by `notification-email` is itself unverified in Brevo (no DKIM/Brevo-code DNS records), in which case path B has the same latent problem and just has not been complained about yet. **Check both.**

**H2 — Sender-identity fragmentation.** Three different From identities (Supabase default, `BREVO_SENDER_EMAIL`, the EmailJS account) all claim to be "Asian College SIL Monitoring System". Reputation is per-domain and per-IP; splitting a low volume across three unrelated identities means none of them builds any. **[CONFIRMED that three senders exist; the reputational effect is inference.]**

**H3 — Message content and headers of the default GoTrue templates.**
Supabase's stock templates are a bare `<h2>` plus a raw link, with **no plain-text part**, no branding, no physical sender identity, no Reply-To, and generic subjects ("Confirm Your Signup", "Reset Your Password"). HTML-only transactional mail with a single naked link and a mismatched display/href is a classic spam signal. This is *contributory*, never the sole cause — fixing templates while H1 is unresolved will not move the message out of Spam.

**H4 — Link-domain vs sender-domain mismatch, and stale Site URL.**
`scripts/set-auth-urls.mjs` exists precisely because reset links had pointed at the wrong domain. If `redirectTo` (`${window.location.origin}/change-password`) is not in `uri_allow_list`, Supabase silently substitutes the project Site URL. A reset email whose button points at a domain unrelated to the sender is exactly what "Looks safe?" is warning about. Re-verify the current `site_url` and `uri_allow_list` (the script's `--dry-run` mode prints them without changing anything).

**H5 — Volume and rate-limit shape.** The built-in service's few-per-hour cap means a class of students registering together produces a burst of failures and retries — and repeated identical messages to the same domain in a short window is itself a spam signal. Also note `AuthSignup.tsx:273` sets a **60-second client-side resend cooldown only**; the server-side `smtp_max_frequency` / OTP rate limits are a separate hosted setting to read in Phase 0.

**H6 — Recipient-side.** `.edu.ph` addresses are required for students, advisers and coordinators (`isEduPh` gate, `AuthSignup.tsx:210-212, 219-222, 594-596`). If the college's Google Workspace or mail gateway has its own inbound filtering or a quarantine policy, the fix may partly live there. Confirm whether reports come from `.edu.ph` mailboxes, personal Gmail, or both — the answer changes the remedy.

Do **not** assume a hypothesis. Confirm with evidence, then fix that.

---

## 5. DATA FLOW

```
SIGNUP CODE  (the "2FA" email)
  AuthSignup.handleSendVerification            (AuthSignup.tsx:218)
    → rpc is_email_registered                  (pre-check, all portals)
    → supabase.auth.signInWithOtp({shouldCreateUser:true, options.data})   (l. 237)
        → GoTrue: create auth.users row, mint one_time_token
        → GoTrue MAILER  ◀── ***THE EMAIL IN QUESTION. NOT IN THIS REPO.***
             transport = hosted Auth → Emails → SMTP Settings  (or built-in default)
             body      = hosted Auth → Emails → Templates → "Magic Link"/"Confirm signup"
    → rpc server_now_ms                        (issue time, for expiry classification)

PASSWORD RESET  (the "forgot password" email)
  AuthSignup.handleForgotPassword              (AuthSignup.tsx:586)
    → services/auth.resetPasswordForEmail      (auth.ts:524)
        → supabase.auth.resetPasswordForEmail(email, {redirectTo: origin + '/change-password'})
            → GoTrue MAILER  ◀── ***SAME SENDER, SAME PROBLEM***
                 link target validated against project uri_allow_list,
                 else silently replaced by site_url      (see scripts/set-auth-urls.mjs)
    → createAuditLog PASSWORD_RESET / Authentication
  user clicks → /change-password → UpdatePasswordView → supabase.auth.updateUser({password})

IN-APP NOTIFICATION  (works; the model to copy)
  INSERT public.user_notifications
    → DB webhook → Edge Fn notification-email
        → re-read row w/ service role, check notification_email_enabled preference,
          atomically claim email_sent false→true,
          POST api.brevo.com/v3/smtp/email  ◀── AUTHENTICATED PROVIDER
        → failure releases the claim and records email_error
```

---

## 6. DATABASE CONTEXT

Relevant to this task only as read-only context — **no schema change should be needed.**

- `auth.users` — created by `signInWithOtp`; `email`, `email_confirmed_at`.
- `auth.one_time_tokens` — GoTrue's store for the OTP hash; `UNIQUE (user_id, token_type)`, documented in `src/utils/verificationCode.ts:5-8`. A resend physically replaces the previous code.
- `public.profiles` — `auth_user_id`, `email` (normalized, unique on `lower(btrim(email))`), `account_type`, `registration_status`, `is_active`, `approval_status`.
- `public.user_notifications` — `email_sent`, `email_sent_at`, `email_attempts`, `email_error`, `action_path`, `action_label`. **Read `email_error` in Phase 0**: if the Brevo path is also failing, its reasons are recorded here.
- RPCs referenced: `is_email_registered`, `assert_signup_email_available`, `complete_signup_registration`, `server_now_ms`, `notification_email_enabled`.

If you conclude a table is needed (e.g. an auth-email delivery log), **propose it first** — do not add one unilaterally.

---

## 7. ROLE CONTEXT

- Affects **every role**: Student, Adviser, Coordinator, Company, Administrator all register and recover through `AuthSignup.tsx`.
- Students, advisers and coordinators are constrained to `.edu.ph` addresses; **company and admin accounts are not** (`AuthSignup.tsx:210-212, 219-222`) — so the fix must work for arbitrary consumer domains too, not just the college's tenant.
- `BREVO_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are **Edge Function secrets**. Any SMTP password or API key you introduce must live in project secrets or the Management API call — **never** in `.env` with a `VITE_` prefix, never in the client bundle, never committed.
- `SUPABASE_ACCESS_TOKEN` (personal access token) is read from the **process environment** by `scripts/set-auth-urls.mjs`, deliberately not from `.env`. Keep that convention.

---

## 8. REQUESTED CHANGE

**8.1 Diagnose (Phase 0, Section 15). Report the confirmed cause with evidence before editing anything.**

**8.2 Fix the sending identity — this is the actual fix.**

Give the two auth emails a **single, DNS-authenticated sending identity that matches the rest of the system**, i.e. the same authenticated provider the `notification-email` function already uses. Choose **one** of these and justify the choice:

- **Option A — Custom SMTP (preferred; smallest change, no new runtime code).**
  Point Supabase Auth at the existing Brevo account's SMTP relay. Implement it as a **new sibling script** to `scripts/set-auth-urls.mjs` (same Management API endpoint, same `.env`-derived project ref, same `SUPABASE_ACCESS_TOKEN`-from-environment convention, same `--dry-run` support) that sets the SMTP host/port/user/pass/admin-email/sender-name and the email templates. Secrets are passed in from the environment at run time and **never written to a file**.
  - Pros: no new Edge Function, no new failure mode in the signup path, GoTrue keeps owning token generation.
  - Cons: template control limited to GoTrue's template variables.

- **Option B — `send_email` Auth Hook Edge Function.**
  A new function modelled directly on `notification-email/index.ts`, POSTing to the Brevo API, registered as the Auth send-email hook.
  - Pros: full template control, plain-text part, custom headers, per-send logging.
  - Cons: new function, new secret, new deployment step, and **a failure here silently breaks signup and password reset for everyone**. If you choose B, it must fail loudly and be covered by Section 15 verification.

**Whichever you choose, the DNS work is mandatory and is not optional polish:** on the chosen sending domain, publish **SPF**, the provider's **DKIM** records, and a **DMARC** record, and confirm the From address is on that same authenticated domain (DMARC alignment). Document the exact records required; state clearly that they must be added by whoever controls the domain's DNS, and that **the code change is inert until they exist.**

**8.3 Harden the message content** (secondary — do it, but do not present it as the fix):

- Branded templates matching `notification-email/index.ts`: the same header, colors, 560px table layout, footer.
- A **plain-text alternative** for every auth email.
- Specific subjects — e.g. "Your Asian College SIL verification code" / "Reset your Asian College SIL password" — not GoTrue's defaults.
- For the OTP mail, **show the 6-digit code as text in the body** (and in the subject, if the template allows) so it is readable without clicking anything.
- A working **Reply-To** on a monitored mailbox.
- Link text and link target must be the **same visible domain**; no shorteners, no redirectors.
- Clear identification of the sending institution, and one line saying what to do if the recipient did not request this.
- Do **not** add tracking pixels, open-tracking or click-tracking wrappers to auth mail — click-tracking rewrites the URL to the provider's domain, which both trips Gmail's link warnings and can consume one-time tokens via security scanners.

**8.4 Converge the sender identities.**
Report on path C (`emailService.ts` / EmailJS). If it is still in use, recommend folding it into the same Brevo sender; if it is dead code, say so. **Do not delete or rewrite it in this task** — propose it separately.

**8.5 Adjust the UI copy, minimally.**
The current strings are `OTP_SENT_MESSAGE` (`verificationCode.ts:24`) and "If your email is registered, you will receive a password reset link shortly." (`AuthSignup.tsx:602`). Add a short, plain "if you don't see it, check your spam folder" hint. **Reuse the existing `infoMessage` surface and `.error` / info classes** — no new component, no new styling. This is a mitigation for the window before DNS propagates, not a substitute for the fix.

---

## 9. EXPECTED BEHAVIOR

- The signup verification code and the password-reset link arrive **in the Inbox** at Gmail, Outlook/Hotmail, Yahoo and the college's `.edu.ph` tenant, with **no** "Looks safe?", "Mark as not spam", or "be careful with this message" banner.
- The raw headers of a received message show `SPF=pass`, `DKIM=pass`, and `DMARC=pass` **with alignment** to the visible From domain.
- The From address, the reply address, and the link domain all read as the same institution.
- Delivery timing is unchanged or better; the 10-minute OTP window and the 60-second resend cooldown behave exactly as before.
- Every existing auth behaviour is untouched: OTP generation and verification, expired-vs-invalid classification, the `/change-password` recovery session and its role-aware redirect, passkey sign-in, the account-pending / deactivated / locked messages.

---

## 10. UI / UX

Almost nothing should change in the app UI. Where email HTML is authored, match `supabase/functions/notification-email/index.ts` exactly: `#047857` green header, `#f1f5f9` page background, white 560px rounded card, system font stack, `#0f172a` / `#334155` / `#64748b` text ramp, pill-shaped category chip, single solid CTA button. Table-based layout with inline styles only — no flexbox, no grid, no external stylesheet, no web fonts, no emoji. Keep the copy register of the surrounding code: specific, sentence case, no exclamation marks.

---

## 11. SECURITY

- **The OTP and the recovery token must keep being generated by GoTrue.** Do not move token generation into application code, do not log a code or a token, do not put either in a URL you construct yourself.
- SMTP credentials / API keys go in Management API calls or Edge Function secrets. **Never** a `VITE_`-prefixed variable, never the client bundle, never a committed file. Check `.gitignore` covers anything new.
- Keep the "only an app-relative path" URL rule from `buildPortalUrl` (`notification-email/index.ts:92-100`) for any new email that renders a link. An email is an open redirect waiting to happen.
- Keep `redirectTo` constrained by the project's `uri_allow_list`; do not widen the allow list beyond the deployed origin plus the existing localhost dev origins listed in `set-auth-urls.mjs:71-77`.
- Preserve the password-reset **non-enumeration** property: `handleForgotPassword` deliberately shows "If your email is registered…" regardless of outcome. Any new copy or logging must not reveal whether an address exists.
- If you add Option B, the hook must verify its caller (mirror the constant-time `secretsMatch` / bearer-check pattern at `notification-email/index.ts:31-49, 177-185`) — an unauthenticated send hook is an open mail relay.
- Do not disable email confirmation or lower the OTP expiry to "work around" delivery problems.

---

## 12. EDGE CASES

- DNS records added but not yet propagated — messages authenticate inconsistently for up to 48h.
- A Gmail mailbox that has already marked previous messages as spam: that user-level signal persists per-recipient after the sender is fixed. Verify with **fresh** recipient addresses as well as previously-affected ones.
- Provider sending-limit exhaustion (Brevo free-tier daily cap) → silent non-delivery. Decide what the UI shows.
- `.edu.ph` tenant-level quarantine or allow-list policy overriding sender reputation.
- Corporate/consumer security scanners that **pre-fetch links** and consume the one-time recovery token before the human clicks — a known cause of "link already used". Consider whether the OTP-code flow (code typed by hand) is inherently more robust here than the recovery link, and report the finding.
- SMTP relay outage → `signInWithOtp` succeeds (account row created) but no mail arrives; confirm the user can retry and that the address stays re-registrable (`registration_status='pending_verification'` is reported as free by `is_email_registered`).
- Option B only: hook timeout / cold start blocking every signup and every reset.
- Company and admin signups on arbitrary domains, not just `.edu.ph`.
- Users whose account was created before the change, mid-flight reset links issued under the old sender.

---

## 13. REGRESSION CONSTRAINTS — must remain unchanged

- **`OTP_TTL_MINUTES = 10` and the project's 600-second Email OTP expiration must stay in lockstep** (`src/utils/verificationCode.ts:17-22`). If you touch hosted auth config, do not disturb that value.
- The two-server-readings expiry logic — `getServerNowMs`, `classifyRejectedCode`, `rejectedCodeMessage`. **Never substitute browser time.**
- `signInWithOtp({ shouldCreateUser: true, options.data })` and its `options.data` payload (`account_type`, `first_name`, `middle_name`, `last_name`) — the `handle_new_user` trigger depends on it.
- The Stage 1 / Stage 2 separation in `handleVerifyOtp`: an account-creation failure must never be reported as an invalid or expired code.
- `set-signup-password` and the password-provisioning step — out of scope, do not touch.
- `notification-email`'s atomic `email_sent false→true` claim and claim-release on failure. If you reuse that file as a template, **copy it, do not edit it.**
- `resetPasswordForEmail`'s `redirectTo` shape and its `PASSWORD_RESET` audit log entries.
- `UpdatePasswordView`'s rule that the account type comes from the recovery session, never from the URL.
- Non-enumeration in the forgot-password response.
- Passkey sign-in, `[auth.passkey]` / `[auth.webauthn]` config, device-fingerprint registration.
- `getPostAuthRedirect` role routing and the `sessionStorage.portal_login_error` hand-off.
- No schema changes, no new npm dependencies, no refactoring of unrelated code.

---

## 14. IMPLEMENTATION CONSTRAINTS

- **Prefer configuration over code.** The best outcome for this defect changes zero runtime files.
- If a script is needed: new file under `scripts/`, ESM `.mjs`, mirroring `set-auth-urls.mjs` — `.env`-derived project ref, `SUPABASE_ACCESS_TOKEN` from `process.env`, a `--dry-run` that prints current config and exits, a header comment explaining *why* the script exists.
- If SQL is needed: a new re-runnable top-level `supabase_*.sql` file with a header comment explaining the reasoning, matching `supabase_global_email_uniqueness.sql`'s style.
- If an Edge Function is needed: new directory under `supabase/functions/`, a matching `[functions.<name>]` block in `supabase/config.toml`, and the auth pattern from `notification-email/index.ts`.
- Client-side changes should be confined to copy strings in `src/utils/verificationCode.ts` and `src/components/AuthSignup.tsx`. New server calls go through `src/services/auth.ts`, never inline in the component.
- Match the surrounding TypeScript style: explicit `{ data, error }` destructuring, `try/catch` around audit logging, comments that explain reasoning rather than mechanics.
- **Write the DNS and dashboard steps down as an operator runbook** — a new top-level markdown file in the style of `WEB_PUSH_SETUP.md`. A code change nobody can deploy is not a fix.

---

## 15. VERIFICATION

### Phase 0 — Evidence before any edit (required)

Report raw results for each.

1. **What is actually sending auth mail?** Read the hosted auth config:
   ```
   GET https://api.supabase.com/v1/projects/ncwesnnihbyghasbnemd/config/auth
   ```
   (`scripts/set-auth-urls.mjs --dry-run` already performs this GET and prints part of it.) Report: whether custom SMTP is enabled; `smtp_host`, `smtp_user`, `smtp_admin_email`, `smtp_sender_name`, `smtp_max_frequency`; `mailer_otp_exp`; `site_url`; `uri_allow_list`; and whether the mailer templates are default or customised. **Redact the SMTP password.**
2. **Capture a real failing message.** Trigger a password reset and a signup OTP to a Gmail address you control. Open the message, "Show original", and paste the **full headers**. Report `Authentication-Results`: the `spf=`, `dkim=` and `dmarc=` verdicts, the `header.from` domain, the `smtp.mailfrom` domain, and whether DKIM `d=` **aligns** with the From domain. Report the `X-Spam-*` / ARC verdicts if present. **This single step confirms or eliminates H1 outright.**
3. **DNS for every sending domain in play** (the auth From domain, and `BREVO_SENDER_EMAIL`'s domain):
   ```
   dig TXT <domain>                    # SPF
   dig TXT <selector>._domainkey.<domain>   # DKIM
   dig TXT _dmarc.<domain>             # DMARC
   ```
   Report what exists and what is missing.
4. **Is the Brevo path healthy?** Query recent failures:
   ```sql
   select email_error, count(*), max(created_at)
   from public.user_notifications
   where email_error is not null
   group by 1 order by 3 desc limit 20;
   ```
   and check the Brevo dashboard for the sender's bounce/spam/blocked rates. If path B is also being spam-foldered, the fix must cover both.
5. **Link-domain check.** Confirm the reset email's button href, and compare it to `site_url` and to the deployed Vercel origin. Confirm `redirectTo` is matched by `uri_allow_list` rather than silently replaced (see `set-auth-urls.mjs` header).
6. **Scope the reports.** Are complaints from `.edu.ph` mailboxes, personal Gmail, or both? Signup OTP, password reset, or both? Every user or some? This decides whether H6 is in play.

### Phase 1 — After the fix

- Send a signup OTP and a password reset to **fresh** addresses on Gmail, Outlook/Hotmail, Yahoo and a `.edu.ph` mailbox. All land in Inbox, no warning banner. Paste the `Authentication-Results` header for each showing `spf=pass dkim=pass dmarc=pass` with alignment.
- Repeat for a previously-affected recipient; if it still lands in Spam there, state explicitly that this is the per-recipient learned signal and not a sender failure.
- Independently score the message (e.g. mail-tester.com or an equivalent) and report the score plus every deduction.
- End to end: signup → code received → verified within 10 minutes → account created → password login works.
- Expiry behaviour unchanged: a code used after 10 minutes reports **expired**; a wrong code reports **invalid**; a resend invalidates the previous code; the 60-second resend cooldown still applies.
- Forgot password → link received → `/change-password` opens a valid recovery session → new password set → redirected to the correct portal login for that account type.
- Non-enumeration intact: an unregistered address still shows the same "If your email is registered…" message.
- Passkey sign-in unaffected. In-app notification emails still deliver via `notification-email`, still idempotent.
- `npm run lint` and `npm test` pass — in particular `src/utils/verificationCode.test.ts`, `src/utils/email.test.ts`, `src/utils/authRedirect.test.ts`.
- Report a diff summary, confirm no file outside the stated set changed, and confirm **no secret was committed**.

---

## APPENDIX — Confidence labels

- **[CONFIRMED]** — read directly in the repository at the cited path/line.
- **[INFERRED]** — strongly implied by the code (notably: that auth mail uses Supabase's default sender, inferred from the total absence of SMTP configuration), but requiring Phase 0 confirmation against the live project.
- Facts the repository **cannot** answer and that Phase 0 must establish: the hosted SMTP settings, the current `site_url` / `uri_allow_list`, the DNS records of every sending domain, the Brevo account's verification and reputation state, mailbox-provider verdicts on real messages, and which recipients are affected.
- Mailbox-provider behaviour described in H1b and Section 8.2 (Gmail sender requirements, DMARC alignment) is **external platform context, not a codebase finding**, and should be re-checked against current provider documentation at implementation time.
