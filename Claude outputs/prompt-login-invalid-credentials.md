# CODING-AGENT PROMPT — Fix: password login fails with "Invalid email or password" after a completed OTP signup

> Repository: `C:\Users\stewa\monitoring-system` (Asian College SIL Monitoring System)
> Linked Supabase project ref: `ncwesnnihbyghasbnemd` (single project — `.env.local` contains only `VITE_WEB_PUSH_PUBLIC_KEY`, so there is **no** dev/prod project mismatch) **[CONFIRMED]**
>
> This is a **diagnose-then-fix** task. Do not begin editing until Section 15 (Phase 0) has produced evidence.

---

## 1. CONTEXT

A newly registered student can complete signup, finish onboarding, and be approved by their section adviser. After a page refresh, password login fails with **"Invalid email or password."** even though the password is correct.

The reported trigger (adviser approval) is almost certainly **coincidental, not causal** — see Section 4. The defect lives in the **signup password-provisioning step**, and approval is simply the first moment the user logs out and tries password login for the first time.

Affected roles: **Student** primarily; the same signup component serves **Adviser, Coordinator, Company, Admin**, so any fix must hold for all five.

---

## 2. CURRENT IMPLEMENTATION (verified against the codebase)

### 2.1 The error string is unambiguous **[CONFIRMED]**

`src/components/AuthSignup.tsx:530`

```ts
} else if (errorMsg.includes('credentials')) {
    errorMsg = "Invalid email or password.";
}
```

That branch fires **only** when the thrown error text contains `credentials`, i.e. GoTrue's `Invalid login credentials` returned by `supabase.auth.signInWithPassword`. Every profile-level gate has its own distinct message and cannot produce this string:

| Condition | Source | Message shown |
|---|---|---|
| `profiles.is_active === false` | `src/services/auth.ts:281-292` | "…pending approval from your section adviser." |
| `locked_until` in the future | `auth.ts:294-297` | "Too many failed attempts…" |
| Portal/role mismatch | `auth.ts:299-304` | "Access Denied…" |
| Profile row missing | `auth.ts:271-275` | "Account profile not found." |

**Conclusion: the failure happens at the `auth.users` layer, before any `profiles` row is read.** The submitted email + password pair does not match the stored credential. `src/services/auth.ts:237` is where it fails.

### 2.2 The signup flow is OTP-first; the password is applied *last*, by an Edge Function **[CONFIRMED]**

`src/components/AuthSignup.tsx`, `handleSendOtp` (l. 226-291) and `handleVerifyOtp` (l. 360-488):

| # | Step | Code | Effect on credentials |
|---|---|---|---|
| 1 | Pre-check address is free | `isEmailRegistered()` → RPC `public.is_email_registered` | none |
| 2 | **Send code — this CREATES the account** | `supabase.auth.signInWithOtp({ shouldCreateUser: true, options.data })` — `AuthSignup.tsx:237` | `auth.users` row created **with no user-chosen password**; trigger `handle_new_user` inserts `public.profiles` with `registration_status='pending_verification'` |
| 3 | Verify code | `supabase.auth.verifyOtp({ type:'email' })` — l. 376 | session issued |
| 4 | Guard: is this a fresh account? | RPC `public.assert_signup_email_available()` | none |
| 5 | **Set the password** | `supabase.functions.invoke('set-signup-password', { body:{ password: signupPassword } })` — **l. 416-419** | **the ONLY place the user's password is ever written** |
| 6 | Finish registration | RPC `public.complete_signup_registration(...)` | sets `registration_status='complete'`, `is_active` |
| 7 | Store name on auth metadata | `supabase.auth.updateUser({ data })` — l. 432 | failure is only `console.warn`-ed |
| 8 | Redirect to portal | `getPostAuthRedirect()` | none |

`supabase/functions/set-signup-password/index.ts` validates the password, resolves the caller from the bearer token, then calls `admin.auth.admin.updateUserById(user.id, { password })`.

### 2.3 Why step 5 is a hard single point of failure **[CONFIRMED]**

