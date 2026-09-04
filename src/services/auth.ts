// Lazy-load the Supabase client to avoid module import-time crashes when env vars are missing.
import { generateDeviceFingerprint, getDeviceLabel } from '../utils/deviceFingerprint';
import { EMAIL_ALREADY_REGISTERED_MESSAGE, isDuplicateEmailError, normalizeEmail } from '../utils/email';

async function getClient() {
  try {
    const mod = await import('../lib/supabaseClient');
    return mod.supabase;
  } catch (err) {
    // rethrow with clearer message
    throw new Error('Supabase client failed to initialize. Ensure environment variables are set and the client file is correct.');
  }
}

/**
 * Server-side check for "is this address already in use by ANY portal".
 *
 * The work happens in Postgres (public.is_email_registered), which reads both
 * auth.users and public.profiles, so it covers students, advisers,
 * coordinators, company accounts and admins in one pass. This is a UX
 * pre-check only — the unique index and triggers in
 * supabase_global_email_uniqueness.sql are what actually enforce the rule.
 */
export async function isEmailRegistered(email: string): Promise<boolean> {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc('is_email_registered', {
    p_email: normalizeEmail(email),
  });
  if (error) {
    // Never let a check failure silently wave a registration through — the
    // caller decides, and the database still refuses the duplicate.
    console.warn('[Auth] Email availability check failed:', error);
    throw error;
  }
  return data === true;
}

/** Throws the standard user-facing error when the address is already taken. */
export async function assertEmailAvailable(email: string): Promise<void> {
  if (await isEmailRegistered(email)) {
    throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
  }
}

/**
 * Second server-side gate for the OTP signup flow.
 *
 * Verifying an email OTP signs the visitor into whatever account owns that
 * address, so the portal has to confirm — from the session, in Postgres — that
 * the account it just landed on is a fresh one and not somebody's existing
 * account being converted to another portal.
 */
export async function assertSignupSessionIsNewAccount(): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.rpc('assert_signup_email_available');
  if (error) {
    if (isDuplicateEmailError(error)) {
      throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
    }
    throw error;
  }
}

export async function signUp({ email, password, firstName, middleName, lastName, accountType, course, adviserType }: {
  email: string;
  password: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  accountType?: 'student' | 'coordinator' | 'admin' | 'company' | 'adviser';
  course?: string;
  adviserType?: 'HT Adviser' | 'IT Adviser';
}) {
  const supabase = await getClient();
  const normalizedEmail = normalizeEmail(email);

  // One email = one account, whichever portal it was created from. Checked in
  // Postgres across auth.users and every account type before anything is
  // written, so no auth user, profile, or onboarding row is created for an
  // address that is already taken.
  await assertEmailAvailable(normalizedEmail);

  // Sign up the user — the DB trigger `on_auth_user_created` will automatically
  // insert a row into public.profiles, so we don't need to insert manually.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        first_name: firstName ?? null,
        middle_name: middleName ?? null,
        last_name: lastName ?? null,
        account_type: accountType ?? 'student',
        course: course ?? null,
        adviser_type: adviserType ?? null,
      },
    },
  });
  if (signUpError) {
    try {
      const { createAuditLog } = await import('./auditService');
      await createAuditLog({
        action: 'CREATE',
        module: 'User Management',
        description: `Failed registration attempt for ${email}: ${signUpError.message}`,
        overrideUser: { userId: '', userName: email, userRole: accountType || 'guest' },
        status: 'failed'
      });
    } catch {}
    // Lost the race, or the frontend was bypassed entirely — the database
    // refused the duplicate. Surface the same message either way rather than
    // leaking the underlying constraint.
    if (isDuplicateEmailError(signUpError)) {
      throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
    }
    throw signUpError;
  }

  // Supabase obfuscates "user already registered" when email confirmations are
  // enabled: it answers with a fake user carrying no identities. Treat that as
  // the duplicate it is instead of writing a second profile for the address.
  if (signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0) {
    throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
  }

  // Supabase triggers sometimes fire before user_metadata is available (e.g. when
  // email confirmation is enabled). Explicitly upsert the account_type to guarantee
  // the profile has the correct value, regardless of trigger timing.
  if (signUpData?.user) {
    const isCoordinator = accountType === 'coordinator';
    const isAdviser = accountType === 'adviser';
    const isStudent = accountType === 'student' || !accountType;
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          auth_user_id: signUpData.user.id,
          email: normalizedEmail,
          first_name: firstName ?? null,
          middle_name: middleName ?? null,
          last_name: lastName ?? null,
          account_type: accountType ?? 'student',
          course: course ?? null,
          adviser_type: adviserType ?? null,
          // Coordinators and Advisers require approval; Students start pending until approved by adviser
          is_active: (isCoordinator || isAdviser) ? false : (isStudent ? false : true),
          approval_status: isStudent ? 'pending' : (isCoordinator || isAdviser ? 'pending' : 'approved')
        },
        { onConflict: 'auth_user_id', ignoreDuplicates: false }
      );

    if (profileError) {
      if (isDuplicateEmailError(profileError)) {
        throw new Error(EMAIL_ALREADY_REGISTERED_MESSAGE);
      }
      if (accountType === 'company') {
        throw new Error('Company onboarding is not enabled in the database yet. Please ask an administrator to apply the Company Portal migration, then try again.');
      }
      throw profileError;
    }

    try {
      const fullName = `${firstName || ''} ${lastName || ''}`.trim() || email;
      const { createAuditLog } = await import('./auditService');
      await createAuditLog({
        action: 'CREATE',
        module: 'User Management',
        description: `New user registration for ${email} (${accountType || 'student'})`,
        targetType: 'user',
        targetId: signUpData.user.id,
        targetName: fullName,
        overrideUser: {
          userId: signUpData.user.id,
          userName: fullName,
          userRole: accountType || 'student'
        }
      });
    } catch {}
  }

  return signUpData;
}

