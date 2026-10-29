import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { BASE_API_URL } from '../services/api';

export interface FinTrackUser {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  preferredLanguage: 'HINGLISH' | 'HINDI' | 'ENGLISH';
}

interface AuthContextValue {
  user: FinTrackUser | null;
  isLoading: boolean;
  isSupabaseReady: boolean;
  signInWithEmail: (
    email: string,
    password: string,
    phoneNumber?: string
  ) => Promise<{ error?: string }>;
  signUpWithContactAndGmail: (
    fullName: string,
    phoneNumber: string,
    email: string,
    password: string
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<FinTrackUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          fullName:
            session.user.user_metadata?.full_name || 'FinTrack User',
          phoneNumber:
            session.user.user_metadata?.phone_number || '',
          email: session.user.email || '',
          preferredLanguage: 'HINGLISH',
        });
      }
      setIsLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            fullName:
              session.user.user_metadata?.full_name || 'FinTrack User',
            phoneNumber:
              session.user.user_metadata?.phone_number || '',
            email: session.user.email || '',
            preferredLanguage: 'HINGLISH',
          });
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = async (
    email: string,
    password: string,
    phoneNumber?: string
  ): Promise<{ error?: string }> => {
    if (!supabase) {
      return {
        error:
          'Supabase credentials missing in mobile/.env. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
      };
    }

    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      let { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      // If the user's account was stuck waiting for the broken confirmation email link,
      // auto-confirm via our backend admin endpoint and retry sign-in automatically!
      if (
        error &&
        error.message.toLowerCase().includes('email not confirmed')
      ) {
        await fetch(`${BASE_API_URL}/auth/confirm-existing`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, phoneNumber }),
        });

        const retry = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        error = retry.error;
      }

      if (error) {
        return { error: error.message };
      }
      return {};
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'Sign in failed',
      };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Registers a new account using BOTH Contact Number and Gmail address via
   * `/api/v1/auth/register` (which sets `email_confirm: true` so no broken email link is needed)
   * and logs the user in immediately.
   */
  const signUpWithContactAndGmail = async (
    fullName: string,
    phoneNumber: string,
    email: string,
    password: string
  ): Promise<{ error?: string }> => {
    if (!supabase) {
      return {
        error:
          'Supabase credentials missing in mobile/.env. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
      };
    }

    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phoneNumber.trim();
      const cleanName = fullName.trim() || 'FinTrack User';

      // 1. Register & auto-confirm via Backend Admin API
      const registerRes = await fetch(`${BASE_API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: cleanName,
          phoneNumber: cleanPhone,
          email: cleanEmail,
          password,
        }),
      });

      if (!registerRes.ok) {
        const errJson = await registerRes.json().catch(() => ({}));
        return {
          error:
            errJson.error ||
            `Registration failed with status ${registerRes.status}`,
        };
      }

      // 2. Immediately sign in with the newly confirmed credentials
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInErr) {
        return { error: signInErr.message };
      }

      return {};
    } catch (err: unknown) {
      return {
        error:
          err instanceof Error
            ? `Could not connect to backend server (${BASE_API_URL}): ${err.message}`
            : 'Account creation failed',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSupabaseReady: isSupabaseConfigured,
        signInWithEmail,
        signUpWithContactAndGmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
