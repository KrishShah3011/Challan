import { Center, Loader, Modal } from '@mantine/core';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PasswordForm } from './components/PasswordForm';
import { supabase } from './lib/supabase';
import { Login } from './pages/Login';

/**
 * Shows Login until there is a session. If the session ends while working, the login appears
 * on top of the page instead of replacing it, so nothing on screen is lost.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  const hadSession = useRef(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <Center h="100vh">
        <Loader size="xl" />
      </Center>
    );
  }
  if (session) hadSession.current = true;
  if (!session && !hadSession.current) return <Login />;

  return (
    <>
      {children}
      <Modal opened={!session} onClose={() => undefined} withCloseButton={false} fullScreen title="Please log in again">
        <Login embedded />
      </Modal>
      <Modal opened={recovery && !!session} onClose={() => setRecovery(false)} title="Set a new password">
        <PasswordForm onDone={() => setRecovery(false)} />
      </Modal>
    </>
  );
}
