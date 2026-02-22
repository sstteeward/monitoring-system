import { useEffect, useState } from "react";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import StudentDashboard from "./components/StudentDashboard";
import CoordinatorDashboard from "./components/CoordinatorDashboard"; // Will build next
import { supabase } from "./lib/supabaseClient";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('account_type')
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

  // Determine which dashboard to show based on account type
  const renderDashboard = () => {
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