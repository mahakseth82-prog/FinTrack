import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const AuthScreen: React.FC = () => {
  const { palette } = useFinTrackTheme();
  const {
    signInWithEmail,
    signUpWithContactAndGmail,
    isLoading,
    isSupabaseReady,
  } = useAuth();

  const [isSignUp, setIsSignUp] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+91 ');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'hi'>('en');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both your Gmail address and Password.');
      return;
    }

    const digitsOnlyPhone = phoneNumber.replace(/\D/g, '');
    if (digitsOnlyPhone.length < 10) {
      setErrorMsg('Please enter a valid 10-digit Contact Number (+91...).');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (isSignUp) {
      const res = await signUpWithContactAndGmail(
        fullName.trim() || 'FinTrack User',
        phoneNumber.trim(),
        email.trim(),
        password,
        preferredLanguage
      );
      if (res.error) setErrorMsg(res.error);
    } else {
      const res = await signInWithEmail(
        email.trim(),
        password,
        phoneNumber.trim()
      );
      if (res.error) setErrorMsg(res.error);
    }
  };

  return (
    <SafeAreaView style={styles.outerViewport}>
      <View style={styles.mobileFrame}>
        <ScrollView
          contentContainerStyle={styles.scrollInner}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.title, { color: palette.primaryBrown }]}>
            FinTrack
          </Text>
          <Text style={styles.subtitle}>
            Personal Passbook & Digital Udhaar Khata
          </Text>

          {!isSupabaseReady && (
            <View style={styles.checkpointBanner}>
              <Text style={styles.checkpointTitle}>
                Credential Checkpoint Required
              </Text>
              <Text style={styles.checkpointBody}>
                Please add EXPO_PUBLIC_SUPABASE_URL and
                EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.modeTabsRow}>
              <TouchableOpacity
                onPress={() => {
                  setIsSignUp(true);
                  setErrorMsg(null);
                }}
                style={[
                  styles.modeTab,
                  isSignUp && { backgroundColor: palette.primaryBrown },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: isSignUp ? '#FFFFFF' : '#475569',
                  }}
                >
                  Create Account
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setIsSignUp(false);
                  setErrorMsg(null);
                }}
                style={[
                  styles.modeTab,
                  !isSignUp && { backgroundColor: palette.primaryBrown },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: !isSignUp ? '#FFFFFF' : '#475569',
                  }}
                >
                  Sign In
                </Text>
              </TouchableOpacity>
            </View>

            {isSignUp && (
              <>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Enter your name"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
              </>
            )}

            <Text style={styles.label}>Contact Number</Text>
            <TextInput
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+91 9876543210"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              style={styles.input}
            />

            <Text style={styles.label}>Gmail Address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="yourname@gmail.com"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Minimum 6 characters"
              placeholderTextColor="#94A3B8"
              secureTextEntry
              style={styles.input}
            />

            {isSignUp && (
              <View style={styles.langSection}>
                <Text style={styles.label}>Language Preference / भाषा</Text>
                <Text style={styles.langHint}>
                  Voice entries and transaction titles will adhere to this choice.
                </Text>
                <View style={styles.langRow}>
                  <TouchableOpacity
                    onPress={() => setPreferredLanguage('en')}
                    style={[
                      styles.langBtn,
                      preferredLanguage === 'en' && [
                        styles.langBtnActive,
                        { borderColor: palette.primaryBrown, backgroundColor: '#FAF6F0' },
                      ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.langBtnText,
                        preferredLanguage === 'en' && {
                          color: palette.primaryBrown,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      English
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setPreferredLanguage('hi')}
                    style={[
                      styles.langBtn,
                      preferredLanguage === 'hi' && [
                        styles.langBtnActive,
                        { borderColor: palette.primaryBrown, backgroundColor: '#FAF6F0' },
                      ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.langBtnText,
                        preferredLanguage === 'hi' && {
                          color: palette.primaryBrown,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      हिन्दी (Hindi)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isLoading}
              style={[
                styles.primaryBtn,
                { backgroundColor: palette.primaryBrown },
              ]}
            >
              <Text style={styles.primaryBtnText}>
                {isLoading
                  ? 'Verifying...'
                  : isSignUp
                    ? 'Create Account'
                    : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  outerViewport: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  mobileFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
  },
  scrollInner: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 28,
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  checkpointBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    marginBottom: 14,
  },
  checkpointTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  checkpointBody: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  card: {
    width: '100%',
    padding: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modeTabsRow: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  errorText: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 10,
    fontWeight: '600',
  },
  primaryBtn: {
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  langSection: {
    marginTop: 12,
  },
  langHint: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  langBtnActive: {},
  langBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
});