`supabase_global_email_uniqueness.sql:16-19` documents it explicitly: GoTrue writes a bcrypt hash of a **random** password onto every user it creates, including the throwaway user behind `signInWithOtp`. So an account whose step 5 never took effect is **indistinguishable from a real account** at the database level — it has a `$2a$` hash, a confirmed email, a complete profile, working onboarding, and a working adviser approval. It simply has a password nobody knows.

**That is exactly the reported symptom.**

### 2.4 Adviser approval touches no credential **[CONFIRMED]**

`AdviserApprovalsView.tsx` → `adviserService.approveStudentAccount()` (`src/services/adviserService.ts:340-390`) → RPC `public.adviser_approve_student` (`supabase_adviser_schema.sql:369-421`), with a direct-update fallback on RPC failure.

Both write **only** to `public.profiles`: `is_active`, `approval_status`, `adviser_remarks`, `approved_by`, `approved_at`. A grep of `AdviserApprovalsView.tsx` for `password|admin\.|invite|auth\.` returns only three matches, all of them rendering `student.email` as display text. **Approval cannot cause this error.** Do not "fix" the approval flow.

---

## 3. EXISTING FILES (responsibilities)

| Path | Responsibility |
|---|---|
| `src/components/AuthSignup.tsx` | Signup (OTP), login, forgot-password, passkey login. Owns steps 1-8 above and the error→message mapping at l. 516-545 |
| `src/services/auth.ts` | `signIn`, legacy `signUp`, `isEmailRegistered`, `assertSignupSessionIsNewAccount`, `completeSignupRegistration`, `getServerNowMs`, `validatePasskeySession`, `resetPasswordForEmail` |
| `supabase/functions/set-signup-password/index.ts` | Service-role password application. **The only writer of a user-chosen password at signup** |
| `supabase/config.toml:36-40` | `[functions.set-signup-password] enabled = true, verify_jwt = false` |
| `supabase_global_email_uniqueness.sql` | `registration_status` lifecycle, `normalize_email`, `is_email_registered`, `assert_signup_email_available`, `complete_signup_registration`, `enforce_profile_email_rules` trigger, unique index on `lower(btrim(email))`, `handle_new_user` |
| `supabase_adviser_schema.sql:369-421` | `adviser_approve_student` RPC |
| `supabase_security_rpc.sql` | `increment_failed_login` (locks 15 min after 5 attempts), `reset_failed_login` |
| `src/utils/email.ts` | `normalizeEmail`, `isDuplicateEmailError`, `EMAIL_ALREADY_REGISTERED_MESSAGE` |
| `src/utils/passwordRules.ts` | Client password policy — must stay in lockstep with `validPassword()` in the Edge Function |
| `src/lib/supabaseClient.ts` | Single shared client, `@supabase/supabase-js ^2.105.0`, passkey experimental flag |

---

## 4. RANKED HYPOTHESES — investigate in this order

**H1 — `set-signup-password` did not actually apply the password for the affected account.** *(most likely)*
Sub-causes to distinguish:
- **H1a** The function is not deployed to `ncwesnnihbyghasbnemd`, or a stale version is deployed. The repo file is not proof of deployment.
- **H1b** The `SUPABASE_SERVICE_ROLE_KEY` secret is missing/rotated in the Functions environment → handler returns 401 at `index.ts:25`.
- **H1c** `admin.auth.admin.updateUserById` failed server-side (weak-password policy / HIBP / `password_min_length` set higher than the client rule) → 500 at `index.ts:37`.
- **H1d** The rejection never reached the user: verify whether `supabase.functions.invoke` in `@supabase/supabase-js@2.105` returns `error` for **every** non-2xx status here, and whether the thrown `FunctionsHttpError` message survives the `catch` at l. 468 (it is rendered as "We verified your email but could not finish creating your account: …"). If the response body's `error` field is not surfaced, a real failure looks generic — or, worse, a 2xx-with-error-body would be swallowed entirely.

**H2 — Session/token timing around the admin password change.** `admin.updateUserById` with a password change revokes refresh tokens in some GoTrue versions. The already-issued access token stays valid for its remaining TTL, so onboarding and approval keep working while the *credential state* is not what the UI implies. Confirm the actual GoTrue behaviour for this project (`supabase/.temp/gotrue-version`) before ruling it out.

