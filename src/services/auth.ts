// Lazy-load the Supabase client to avoid module import-time crashes when env vars are missing.
async function getClient() {
  try {
    const mod = await import('../lib/supabaseClient');
    return mod.supabase;
  } catch (err) {
    // rethrow with clearer message
    throw new Error('Supabase client failed to initialize. Ensure environment variables are set and the client file is correct.');
  }
}

export async function signUp({ email, password, firstName, middleName, lastName, accountType }: {
  email: string;
  password: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  accountType?: 'student' | 'coordinator' | 'admin';
}) {
  const supabase = await getClient();

  // Sign up the user — the DB trigger `on_auth_user_created` will automatically
  // insert a row into public.profiles, so we don't need to insert manually.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName ?? null,
        middle_name: middleName ?? null,
        last_name: lastName ?? null,
        account_type: accountType ?? 'student',
      },
    },
  });
  if (signUpError) throw signUpError;

  // Supabase triggers sometimes fire before user_metadata is available (e.g. when
  // email confirmation is enabled). Explicitly upsert the account_type to guarantee
  // the profile has the correct value, regardless of trigger timing.
  if (signUpData?.user) {
    const isCoordinator = accountType === 'coordinator';
    await supabase
      .from('profiles')
      .upsert(
        {
          auth_user_id: signUpData.user.id,
          email: email.toLowerCase(),
          first_name: firstName ?? null,
          middle_name: middleName ?? null,
          last_name: lastName ?? null,
          account_type: accountType ?? 'student',
          is_active: isCoordinator ? false : true // Coordinators require admin approval
        },
        { onConflict: 'auth_user_id', ignoreDuplicates: false }
      );
  }

  return signUpData;
}

export async function signIn({ email, password }: { email: string; password: string; }) {
  const supabase = await getClient();

  // 1. Check if user is locked or deactivated BEFORE signing in
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, locked_until, account_type')
    .eq('email', email.toLowerCase())
    .single();

  if (profile) {
    if (profile.is_active === false) {
      if (profile.account_type === 'coordinator') {
        throw new Error("ACCOUNT_PENDING: Your coordinator account is pending approval from an administrator.");
      }
      throw new Error("ACCOUNT_DEACTIVATED: Your account has been deactivated by an admin.");
    }
    if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
      const unlockTime = new Date(profile.locked_until).toLocaleTimeString();
      throw new Error(`ACCOUNT_LOCKED: Too many failed attempts. Try again after ${unlockTime}.`);
    }
  }

  // 2. Attempt login
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // 3. If login fails, increment failed attempts (via RPC, bypassing RLS)
    if (error.message.includes('Invalid login credentials')) {
      await supabase.rpc('increment_failed_login', { user_email: email.toLowerCase() });
    }
    throw error;
  }

  // 4. On success, reset failed attempts
  await supabase.rpc('reset_failed_login', { user_email: email.toLowerCase() });

  return data;
}

export async function resetPasswordForEmail(email: string) {
  const supabase = await getClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/change-password`,
  });
  if (error) throw error;
}