export async function signIn({ email, password, role }: { email: string; password: string; role?: 'student' | 'coordinator' | 'admin' | 'company' | 'adviser' }) {
  const supabase = await getClient();
  const normalizedEmail = normalizeEmail(email);

  // 1. Attempt login first (bypassing RLS until authenticated)
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      try {
        await supabase.rpc('increment_failed_login', { user_email: normalizedEmail });
      } catch (rpcError) {
        console.warn('[Auth] Failed to record failed login attempt:', rpcError);
      }
    }
    try {
      const { createAuditLog } = await import('./auditService');
      await createAuditLog({
        action: 'LOGIN_FAILED',
        module: 'Authentication',
        description: `Failed login attempt for ${normalizedEmail}: ${error.message}`,
        overrideUser: {
          userId: '',
          userName: normalizedEmail,
          userRole: 'guest'
        },
        status: 'failed'
      });
    } catch {}
    throw error;
  }

  // 2. Fetch the profile NOW that we are authenticated (RLS will allow this)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active, locked_until, account_type, approval_status')
    .eq('auth_user_id', data.user.id)
    .single();

  if (profileError || !profile) {
    // This shouldn't happen for valid users, but if it does, sign out
    await supabase.auth.signOut();
    throw new Error("Account profile not found. Please contact support.");
  }

  // 3. Perform security and role checks
  try {
    const profileAccountType = profile.account_type?.trim().toLowerCase();

    if (profile.is_active === false) {
      if (profileAccountType === 'coordinator') {
        throw new Error("ACCOUNT_PENDING: Your coordinator account is pending approval from an administrator.");
      }
      if (profileAccountType === 'adviser') {
        throw new Error("ACCOUNT_PENDING: Your adviser account is pending activation from a coordinator.");
      }
      if (profileAccountType === 'student') {
        throw new Error("ACCOUNT_PENDING: Your student account is pending approval from your section adviser.");
      }
      throw new Error("ACCOUNT_DEACTIVATED: Your account has been deactivated. Please contact an administrator.");
    }

    if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
      const unlockTime = new Date(profile.locked_until).toLocaleTimeString();
      throw new Error(`ACCOUNT_LOCKED: Too many failed attempts. Try again after ${unlockTime}.`);
    }

    if (role && profileAccountType !== role) {
      // Allow admins to log in via coordinator or adviser portal
      if (!((role === 'coordinator' || role === 'adviser') && profileAccountType === 'admin')) {
        throw new Error('Access Denied: Your account is not authorized for this portal.');
      }
    }

    // 4. On absolute success, reset failed attempts
    await supabase.rpc('reset_failed_login', { user_email: normalizedEmail });

    try {
      const { createAuditLog } = await import('./auditService');
      await createAuditLog({
        action: 'LOGIN',
        module: 'Authentication',
        description: `Successfully signed in as ${normalizedEmail}`,
        overrideUser: {
          userId: data.user.id,
          userName: normalizedEmail,
          userRole: profile.account_type || 'unknown'
        }
      });
    } catch {}

    // 5. Register Device Fingerprint (non-blocking)
    try {
      const fingerprint = await generateDeviceFingerprint();
      const deviceLabel = getDeviceLabel();
      
      const { error: fpError } = await supabase.from('device_fingerprints').upsert({
        user_id: data.user.id,
        fingerprint,
        device_label: deviceLabel,
        last_seen_at: new Date().toISOString()
      }, {
        onConflict: 'user_id, fingerprint'
      });

      if (fpError) {
        console.warn('[Auth] Failed to register device fingerprint:', fpError);
      } else {
        // Increment the times_seen counter using an RPC call or let the database handle it
        await supabase.rpc('increment_device_seen_count', { 
            p_user_id: data.user.id, 
            p_fingerprint: fingerprint 
        });
      }
    } catch (fpErr) {
      console.warn('[Auth] Error generating device fingerprint:', fpErr);
    }

  } catch (checkError: any) {
    // If any check fails, save the error to survive the sign-out re-render/redirect
    const errorMsg = checkError.message || String(checkError);
    sessionStorage.setItem('portal_login_error', errorMsg);
    
    try {
      const { createAuditLog } = await import('./auditService');
      await createAuditLog({
        action: 'LOGIN_FAILED',
        module: 'Authentication',
        description: `Failed login check for ${email}: ${errorMsg}`,
        overrideUser: {
          userId: data.user.id,
          userName: email,
          userRole: profile.account_type || 'unknown'
        },
        status: 'failed'
      });
    } catch {}

    // Sign the user out immediately before returning
    await supabase.auth.signOut();
    throw checkError;
  }

  return data;
}

