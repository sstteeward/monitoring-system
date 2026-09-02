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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
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
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);



  const fetchProfile = async (userId: string) => {
    try {
      const data = await profileService.getCurrentProfile();

      if (data && data.auth_user_id === userId) {
        setProfile(data);
        sessionStorage.removeItem('fresh_registration');
        return;
      }

      // Newly registered users may land before the profile row is readable — retry briefly
      if (sessionStorage.getItem('fresh_registration') === '1') {
        await new Promise(resolve => setTimeout(resolve, 750));
        const retryData = await profileService.getCurrentProfile();

        if (retryData && retryData.auth_user_id === userId) {
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

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (isRecovery) {
    return (
      <Routes>
        <Route path="/change-password" element={<UpdatePasswordView onComplete={() => {
            setIsRecovery(false);
            navigate('/login', { replace: true });
        }} />} />
        <Route path="*" element={<Navigate to="/change-password" replace />} />
      </Routes>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthSignup />} />
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
