import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import StudentDashboard from "./components/StudentDashboard";
import CoordinatorDashboard from "./components/CoordinatorDashboard";
import AdminDashboard from "./components/AdminDashboard";
import PendingApprovalView from "./components/PendingApprovalView";
import AccountTypePicker from "./components/AccountTypePicker";
import { supabase } from "./lib/supabaseClient";
import { ThemeProvider } from "./contexts/ThemeContext";

function AppContent() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [needsTypePick, setNeedsTypePick] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkNeedsTypePick(session);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkNeedsTypePick(session);
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

  const checkNeedsTypePick = (session: any) => {
    const createdAt = session?.user?.created_at;
    if (!createdAt) return;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    if (ageMs < 2 * 60 * 1000) {
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
        if (data.account_type !== 'student') {
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

  if (!session) {
    return <AuthSignup />;
  }

  if (needsTypePick) {
    return <AccountTypePicker onPick={handleTypePicked} />;
  }

  if (profile?.account_type === 'coordinator' && profile?.is_active === false) {
    return <PendingApprovalView />;
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