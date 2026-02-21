import { useEffect, useState } from "react";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import Dashboard from "./components/Dashboard";
import { supabase } from "./lib/supabaseClient";
import { ThemeProvider } from "./contexts/ThemeContext";

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  return (
    <ThemeProvider>
      {!session ? <AuthSignup /> : <Dashboard />}
    </ThemeProvider>
  );
}

export default App;