import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const AuthScreen: React.FC = () => {
  const { palette } = useFinTrackTheme();
  const {
    signInWithEmail,
    signUpWithEmail,
    isLoading,
    isSupabaseReady,
  } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both your email and password.');
      return;
    }

    if (isSignUp) {
      const res = await signUpWithEmail(
        fullName.trim() || 'FinTrack User',
        email.trim(),
        password
      );
      if (res.error) setErrorMsg(res.error);
    } else {
      const res = await signInWithEmail(email.trim(), password);
      if (res.error) setErrorMsg(res.error);
    }
  };

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: palette.backgroundCream },
      ]}
    >
      <View style={styles.inner}>
        <View
          style={[
            styles.logoBadge,
            { backgroundColor: palette.primaryBrown },
          ]}
        >
          <Text style={[styles.logoEmoji, { color: palette.textOnPrimary }]}>
            🎙️
          </Text>
        </View>

        <Text style={[styles.title, { color: palette.textEspresso }]}>
          FinTrack
        </Text>
        <Text style={[styles.subtitle, { color: palette.textMocha }]}>
          AI-Powered Voice Expense Tracker & Digital Udhaar Khata
        </Text>

        {!isSupabaseReady && (
          <View
            style={[
              styles.checkpointBanner,
              {
                backgroundColor: palette.giveTerracottaTint,
                borderColor: palette.giveTerracottaRed,
              },
            ]}
          >
            <Text
              style={[
                styles.checkpointTitle,
                { color: palette.giveTerracottaRed },
              ]}
            >
              🛑 Credential Checkpoint Required
            </Text>
            <Text
              style={[
                styles.checkpointBody,
                { color: palette.textEspresso },
              ]}
            >
              Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
              in mobile/.env to connect your live Supabase database.
            </Text>
          </View>
        )}

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          {isSignUp && (
            <>
              <Text style={[styles.label, { color: palette.textEspresso }]}>
                Aapka Naam (Full Name)
              </Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={palette.textMocha}
                style={[
                  styles.input,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderColor: palette.borderLatte,
                    color: palette.textEspresso,
                  },
                ]}
              />
            </>
          )}

          <Text style={[styles.label, { color: palette.textEspresso }]}>
            Email Address
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={palette.textMocha}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[
              styles.input,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
                color: palette.textEspresso,
              },
            ]}
          />

          <Text style={[styles.label, { color: palette.textEspresso }]}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={palette.textMocha}
            secureTextEntry
            style={[
              styles.input,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
                color: palette.textEspresso,
              },
            ]}
          />

          {errorMsg && (
            <Text
              style={[styles.errorText, { color: palette.giveTerracottaRed }]}
            >
              {errorMsg}
            </Text>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading}
            style={[
              styles.primaryBtn,
              { backgroundColor: palette.primaryBrown },
            ]}
          >
            <Text
              style={[styles.primaryBtnText, { color: palette.textOnPrimary }]}
            >
              {isLoading
                ? 'Authenticating...'
                : isSignUp
                  ? 'Create FinTrack Account →'
                  : 'Sign In to FinTrack →'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSignUp((prev) => !prev)}
            style={styles.switchModeBtn}
          >
            <Text style={[styles.switchModeText, { color: palette.primaryBrown }]}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : 'New to FinTrack? Create an Account'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  checkpointBanner: {
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  checkpointTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  checkpointBody: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  card: {
    width: '100%',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  primaryBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  switchModeBtn: {
    marginTop: 14,
    alignItems: 'center',
  },
  switchModeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
