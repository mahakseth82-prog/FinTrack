import React, { createContext, useContext, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';

export interface FinTrackUser {
  id: string;
  fullName: string;
  phoneOrEmail: string;
  preferredLanguage: 'HINGLISH' | 'HINDI' | 'ENGLISH';
  isDemoUser: boolean;
}

interface AuthContextValue {
  user: FinTrackUser | null;
  isLoading: boolean;
  signInWithDemo: (name?: string) => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<FinTrackUser | null>({
    id: '00000000-0000-0000-0000-000000000001',
    fullName: 'Aarav Verma',
    phoneOrEmail: '+91 98765 43210',
    preferredLanguage: 'HINGLISH',
    isDemoUser: !isSupabaseConfigured,
  });
  const [isLoading, setIsLoading] = useState(false);

  const signInWithDemo = (name = 'Aarav Verma') => {
    setUser({
      id: '00000000-0000-0000-0000-000000000001',
      fullName: name,
      phoneOrEmail: '+91 98765 43210',
      preferredLanguage: 'HINGLISH',
      isDemoUser: true,
    });
  };

  const signInWithEmail = async (
    email: string,
    password: string
  ): Promise<{ error?: string }> => {
    if (!supabase) {
      signInWithDemo(email.split('@')[0] || 'FinTrack User');
      return {};
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.user) {
        return { error: error?.message || 'Login failed' };
      }
      setUser({
        id: data.user.id,
        fullName: data.user.user_metadata?.full_name || 'FinTrack User',
        phoneOrEmail: data.user.email || email,
        preferredLanguage: 'HINGLISH',
        isDemoUser: false,
      });
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
      value={{ user, isLoading, signInWithDemo, signInWithEmail, signOut }}
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

