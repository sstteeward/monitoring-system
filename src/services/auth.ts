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
        },
        { onConflict: 'auth_user_id', ignoreDuplicates: false }
      );
  }

  return signUpData;
}

export async function signIn({ email, password }: { email: string; password: string; }) {
  const supabase = await getClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function resetPasswordForEmail(email: string) {
  const supabase = await getClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw error;
}