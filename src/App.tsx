import { useEffect, useState } from "react";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import StudentDashboard from "./components/StudentDashboard";
import CoordinatorDashboard from "./components/CoordinatorDashboard";
import AdminDashboard from "./components/AdminDashboard";
import PendingApprovalView from "./components/PendingApprovalView";
import { supabase } from "./lib/supabaseClient";
import { ThemeProvider } from "./contexts/ThemeContext";


function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
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
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Listen for hash changes
    const onHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('account_type, is_active')
        .eq('auth_user_id', userId)
        .single();

      if (!error && data) {
        setProfile(data);
      }
    } catch (e) {
      console.error("Error fetching profile for routing", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  // Determine which dashboard to show based on account type or hash slug
  const renderDashboard = () => {
    // If coordinator is inactive, show pending approval screen
    if (profile?.account_type === 'coordinator' && profile?.is_active === false) {
      return <PendingApprovalView />;
    }

    // Priority: Hash Slugs (Override)
    if (currentHash === '#/admin') {
      return <AdminDashboard />;
    }
    if (currentHash === '#/coordinator') {
      return <CoordinatorDashboard />;
    }

    // Default: Account Type
    if (profile?.account_type === 'admin') {
      return <AdminDashboard />;
    }
    if (profile?.account_type === 'coordinator') {
      return <CoordinatorDashboard />;
    }
    return <StudentDashboard />;
  };

  return (
    <ThemeProvider>
      {!session ? <AuthSignup /> : renderDashboard()}
    </ThemeProvider>
  );
}

export default App;