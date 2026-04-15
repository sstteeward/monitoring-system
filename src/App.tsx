import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import StudentDashboard from "./components/StudentDashboard";
import CoordinatorDashboard from "./components/CoordinatorDashboard";
import AdminDashboard from "./components/AdminDashboard";
import PendingApprovalView from "./components/PendingApprovalView";
import AccountTypePicker from "./components/AccountTypePicker";
import UpdatePasswordView from "./components/UpdatePasswordView";
import { supabase } from "./lib/supabaseClient";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DTRCard } from "./components/DTRCard";

function AppContent() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [needsTypePick, setNeedsTypePick] = useState(false);
  const [isRecovery, _setIsRecovery] = useState(false);

  const setIsRecovery = (val: boolean) => {
    _setIsRecovery(val);
    if (val) {
      sessionStorage.setItem('is_recovery', 'true');
    } else {
      sessionStorage.removeItem('is_recovery');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkNeedsTypePick();
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
        checkNeedsTypePick();
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setNeedsTypePick(false);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkNeedsTypePick = () => {
    // Check if this is a fresh signup via the sessionStorage flag
    if (sessionStorage.getItem('just_signed_up') === 'true') {
      setNeedsTypePick(true);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('account_type, is_active')
        .eq('auth_user_id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
        // Only skip the type picker if account type was explicitly set AND the flag is not present
        if (data.account_type !== 'student' && sessionStorage.getItem('just_signed_up') !== 'true') {
          setNeedsTypePick(false);
        }
      }
    } catch (e) {
      console.error("Error fetching profile for routing", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTypePicked = async (type: 'student' | 'coordinator') => {
    if (!session?.user?.id) return;
    const isCoordinator = type === 'coordinator';
    await supabase
      .from('profiles')
      .update({ account_type: type, is_active: isCoordinator ? false : true })
      .eq('auth_user_id', session.user.id);

    // Clear the flag — user has picked their type
    sessionStorage.removeItem('just_signed_up');
    setNeedsTypePick(false);

    if (isCoordinator) {
      await supabase.auth.signOut();
    } else {
      await fetchProfile(session.user.id);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  if (isRecovery) {
    return <UpdatePasswordView onComplete={() => setIsRecovery(false)} />;
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<AuthSignup />} />
        <Route path="/test-dtr" element={
            <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: '20px' }}>
                <DTRCard employeeName="John Doe" department="Engineering" position="Developer" month="April 2026" />
            </div>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (needsTypePick) {
    return (
      <Routes>
        <Route path="/" element={<AccountTypePicker onPick={handleTypePicked} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (profile?.account_type === 'coordinator' && profile?.is_active === false) {
    return (
      <Routes>
        <Route path="/" element={<PendingApprovalView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/admin/*" element={profile?.account_type === 'admin' ? <AdminDashboard /> : <Navigate to="/" />} />
      <Route path="/coordinator/*" element={profile?.account_type === 'coordinator' ? <CoordinatorDashboard /> : <Navigate to="/" />} />
      <Route path="/*" element={
        profile?.account_type === 'admin' ? <Navigate to="/admin" /> :
        profile?.account_type === 'coordinator' ? <Navigate to="/coordinator" /> :
        <StudentDashboard />
      } />
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

  return (
    <ThemeProvider userId={userId}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;