**H3 — Half-finished signups are never cleaned up.** If any step after `verifyOtp` throws, the `auth.users` row and the `pending_verification` profile both survive (`AuthSignup.tsx:468-487` only sets an error message). `is_email_registered` deliberately reports such an address as **free** (`supabase_global_email_uniqueness.sql:98-105`), so the person can "register again" — but `signInWithOtp` matches by email and **reuses the same `auth.users` row**. Establish what credential state that leaves behind across a retry.

**H4 — Email divergence between `auth.users.email` and what the user types.** Low probability: `normalizeEmail` is applied on both signup and login, `handle_new_user` normalizes, and `enforce_profile_email_rules` re-normalizes on every write. Verify anyway with the query in Phase 0.

**H5 — Account lockout masquerading.** `increment_failed_login` locks for 15 minutes after 5 attempts (`supabase_security_rpc.sql:10-12`), but that surfaces as "Too many failed attempts", never as this message. Note that repeated user retries will now also be locking the row — clear `failed_login_attempts`/`locked_until` when testing.

Do **not** assume a hypothesis. Confirm one with evidence, then fix that.

---

## 5. DATA FLOW

```
Signup:  AuthSignup.handleSendOtp
           → supabase.auth.signInWithOtp        → auth.users INSERT
                                                → trigger handle_new_user → profiles (pending_verification)
         AuthSignup.handleVerifyOtp
           → supabase.auth.verifyOtp            → session
           → rpc assert_signup_email_available
           → functions.invoke('set-signup-password')
                → Edge (service role) → admin.auth.admin.updateUserById({password})
                                                → auth.users.encrypted_password   ◀── THE ONLY WRITE
           → rpc complete_signup_registration   → profiles.registration_status='complete', is_active
           → supabase.auth.updateUser({data})   → auth.users.raw_user_meta_data

Approval: AdviserApprovalsView → adviserService.approveStudentAccount
           → rpc adviser_approve_student        → profiles only

Login:   AuthSignup.handleLogin → services/auth.signIn
           → supabase.auth.signInWithPassword   → auth.users  ◀── FAILS HERE
           → profiles SELECT (is_active, locked_until, account_type, approval_status)
```

---

## 6. DATABASE CONTEXT

- `auth.users` — `id`, `email`, `encrypted_password`, `email_confirmed_at`, `last_sign_in_at`, `raw_user_meta_data`, `updated_at`
- `public.profiles` — `auth_user_id` (FK, unique), `email`, `email_domain`, `account_type`, `is_active`, `approval_status`, `registration_status`, `registration_completed_at`, `failed_login_attempts`, `locked_until`, `approved_by`, `approved_at`, `adviser_remarks`, `section`
- Unique index `profiles_email_lower_unique_idx` on `lower(btrim(email))`
- Trigger `profiles_email_rules` (BEFORE INSERT/UPDATE) → `enforce_profile_email_rules()`
- Triggers on `auth.users`: `auth_user_created` and `on_auth_user_created` → `handle_new_user()`

**Note an existing inconsistency [CONFIRMED], report it but do not fix it in this task unless it is the root cause:** `complete_signup_registration` sets `v_is_active := (p_account_type <> 'coordinator')` (`supabase_global_email_uniqueness.sql:174`), i.e. **students go live immediately and `approval_status` is never set to `'pending'`** — while the legacy `signUp()` path in `src/services/auth.ts:194-195` sets students to `is_active:false, approval_status:'pending'`. The adviser pending queue compensates by filtering `approval_status === 'pending' || is_active === false` (`adviserService.ts:333`).

---

## 7. ROLE CONTEXT

- **Student / Adviser / Coordinator / Company / Admin** all register through `AuthSignup.tsx` and therefore all depend on step 5.
- `set-signup-password` is `verify_jwt = false` at the gateway and authorizes **inside the handler** by resolving the bearer token with the service-role client (`index.ts:21-34`). It can only ever change the caller's own password — preserve that property.
- The service-role key must never reach the browser.

---

## 8. REQUESTED CHANGE