/** Verifies that a session issued by Supabase Passkeys is valid, active, not locked, and authorized for the requested portal. */
export async function validatePasskeySession(expectedRole?: 'student' | 'coordinator' | 'admin' | 'company' | 'adviser') {
  const supabase = await getClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('Passkey sign-in could not be verified.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active, locked_until, account_type')
    .eq('auth_user_id', user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error('Account profile not found for this passkey. Please contact support.');
  }

  if (profile.is_active === false) {
    await supabase.auth.signOut();
    if (profile.account_type === 'coordinator') {
      throw new Error('ACCOUNT_PENDING: Your coordinator account is pending approval from an administrator.');
    }
    if (profile.account_type === 'adviser') {
      throw new Error('ACCOUNT_PENDING: Your adviser account is pending activation from a coordinator.');
    }
    if (profile.account_type === 'student') {
      throw new Error('ACCOUNT_PENDING: Your student account is pending approval from your section adviser.');
    }
    throw new Error('ACCOUNT_DEACTIVATED: Your account has been deactivated. Please contact an administrator.');
  }

  if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
    await supabase.auth.signOut();
    const unlockTime = new Date(profile.locked_until).toLocaleTimeString();
    throw new Error(`ACCOUNT_LOCKED: Your account is locked until ${unlockTime}.`);
  }

  if (expectedRole && profile.account_type !== expectedRole) {
    // Allow admins to access coordinator/adviser portal if needed, mirroring password login
    if (!((expectedRole === 'coordinator' || expectedRole === 'adviser') && profile.account_type === 'admin')) {
      await supabase.auth.signOut();
      throw new Error(`Access Denied: This passkey belongs to a ${profile.account_type} account and is not authorized for the ${expectedRole} portal.`);
    }
  }

  if (user.email) {
    try {
      await supabase.rpc('reset_failed_login', { user_email: normalizeEmail(user.email) });
    } catch {}
  }

  // Audit logging for passkey login
  try {
    const { createAuditLog } = await import('./auditService');
    await createAuditLog({
      action: 'LOGIN',
      module: 'Authentication',
      description: `Successfully signed in with passkey as ${user.email || user.id}`,
      overrideUser: {
        userId: user.id,
        userName: user.email || 'User',
        userRole: profile.account_type || 'unknown'
      }
    });
  } catch {}

  // Register Device Fingerprint
  try {
    const fingerprint = await generateDeviceFingerprint();
    const deviceLabel = getDeviceLabel();
    
    const { error: fpError } = await supabase.from('device_fingerprints').upsert({
      user_id: user.id,
      fingerprint,
      device_label: deviceLabel,
      last_seen_at: new Date().toISOString()
    }, {
      onConflict: 'user_id, fingerprint'
    });

    if (!fpError) {
      await supabase.rpc('increment_device_seen_count', { 
        p_user_id: user.id, 
        p_fingerprint: fingerprint 
      });
    }
  } catch (fpErr) {
    console.warn('[Auth] Error generating device fingerprint for passkey login:', fpErr);
  }

  return { user, profile };
}

/** Backwards-compatible alias for existing student callers */
export async function validatePasskeyStudentSession() {
  const result = await validatePasskeySession('student');
  return result.user;
}

export async function signOut() {
  const supabase = await getClient();
  try {
    const { createAuditLog, clearAuditUserCache } = await import('./auditService');
    await createAuditLog({
      action: 'LOGOUT',
      module: 'Authentication',
      description: 'User signed out'
    });
    clearAuditUserCache();
  } catch {}
  return await supabase.auth.signOut();
}

export async function resetPasswordForEmail(email: string) {
  const supabase = await getClient();
  const normalizedEmail = normalizeEmail(email);
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${window.location.origin}/change-password`,
  });
  if (error) {
    try {
      const { createAuditLog } = await import('./auditService');
      await createAuditLog({
        action: 'PASSWORD_RESET',
        module: 'Authentication',
        description: `Failed to request password reset for ${normalizedEmail}: ${error.message}`,
        overrideUser: { userId: '', userName: normalizedEmail, userRole: 'guest' },
        status: 'failed'
      });
    } catch {}
    throw error;
  }

  try {
    const { createAuditLog } = await import('./auditService');
    await createAuditLog({
      action: 'PASSWORD_RESET',
      module: 'Authentication',
      description: `Requested password reset link for ${email}`,
      overrideUser: { userId: '', userName: email, userRole: 'guest' }
    });
  } catch {}
}
