import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { BASE_API_URL } from '../services/api';

export type AppLanguage = 'en' | 'hi';

export interface FinTrackUser {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  preferredLanguage: AppLanguage;
}

interface AuthContextValue {
  user: FinTrackUser | null;
  isLoading: boolean;
  isSupabaseReady: boolean;
  hasSelectedLanguage: boolean;
  updatePreferredLanguage: (lang: AppLanguage) => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string,
    phoneNumber?: string
  ) => Promise<{ error?: string }>;
  signUpWithContactAndGmail: (
    fullName: string,
    phoneNumber: string,
    email: string,
    password: string,
    preferredLanguage?: AppLanguage
  ) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<FinTrackUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasSelectedLanguage, setHasSelectedLanguage] = useState<boolean>(true);

  const syncUserProfile = async (sessionUser: any) => {
    if (!sessionUser) {
      setUser(null);
      return;
    }

    let prefLang: AppLanguage = 'en';
    let langChosenExplicitly = false;

    try {
      // Check local storage for explicit confirmation
      const localChosen = await AsyncStorage.getItem(`fintrack_lang_chosen_${sessionUser.id}`);
      if (localChosen) {
        langChosenExplicitly = true;
      }

      // Query database for user profile
      if (supabase) {
        const { data: profile } = await supabase
          .from('users_profile')
          .select('preferred_language')
          .eq('id', sessionUser.id)
          .maybeSingle();

        if (profile?.preferred_language) {
          if (profile.preferred_language === 'HINDI' || profile.preferred_language === 'hi') {
            prefLang = 'hi';
            langChosenExplicitly = true;
          } else if (profile.preferred_language === 'ENGLISH' || profile.preferred_language === 'en') {
            prefLang = 'en';
            langChosenExplicitly = true;
          }
        }
      }
    } catch {
      // fallback
    }

    setUser({
      id: sessionUser.id,
      fullName: sessionUser.user_metadata?.full_name || 'FinTrack User',
      phoneNumber: sessionUser.user_metadata?.phone_number || '',
      email: sessionUser.email || '',
      preferredLanguage: prefLang,
    });
    setHasSelectedLanguage(langChosenExplicitly);
  };

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        syncUserProfile(session.user).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          void syncUserProfile(session.user);
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const updatePreferredLanguage = async (lang: AppLanguage) => {
    if (!user) return;

    setUser((prev) => (prev ? { ...prev, preferredLanguage: lang } : null));
    setHasSelectedLanguage(true);

    try {
      await AsyncStorage.setItem(`fintrack_lang_chosen_${user.id}`, lang);

      // Persist to Supabase
      if (supabase) {
        await supabase
          .from('users_profile')
          .update({
            preferred_language: lang === 'hi' ? 'HINDI' : 'ENGLISH',
          })
          .eq('id', user.id);
      }

      // Also persist to backend API
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      if (session?.access_token) {
        await fetch(`${BASE_API_URL}/auth/language`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ preferredLanguage: lang }),
        });
      }
    } catch (err) {
      console.warn('Could not save language preference:', err);
    }
  };

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

  const signUpWithContactAndGmail = async (
    fullName: string,
    phoneNumber: string,
    email: string,
    password: string,
    preferredLanguage: AppLanguage = 'en'
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

      const registerRes = await fetch(`${BASE_API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: cleanName,
          phoneNumber: cleanPhone,
          email: cleanEmail,
          password,
          preferredLanguage,
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
        hasSelectedLanguage,
        updatePreferredLanguage,
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