1. **Diagnose** which hypothesis in Section 4 is true, using Phase 0 in Section 15. State the confirmed cause with evidence.
2. **Fix the cause**, minimally.
3. **Make the failure impossible to hide.** Signup must never reach "✅ Account created! Redirecting…" unless the password is verifiably applied. Specifically:
   - Treat a non-2xx **and** a 2xx-with-`error`-body from `set-signup-password` as fatal.
   - Surface the Edge Function's own message (it returns `{ error }` JSON) rather than a generic string.
   - Verify the password took effect before declaring success — for example, have the Edge Function re-read the user and return an explicit confirmation, or perform an equivalent server-side assertion. Do **not** verify by calling `signInWithPassword` in the browser, which would replace the live session.
4. **Provide a recovery path for accounts already in this state.** They exist in production now. Prefer the flow that already exists: the login screen's "Forgot password?" → `resetPasswordForEmail` → `/change-password` (`UpdatePasswordView.tsx`). If that path works for these accounts, the fix is to route affected users to it (and to say so in the error copy) rather than to build new tooling. If it does not work, state why and propose the smallest safe alternative — do not build an admin password-reset surface without asking first.

---

## 9. EXPECTED BEHAVIOR

- A user who completes signup can immediately sign in with the password they typed, from a fresh browser session, before and after adviser approval.
- If the password cannot be set, signup **stops** at the OTP step with a specific, actionable message, and the user is not redirected into a portal.
- Existing accounts stuck without a usable password can recover by themselves via password reset.
- Approval, onboarding, passkey login, and the pending/approved gating messages are unchanged.

---

## 10. UI / UX

Reuse the existing error surfaces only — `errors.general`, `errors.otp`, `errors.signupEmail`, `infoMessage`, and the existing `.error` / `.password-requirements` classes in `AuthSignup.css`. No new components, no new colors, no new layout. Keep the message register of the surrounding code: specific, lowercase-sentence, no emoji beyond the existing "✅" in the success line.

---

## 11. SECURITY

- Keep `verify_jwt = false` + in-handler bearer verification for `set-signup-password`, or move to `verify_jwt = true` **only** if you confirm the OTP session token is accepted by the gateway; do not weaken it.
- The function must continue to derive the target user from the token, never from the request body.
- Keep client-side `validatePassword` and the Edge Function's `validPassword` in lockstep (both files say so in comments).
- Do not log passwords, tokens, or the service-role key.
- Remember the project's own rule: a hidden UI element is not security. Any new guard must exist server-side.

---

## 12. EDGE CASES

- Edge Function not deployed / cold-start timeout / network failure at step 5.
- User closes the tab between step 5 and step 6.
- Resend code, then verify with the older code.
- Same address retried after an abandoned signup (same `auth.users` row is reused).
- Password accepted by the client rule but rejected by the project's auth password policy.
- Account already locked by `increment_failed_login` from the user's repeated attempts.
- Passkey-only users who never set a password.
- Company/adviser/coordinator variants of the same flow.

---

## 13. REGRESSION CONSTRAINTS — must remain unchanged

- The `registration_status` lifecycle and the reasoning in `supabase_global_email_uniqueness.sql:9-33`. **Do not reintroduce any inference of "registration finished" from `encrypted_password`** — that bug is documented there and was already fixed once.
- `is_email_registered` must keep reporting `pending_verification` addresses as **free**.
- The two-server-readings OTP expiry logic (`getServerNowMs` / `rejectedCodeMessage`) — do not substitute browser time.
- Stage 1 / Stage 2 separation in `handleVerifyOtp`: an account-creation failure must never be reported as an invalid or expired code.
- `adviser_approve_student` and `adviserService.approveStudentAccount` — do not touch.
- `signIn`'s ordering: authenticate first, then read the profile under RLS, then gate.
- The distinct `ACCOUNT_PENDING` / `ACCOUNT_DEACTIVATED` / `ACCOUNT_LOCKED` messages and the `sessionStorage.portal_login_error` hand-off.
- Passkey login (`validatePasskeySession`) and device-fingerprint registration.
- `getPostAuthRedirect` / `logRedirectDecision` role routing.
- No schema changes, no new dependencies, no refactoring of unrelated code, no new Supabase project settings without stating them explicitly.

