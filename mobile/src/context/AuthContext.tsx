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

export function validatePasswordStrength(password: string): {
  isValid: boolean;
  error?: string;
} {
  if (!password || password.length < 8) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters long.',
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least 1 uppercase letter (A-Z).',
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      error: 'Password must contain at least 1 number (0-9).',
    };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return {
      isValid: false,
      error:
        'Password must contain at least 1 special character (!@#$%^&*...).',
    };
  }
  return { isValid: true };
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
  signUpWithEmail: (
    fullName: string,
    email: string,
    password: string,
    preferredLanguage?: AppLanguage
  ) => Promise<{ error?: string; requireOtp?: boolean }>;
  verifyEmailOtp: (
    email: string,
    token: string,
    fullName: string,
    password?: string,
    preferredLanguage?: AppLanguage
  ) => Promise<{ error?: string }>;
  sendPhoneOtp: (phoneNumber: string) => Promise<{ error?: string }>;
  verifyPhoneOtp: (
    phoneNumber: string,
    token: string,
    fullName?: string,
    preferredLanguage?: AppLanguage
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
      const localChosen = await AsyncStorage.getItem(
        `fintrack_lang_chosen_${sessionUser.id}`
      );
      if (localChosen) {
        langChosenExplicitly = true;
      }

      if (supabase) {
        const { data: profile } = await supabase
          .from('users_profile')
          .select('preferred_language, phone_number, full_name')
          .eq('id', sessionUser.id)
          .maybeSingle();

        if (profile?.preferred_language) {
          if (
            profile.preferred_language === 'HINDI' ||
            profile.preferred_language === 'hi'
          ) {
            prefLang = 'hi';
            langChosenExplicitly = true;
          } else if (
            profile.preferred_language === 'ENGLISH' ||
            profile.preferred_language === 'en'
          ) {
            prefLang = 'en';
            langChosenExplicitly = true;
          }
        }

        setUser({
          id: sessionUser.id,
          fullName:
            profile?.full_name ||
            sessionUser.user_metadata?.full_name ||
            'FinTrack User',
          phoneNumber:
            profile?.phone_number ||
            sessionUser.phone ||
            sessionUser.user_metadata?.phone_number ||
            '',
          email: sessionUser.email || '',
          preferredLanguage: prefLang,
        });
        setHasSelectedLanguage(langChosenExplicitly);
        return;
      }
    } catch {
      // fallback
    }

    setUser({
      id: sessionUser.id,
      fullName: sessionUser.user_metadata?.full_name || 'FinTrack User',
      phoneNumber:
        sessionUser.phone || sessionUser.user_metadata?.phone_number || '',
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

      if (supabase) {
        await supabase
          .from('users_profile')
          .update({
            preferred_language: lang === 'hi' ? 'HINDI' : 'ENGLISH',
          })
          .eq('id', user.id);
      }

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

  const signUpWithEmail = async (
    fullName: string,
    email: string,
    password: string,
    preferredLanguage: AppLanguage = 'en'
  ): Promise<{ error?: string; requireOtp?: boolean }> => {
    if (!supabase) {
      return {
        error: 'Supabase credentials missing in mobile/.env.',
      };
    }

    // Strong password check
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.isValid) {
      return { error: pwCheck.error };
    }

    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim() || 'FinTrack User';

      // 1. Dispatch Supabase sign up (which sends confirmation OTP)
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            preferred_language: preferredLanguage,
          },
        },
      });

      if (error) {
        return { error: error.message };
      }

      // If already has session without confirmation requirement, sync
      if (data?.session?.user) {
        await syncUserProfile(data.session.user);
        return { requireOtp: false };
      }

      // Requires OTP verification
      return { requireOtp: true };
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'Sign up request failed',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmailOtp = async (
    email: string,
    token: string,
    fullName: string,
    password?: string,
    preferredLanguage: AppLanguage = 'en'
  ): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();

      // 1. Try Supabase Auth client verification
      if (supabase) {
        const { data, error } = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: token.trim(),
          type: 'signup',
        });

        if (data?.session?.user) {
          await syncUserProfile(data.session.user);
          return {};
        }

        // Try 'email' type as well
        const retry = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: token.trim(),
          type: 'email',
        });

        if (retry.data?.session?.user) {
          await syncUserProfile(retry.data.session.user);
          return {};
        }
      }

      // 2. Call backend verification endpoint
      const res = await fetch(`${BASE_API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          otp: token.trim(),
          fullName,
          password,
          preferredLanguage,
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: resJson.error || 'OTP verification failed' };
      }

      // If user provided password, sign in to establish supabase session
      if (password && supabase) {
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
      }

      return {};
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'OTP verification error',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const sendPhoneOtp = async (
    phoneNumber: string
  ): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      let cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
      if (!cleanPhone.startsWith('+')) {
        cleanPhone = `+91${cleanPhone.replace(/^0+/, '')}`;
      }

      if (cleanPhone.length < 12) {
        return { error: 'Please enter a valid 10-digit Indian phone number (+91).' };
      }

      // 1. Try Supabase Auth signInWithOtp
      if (supabase) {
        const { error } = await supabase.auth.signInWithOtp({
          phone: cleanPhone,
        });
        if (error) {
          console.warn('Supabase SMS OTP warning:', error.message);
        }
      }

      // Also notify backend
      await fetch(`${BASE_API_URL}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone }),
      }).catch(() => {});

      return {};
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'Failed to send phone OTP',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyPhoneOtp = async (
    phoneNumber: string,
    token: string,
    fullName?: string,
    preferredLanguage: AppLanguage = 'en'
  ): Promise<{ error?: string }> => {
    setIsLoading(true);
    try {
      let cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
      if (!cleanPhone.startsWith('+')) {
        cleanPhone = `+91${cleanPhone.replace(/^0+/, '')}`;
      }

      // 1. Try Supabase Client verifyOtp
      if (supabase) {
        const { data, error } = await supabase.auth.verifyOtp({
          phone: cleanPhone,
          token: token.trim(),
          type: 'sms',
        });

        if (data?.session?.user) {
          await syncUserProfile(data.session.user);
          return {};
        }
      }

      // 2. Fallback to backend verification
      const res = await fetch(`${BASE_API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: cleanPhone,
          otp: token.trim(),
          fullName: fullName || 'FinTrack User',
          preferredLanguage,
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: resJson.error || 'Invalid OTP code' };
      }

      if (resJson.userId) {
        setUser({
          id: resJson.userId,
          fullName: resJson.fullName || fullName || 'FinTrack User',
          phoneNumber: resJson.phoneNumber || cleanPhone,
          email: resJson.email || '',
          preferredLanguage: resJson.preferredLanguage || preferredLanguage,
        });
        setHasSelectedLanguage(false); // Direct to onboarding language selection modal
      }

      return {};
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err.message : 'Failed to verify phone OTP',
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
        error: 'Supabase credentials missing in mobile/.env.',
      };
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.isValid) {
      return { error: pwCheck.error };
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
        signUpWithEmail,
        verifyEmailOtp,
        sendPhoneOtp,
        verifyPhoneOtp,
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
