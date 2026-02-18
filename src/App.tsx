import { useEffect, useState } from "react";
import "./App.css";
import AuthSignup from "./components/AuthSignup";
import Dashboard from "./components/Dashboard";
import { supabase } from "./lib/supabaseClient";

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
    return <div style={{ color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  return (
    <>
      {!session ? <AuthSignup /> : <Dashboard />}
    </>
  );
}

export default App;