---

## 14. IMPLEMENTATION CONSTRAINTS

- Change the smallest number of files. The likely set is `supabase/functions/set-signup-password/index.ts` and the step-5 block of `src/components/AuthSignup.tsx` (l. 414-419) plus its catch block.
- Follow the existing service pattern: if new server calls are needed from the client, add them to `src/services/auth.ts` next to `completeSignupRegistration`, not inline in the component.
- Follow the existing SQL convention: new SQL goes in a new top-level `supabase_*.sql` file that is safe to re-run, with a header comment explaining *why*, matching the style of `supabase_global_email_uniqueness.sql`.
- Reuse `normalizeEmail`, `isDuplicateEmailError`, `validatePassword`.
- Match the surrounding TypeScript style: explicit `{ data, error }` destructuring, `try/catch` around audit logging, comments that explain the reasoning rather than the mechanics.

---

## 15. VERIFICATION

### Phase 0 — Evidence before any edit (required)

Run against project `ncwesnnihbyghasbnemd` and report the raw results:

1. **Is the function live?** List deployed Edge Functions and the deployed version/updated-at of `set-signup-password`. Confirm `SUPABASE_SERVICE_ROLE_KEY` is present in the Functions secrets.
2. **State of the affected account(s):**
   ```sql
   select u.id, u.email, u.email_confirmed_at, u.last_sign_in_at,
          left(u.encrypted_password, 4) as hash_prefix,
          u.created_at as auth_created, u.updated_at as auth_updated,
          p.account_type, p.registration_status, p.registration_completed_at,
          p.is_active, p.approval_status, p.approved_at,
          p.failed_login_attempts, p.locked_until,
          p.email as profile_email
   from auth.users u
   left join public.profiles p on p.auth_user_id = u.id
   where u.email = :affected_email;
   ```
   Compare `auth_updated` with `registration_completed_at`. **If `updated_at` does not advance at the moment the password should have been set, H1 is confirmed.** Compare `u.email` with `p.profile_email` for H4.
3. **Population-level check** — how widespread is this?
   ```sql
   select p.registration_status, count(*)
   from public.profiles p join auth.users u on u.id = p.auth_user_id
   group by 1;

   select count(*) from public.profiles p
   join auth.users u on u.id = p.auth_user_id
   where p.registration_status = 'complete' and u.last_sign_in_at is null;
   ```
4. **Edge Function logs** for the affected account's signup timestamp — status codes and any `Unable to set password.` / `Unauthorized.` responses.
5. **Reproduce end to end** on a throwaway `.edu.ph` address with the browser network tab open: capture the exact status code and response body of the `set-signup-password` call, then attempt password login in a private window **before** any approval. State whether login fails at that point — if it does, approval is definitively exonerated.

### Phase 1 — After the fix

- New signup → password login succeeds in a private window **before** adviser approval.
- Same account → adviser approves → password login still succeeds.
- Force `set-signup-password` to fail (temporarily disable it or send a policy-violating password): signup must stop with a specific message, must **not** redirect, and the address must remain re-registrable.
- An account already in the broken state recovers through "Forgot password?" → `/change-password` and can then log in.
- Coordinator signup still lands in `is_active=false` and shows "pending approval from an administrator".
- Adviser and company signups complete and can log in.
- Passkey enrollment and passkey login still work.
- Wrong password still yields "Invalid email or password."; 5 wrong attempts still yields the lockout message.
- `npm run lint` and the existing test suite (`src/utils/*.test.ts`, incl. `email.test.ts`, `verificationCode.test.ts`, `authRedirect.test.ts`) pass.
- Report a diff summary and confirm no file outside the stated set changed.

---

## APPENDIX — Confidence labels used above

- **[CONFIRMED]** — read directly in the repository at the cited path and line.
- Everything in Section 4 is a **hypothesis**; nothing there is confirmed until Phase 0 produces evidence.
- Runtime facts that the repository cannot answer and that must be checked against the live project: whether `set-signup-password` is deployed, its secrets, the project's auth password policy, the GoTrue version's session-revocation behaviour on admin password change, and Edge Function logs.
