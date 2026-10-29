import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export interface FinTrackUser {
  id: string;
  fullName: string;
  email: string;
  preferredLanguage: 'HINGLISH' | 'HINDI' | 'ENGLISH';
}

interface AuthContextValue {
  user: FinTrackUser | null;
  isLoading: boolean;
  isSupabaseReady: boolean;
  signInWithEmail: (
    email: string,
    password: string
  ) => Promise<{ error?: string }>;
  signUpWithEmail: (
    fullName: string,
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        return { error: error.message };
      }
      return {};
    } finally {
      setIsLoading(false);
    }
  };

  const signUpWithEmail = async (
    fullName: string,
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });
      if (error) {
        return { error: error.message };
      }
      return {};
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
        signUpWithEmail,
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
