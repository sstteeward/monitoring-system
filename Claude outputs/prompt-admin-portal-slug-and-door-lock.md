# CODING-AGENT PROMPT — Add `/admin-portal` slug and lock admins to the admin door only

> Repository: `C:\Users\stewa\monitoring-system` (Asian College SIL Monitoring System)
> Stack: React 19 + TypeScript + Vite, React Router v7 (`react-router-dom ^7.13.1`), Supabase auth. **[CONFIRMED]**
>
> This is a **frontend routing + auth-gate** task. Two small, related changes. No database, no schema, no RLS, no new components, no new dependencies.
>
> **Read the two files below before editing.** Do not touch any file not listed in Section 13.

---

## 1. CONTEXT

Two changes to how administrators reach and enter the admin portal:

- **A. Cleaner address.** Admins should be able to type `https://<host>/admin-portal` and land on the admin login form. Today that address does not exist.
- **B. One admin door.** Admins can currently sign in through the Coordinator **and** Adviser login portals as well as the admin one. Close both of those side doors: an admin account may sign in **only** through the admin portal.

Neither change is a security boundary on its own (a URL is public; the real gate is the account's role, checked at login, in routing, and — most importantly — in the database RLS/RPCs). This task only makes the admin entry point explicit and consistent. Do not present the slug as a security feature.

Affected role: **Admin** (behavior at the coordinator/adviser login also changes for admin accounts). Student, Adviser, Coordinator and Company login behavior must be unchanged.

---

## 2. CURRENT IMPLEMENTATION **[CONFIRMED]**

### Routing — `src/App.tsx`

- One login page (`AuthSignup`) is mounted at `/login`. The portal it shows comes from the `?portal=<role>` query param, read in `AuthSignup`.
- **Signed-out** users get a small route table inside `if (!session)`:
  ```
  <Route path="/" element={<LandingPage />} />
  <Route path="/login" element={<AuthSignup />} />
  <Route path="/test-dtr" element={...} />
  <Route path="*" element={<Navigate to="/" replace />} />
  ```
  Any unknown address (including `/admin-portal`) currently falls through the `*` route to `/`.
- **Signed-in** users are routed by the normalized role of their profile. The catch-all `/*` route sends any unmatched address to `getPostAuthRedirect(role)` — for an admin that is `/admin`. This already means a signed-in admin who types `/admin-portal` ends up at `/admin`, so **no signed-in change is required.**

### Login gate — `src/services/auth.ts`, `signIn()` (around l.328–333)

```ts
if (role && profileAccountType !== role) {
  // Allow admins to log in via coordinator or adviser portal
  if (!((role === 'coordinator' || role === 'adviser') && profileAccountType === 'admin')) {
    throw new Error('Access Denied: Your account is not authorized for this portal.');
  }
}
```

`role` is the portal the user is signing in through (derived from `?portal=`), passed by `AuthSignup` (l.505). `profileAccountType` is the account's real role. The exception block is what lets an admin through the coordinator/adviser doors.

### Landing page — `src/components/LandingPage.tsx`

Shows portal cards for student, adviser, coordinator, company only. **There is intentionally no admin card.** Do not add one — the admin door stays unlisted.

---

## 3. EXISTING FILES

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Router. Signed-out route table (`if (!session)`) and signed-in role routing. |
| `src/services/auth.ts` | `signIn()` — portal/role gate at l.328–333. |
| `src/components/AuthSignup.tsx` | Reads `?portal=`; on admin portal, hides "Create an account" (l.907) and skips the `.edu.ph` rule. **No change needed**, but confirm `?portal=admin` still renders the admin login exactly as today. |
| `src/utils/authRedirect.ts` | `normalizeAccountType`, `getPostAuthRedirect`. **No change needed.** |

---

## 4. REQUESTED CHANGE

### Change A — `/admin-portal` slug (`src/App.tsx`)

In the **signed-out** route table (inside `if (!session)`), add one route that redirects the slug to the existing admin login:

```tsx
<Route path="/admin-portal" element={<Navigate to="/login?portal=admin" replace />} />
```

- Place it alongside the other explicit routes, before the `*` catch-all.
- Use `replace` so `/admin-portal` does not stay in the history stack.
- **Do not** create a new component or a second login page — reuse `AuthSignup` via `?portal=admin`.
- **Do not** change the signed-in routing. The existing catch-all already sends a signed-in admin to `/admin`.
- **Do not** add `/admin-portal` to `LandingPage` or link it anywhere. It stays an unlisted, type-it-yourself address.

### Change B — Lock admins to the admin door (`src/services/auth.ts`)

Remove the coordinator/adviser exception so an admin account signing in through any non-admin portal is refused, exactly like any other role mismatch. Replace the block at l.328–333 with:

```ts
if (role && profileAccountType !== role) {
  throw new Error('Access Denied: Your account is not authorized for this portal.');
}
```

- Keep the surrounding logic (`is_active`, `locked_until`, audit logging, `reset_my_failed_login`) untouched.
- Keep the exact error string `'Access Denied: Your account is not authorized for this portal.'` — `AuthSignup`'s catch block already handles it.
- Do not weaken any other check.

---

## 5. EXPECTED BEHAVIOR

- Typing `/admin-portal` while signed out lands on the admin login form (`AuthSignup` with `portal=admin`): no "Create an account" link, non-`.edu.ph` email allowed — identical to visiting `/login?portal=admin` today.
- Typing `/admin-portal` while signed in as an admin ends on `/admin` (unchanged). Signed in as any other role, it ends on that role's own portal (unchanged catch-all behavior).
- An **admin** who tries to sign in at `/login?portal=coordinator` or `/login?portal=adviser` is refused with "Access Denied: Your account is not authorized for this portal." and stays on that login page with the error shown.
- An admin signing in at `/login?portal=admin` (or via `/admin-portal`) succeeds and lands on `/admin`.
- Coordinator, adviser, student and company sign-in at their own portals is unchanged.

---

## 6. UI / UX

No new components, pages, copy, colors or layout. The refusal reuses the existing `Access Denied` alert path in `AuthSignup`. The admin login form is the one already rendered for `?portal=admin`.

---

## 7. SECURITY

- State plainly in the PR description that the slug is a convenience address, **not** an access control — the enforcement is the role check in `signIn`, the role routing in `App.tsx`, and the database RLS/RPC layer (unchanged here).
- Change B is a genuine tightening: it removes a cross-portal login path for admins. It only refuses; it never grants.
- Do not touch the database, RLS, or any `admin_*` RPC in this task.

---

## 8. EDGE CASES

- **Sticky portal:** `AuthSignup` stores the last portal in `sessionStorage` (`active_portal_role`). An admin who previously used the coordinator portal in the same tab could still see that portal on a bare `/login`. Reaching the admin door via `/admin-portal` or `/login?portal=admin` sets `portal=admin` and overrides it. Do not change the sessionStorage logic; just confirm the override still works.
- **Already-signed-in admin at `/admin-portal`:** handled by the existing signed-in catch-all → `/admin`. Confirm; add nothing.
- **Non-admin at `/admin-portal`:** they see the admin login form (as they would at `/login?portal=admin` today) but cannot sign in as admin because they have no admin account — `signIn` refuses on role mismatch. No change needed.
- **`?portal=admin` deep link:** must keep working exactly as before Change A.

---

## 9. REGRESSION CONSTRAINTS — must remain unchanged

- All other login portals and their error messages (`ACCOUNT_PENDING` / `ACCOUNT_DEACTIVATED` / `ACCOUNT_LOCKED`).
- The recovery-link flow, the deactivated/locked portal sign-out (`signOutIfPortalBlocked`), maintenance-mode handling, and all signed-in role routing in `App.tsx`.
- `AuthSignup`'s portal reading, the hidden "Create an account" on the admin portal, and the `.edu.ph` rules for the other portals.
- `LandingPage` — no admin card added.
- No new dependencies, no new files, no schema/RLS/RPC changes.

---

## 10. IMPLEMENTATION CONSTRAINTS

- **Exactly two files change:** `src/App.tsx` (one route added) and `src/services/auth.ts` (exception removed). Justify any other file you touch.
- Reuse `AuthSignup` and the existing `?portal=admin` mechanism. No new login component.
- Keep the `Navigate` redirect approach for the slug rather than mounting `AuthSignup` directly at `/admin-portal`, so all portal logic stays in one place.

---

## 11. VERIFICATION

- **Slug, signed out:** visit `/admin-portal` → lands on admin login (no signup link, non-`.edu.ph` accepted). Address bar shows `/login?portal=admin`.
- **Slug, signed in as admin:** visit `/admin-portal` → ends on `/admin`.
- **Slug, signed in as non-admin:** visit `/admin-portal` → ends on that role's portal.
- **Door lock:** with a real admin account, attempt sign-in at `/login?portal=coordinator` and `/login?portal=adviser` → both refused with the Access Denied message; the admin stays on the login page.
- **Admin door still works:** admin signs in at `/admin-portal` / `/login?portal=admin` → lands on `/admin`.
- **No regressions:** coordinator, adviser, student, company each sign in at their own portal successfully.
- `npm run lint`, `npm test`, and `npm run build` all pass.
- Report a diff summary and confirm only the two files in Section 10 changed (or justify each extra file).

---

**Confidence labels:** **[CONFIRMED]** = read in the repository at the cited path.
