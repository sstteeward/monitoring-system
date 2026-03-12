import { useEffect, useState } from "react";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import StudentDashboard from "./components/StudentDashboard";
import CoordinatorDashboard from "./components/CoordinatorDashboard";
import AdminDashboard from "./components/AdminDashboard";
import PendingApprovalView from "./components/PendingApprovalView";
import AccountTypePicker from "./components/AccountTypePicker";
import { supabase } from "./lib/supabaseClient";
import { ThemeProvider } from "./contexts/ThemeContext";


function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  // True when the user just created an account and hasn't picked a type yet
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

    // Listen for hash changes
    const onHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  /**
   * A freshly created account (< 2 minutes old) that is still 'student' by
   * default needs the type-picker screen before entering the app.
   */
  const checkNeedsTypePick = (session: any) => {
    const createdAt = session?.user?.created_at;
    if (!createdAt) return;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    // Show type picker only for accounts created within the last 2 minutes
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
        // If they already have a non-default type set, skip the picker
        // (e.g. coordinator approved, or admin)
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
      // Sign them out — coordinator needs admin approval first
      await supabase.auth.signOut();
    } else {
      // Refresh profile so they get routed to their dashboard/onboarding
      await fetchProfile(session.user.id);
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
      {!session
        ? <AuthSignup />
        : needsTypePick
          ? <AccountTypePicker onPick={handleTypePicked} />
          : renderDashboard()
      }
    </ThemeProvider>
  );
}

export default App;