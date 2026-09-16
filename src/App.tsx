import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import StudentDashboard from "./components/StudentDashboard";
import AdminDashboard from "./components/AdminDashboard";
import CoordinatorDashboard from "./components/CoordinatorDashboard";
import AdviserDashboard from "./components/AdviserDashboard";
import CompanyDashboard from "./components/CompanyDashboard";
import PendingApprovalView from "./components/PendingApprovalView";

import UpdatePasswordView from "./components/UpdatePasswordView";
import { supabase } from './lib/supabaseClient';
import { ThemeProvider } from "./contexts/ThemeContext";
import { DTRCard } from "./components/DTRCard";
import LandingPage from "./components/LandingPage";
import { pushNotificationService } from "./services/pushNotificationService";
import { profileService } from "./services/profileService";
import { getPostAuthRedirect, normalizeAccountType } from "./utils/authRedirect";

function AppContent() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, _setIsRecovery] = useState(false);
  // Reset emails link to this site as ?token_hash=…&type=recovery. Stay on the
  // loading screen until Supabase confirms that token, so the password form can
  // never appear for whatever session this browser already held.
  const [verifyingRecoveryLink, setVerifyingRecoveryLink] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('type') === 'recovery' && Boolean(params.get('token_hash'));
  });

  const setIsRecovery = (val: boolean) => {
    _setIsRecovery(val);
    if (val) {
      sessionStorage.setItem('is_recovery', 'true');
    } else {
      sessionStorage.removeItem('is_recovery');
    }
  };

  const navigate = useNavigate();

  useEffect(() => {
    const recoveryParams = new URLSearchParams(window.location.search);
    const recoveryTokenHash = recoveryParams.get('token_hash');
    if (recoveryParams.get('type') === 'recovery' && recoveryTokenHash) {
      // The email links here rather than to supabase.co, so the recipient only
      // ever sees this site's address. Drop the token from the address bar before
      // confirming it, so it is not left in browser history.
      window.history.replaceState(null, '', window.location.pathname);
      void supabase.auth.verifyOtp({ type: 'recovery', token_hash: recoveryTokenHash }).then(({ error }) => {
        if (error) {
          sessionStorage.setItem('portal_login_error', 'This password reset link is invalid or has expired. Please request a new one.');
          // Hard redirect, like the login error hand-off in AuthSignup: a router
          // navigation from this effect does not reliably land on /login.
          window.location.replace('/login');
          return;
        } else {
          // verifyOtp also emits PASSWORD_RECOVERY; setting it here as well keeps
          // the recovery screen independent of listener timing.
          setIsRecovery(true);
        }
        setVerifyingRecoveryLink(false);
      });
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        // A session present on a cold load means any in-flight portal check from a
        // previous page already resolved — clear a stale hold so we never get stuck
        // on the loading screen (see login_verifying below).
        sessionStorage.removeItem('login_verifying');
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }

      if (window.location.hash.includes('type=recovery') || sessionStorage.getItem('is_recovery') === 'true') {
        setIsRecovery(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
      
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
        // Signed out: any in-flight login attempt is over (this fires when signIn
        // rejects a wrong-portal login and signs the transient session out). Clear
        // the hold here — only ever once session is already null — so releasing it
        // can never expose a dashboard for the rejected session.
        sessionStorage.removeItem('login_verifying');
      }
    });

    // A tab left in the background can outlive a deactivation. Re-check the
    // profile when it comes back into view (skipped while offline, where the
    // lookup would fail and fetchProfile would sign a healthy account out).
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) fetchProfile(session.user.id);
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);



  // Company and admin portals have no pending screen. A deactivated or locked
  // account there is signed out and handed the same copy signIn shows, like the
  // recovery-link hand-off above. The database already refuses its privileged
  // reads; this only keeps an open tab from lingering in the portal.
  const signOutIfPortalBlocked = async (
    p: { account_type?: string | null; is_active?: boolean | null; locked_until?: string | null },
  ): Promise<boolean> => {
    const r = normalizeAccountType(p.account_type);
    if (r !== 'company' && r !== 'admin') return false;
    const isLocked = p.locked_until ? new Date(p.locked_until) > new Date() : false;
    if (p.is_active !== false && !isLocked) return false;

    await supabase.auth.signOut();
    sessionStorage.setItem('portal_login_error', 'ACCOUNT_DEACTIVATED: Your account has been deactivated. Please contact an administrator.');
    window.location.replace('/login');
    return true;
  };

  // Maintenance mode: while it is on, only administrators may stay signed in.
  // Everyone else is signed out and shown the configured message, so nobody is
  // left working in a portal during maintenance. Admins are exempt so they can
  // still turn it back off. system_settings is world-readable by design.
  const signOutIfMaintenance = async (
    p: { account_type?: string | null },
  ): Promise<boolean> => {
    if (normalizeAccountType(p.account_type) === 'admin') return false;
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle();
    // Fail open: a lookup error must not lock everyone out of the app.
    if (error || data?.value?.enabled !== true) return false;

    const message = typeof data.value.message === 'string' && data.value.message.trim()
      ? data.value.message
      : 'The system is undergoing maintenance. Please try again later.';
    await supabase.auth.signOut();
    sessionStorage.setItem('portal_login_error', message);
    window.location.replace('/login');
    return true;
  };

  const fetchProfile = async (userId: string) => {
    try {
      const data = await profileService.getCurrentProfile();

      if (data && data.auth_user_id === userId) {
        if (await signOutIfPortalBlocked(data)) return;
        if (await signOutIfMaintenance(data)) return;
        setProfile(data);
        sessionStorage.removeItem('fresh_registration');
        return;
      }

      // Newly registered users may land before the profile row is readable — retry briefly
      if (sessionStorage.getItem('fresh_registration') === '1') {
        await new Promise(resolve => setTimeout(resolve, 750));
        const retryData = await profileService.getCurrentProfile();

        if (retryData && retryData.auth_user_id === userId) {
          if (await signOutIfPortalBlocked(retryData)) return;
          if (await signOutIfMaintenance(retryData)) return;
          setProfile(retryData);
          sessionStorage.removeItem('fresh_registration');
          return;
        }
      }

      setProfile(null);
      setSession(null);
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } catch (e) {
      console.error("Error fetching profile for routing", e);
      setProfile(null);
      setSession(null);
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    } finally {
      setLoading(false);
    }
  };

  // signInWithPassword creates the session before signIn() finishes its portal/role
  // check. That transient session would otherwise route straight into a dashboard
  // (e.g. an admin briefly landing on /admin) before the check rejects the portal
  // and signs back out. While the check is in flight, keep showing the signed-out
  // view below so the login form stays mounted — a rejected login then surfaces its
  // warning inline, with no dashboard and no loading screen in between. AuthSignup
  // sets login_verifying before the attempt; it is cleared on success, on sign-out,
  // and on cold load.
  const loginVerifying = Boolean(session) && sessionStorage.getItem('login_verifying') === '1';

  if (loading || verifyingRecoveryLink) {
    return <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (isRecovery) {
    return (
      <Routes>
        {/* The destination comes from UpdatePasswordView, which derives it from the
            recovery session's own profile — not from anything in the URL. */}
        <Route path="/change-password" element={<UpdatePasswordView onComplete={(destination) => {
            setIsRecovery(false);
            // Hard replace: drops the recovery hash and any in-memory auth state, and
            // keeps /change-password out of the history stack so it can't be revisited.
            window.location.replace(destination || '/');
        }} />} />
        <Route path="*" element={<Navigate to="/change-password" replace />} />
      </Routes>
    );
  }

  if (!session || loginVerifying) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthSignup />} />
        <Route path="/admin-portal" element={<Navigate to="/login?portal=admin" replace />} />
        <Route path="/test-dtr" element={
            <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: '20px' }}>
                <DTRCard employeeName="John Doe" department="Engineering" position="Developer" month="April 2026" />
            </div>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }



  const isAdviserOnboarded = (p: any): boolean => {
    if (!p) return false;
    return Boolean(p.adviser_type && p.contact_number && p.birthday && (p.region_code || p.address));
  };

  // Compare on the normalized role everywhere so casing/whitespace drift in the DB
  // ("Student" vs "student") cannot knock a user into the wrong portal.
  const role = normalizeAccountType(profile?.account_type);

  // If an Adviser has not completed onboarding yet, route to Adviser Dashboard where AdviserOnboardingView will display
  if (role === 'adviser' && !isAdviserOnboarded(profile)) {
    return (
      <Routes>
        <Route path="/adviser/*" element={<AdviserDashboard />} />
        <Route path="*" element={<Navigate to="/adviser" replace />} />
      </Routes>
    );
  }

  if ((role === 'coordinator' || role === 'adviser') && profile?.is_active === false) {
    return (
      <Routes>
        <Route path="/" element={<PendingApprovalView profile={profile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // A session with no recognizable role has nowhere safe to go — send it back to login
  // rather than letting it fall through into a portal.
  if (!role) {
    console.error('[auth-redirect] Signed-in profile has an unrecognized account_type:', profile?.account_type);
    return (
      <Routes>
        <Route path="*" element={<AuthSignup />} />
      </Routes>
    );
  }

  // The signed-in account's own portal root — used for every unmatched/unauthorized path.
  const homePath = getPostAuthRedirect(role);

  return (
    <Routes>
      <Route path="/admin/*" element={role === 'admin' ? <AdminDashboard /> : <Navigate to={homePath} replace />} />
      <Route path="/coordinator/*" element={role === 'coordinator' ? <CoordinatorDashboard /> : <Navigate to={homePath} replace />} />
      <Route path="/adviser/*" element={role === 'adviser' ? <AdviserDashboard /> : <Navigate to={homePath} replace />} />
      <Route path="/company/*" element={role === 'company' ? <CompanyDashboard /> : <Navigate to={homePath} replace />} />
      <Route path="/student/*" element={role === 'student' ? <StudentDashboard /> : <Navigate to={homePath} replace />} />
      {/* Every other path lands on the signed-in role's own portal. No role falls through
          to another portal — an unknown account_type goes back to login. */}
      <Route path="/*" element={<Navigate to={homePath} replace />} />
    </Routes>
  );
}

function App() {
  const [userId, setUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    void pushNotificationService.syncExistingSubscription(userId).catch((error) => {
      console.warn('Unable to refresh browser push subscription:', error);
    });
  }, [userId]);

  return (
    <ThemeProvider userId={userId}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
