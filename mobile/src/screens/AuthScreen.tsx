import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFinTrackTheme } from '../context/ThemeContext';
import { useAuth, validatePasswordStrength } from '../context/AuthContext';
import { SYSTEM_FONT_STACK, EMERALD_THEME } from '../theme/colors';

type AuthMode = 'SIGN_UP' | 'SIGN_IN';
type AuthMethod = 'EMAIL' | 'PHONE';

export const AuthScreen: React.FC = () => {
  const { palette } = useFinTrackTheme();
  const {
    signInWithEmail,
    signUpWithEmail,
    verifyEmailOtp,
    sendPhoneOtp,
    verifyPhoneOtp,
    isLoading,
    isSupabaseReady,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('SIGN_UP');
  const [method, setMethod] = useState<AuthMethod>('EMAIL');

  // Input fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+91 ');
  const [preferredLanguage, setPreferredLanguage] = useState<'en' | 'hi'>('en');

  // OTP Verification state
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Live password validation
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const isPasswordStrong =
    hasMinLength && hasUppercase && hasNumber && hasSpecialChar;

  // Handle Form Submission
  const handleSubmit = async () => {
    setErrorMsg(null);
    setInfoMsg(null);

    if (method === 'EMAIL') {
      if (!email.trim()) {
        setErrorMsg('Please enter your email address.');
        return;
      }

      if (mode === 'SIGN_UP') {
        const pwValidation = validatePasswordStrength(password);
        if (!pwValidation.isValid) {
          setErrorMsg(pwValidation.error || 'Password does not meet requirements.');
          return;
        }

        const res = await signUpWithEmail(
          fullName.trim() || 'FinTrack User',
          email.trim(),
          password,
          preferredLanguage
        );

        if (res.error) {
          setErrorMsg(res.error);
        } else if (res.requireOtp) {
          setIsVerifyingOtp(true);
          setInfoMsg(`We sent a 6-digit verification code to ${email.trim()}`);
        }
      } else {
        if (!password) {
          setErrorMsg('Please enter your password.');
          return;
        }
        const res = await signInWithEmail(email.trim(), password);
        if (res.error) setErrorMsg(res.error);
      }
    } else {
      // PHONE NUMBER AUTH
      const digits = phoneNumber.replace(/\D/g, '');
      if (digits.length < 10) {
        setErrorMsg('Please enter a valid 10-digit Indian phone number.');
        return;
      }

      const res = await sendPhoneOtp(phoneNumber.trim());
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setIsVerifyingOtp(true);
        setInfoMsg(`OTP sent to ${phoneNumber.trim()}`);
      }
    }
  };

  // Handle OTP Verification
  const handleVerifyOtp = async () => {
    setErrorMsg(null);
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setErrorMsg('Please enter the complete 6-digit OTP code.');
      return;
    }

    if (method === 'EMAIL') {
      const res = await verifyEmailOtp(
        email.trim(),
        otpCode.trim(),
        fullName.trim() || 'FinTrack User',
        password,
        preferredLanguage
      );
      if (res.error) {
        setErrorMsg(res.error);
      }
    } else {
      const res = await verifyPhoneOtp(
        phoneNumber.trim(),
        otpCode.trim(),
        fullName.trim() || 'FinTrack User',
        preferredLanguage
      );
      if (res.error) {
        setErrorMsg(res.error);
      }
    }
  };

  return (
    <SafeAreaView style={styles.outerViewport}>
      <View style={styles.mobileFrame}>
        <ScrollView
          contentContainerStyle={styles.scrollInner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Brand */}
          <View style={styles.brandHeader}>
            <View style={styles.brandLogoCircle}>
              <Ionicons name="wallet-outline" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>FinTrack</Text>
            <Text style={styles.subtitle}>
              Personal Finance & Digital Ledger
            </Text>
          </View>

          {!isSupabaseReady && (
            <View style={styles.checkpointBanner}>
              <Text style={styles.checkpointTitle}>Configuration Required</Text>
              <Text style={styles.checkpointBody}>
                Please check Supabase URL & Key in mobile/.env.
              </Text>
            </View>
          )}

          {/* Card Container */}
          <View style={styles.card}>
            {!isVerifyingOtp ? (
              <>
                {/* 1. Mode Switcher [ Create Account | Sign In ] */}
                <View style={styles.modeTabsRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setMode('SIGN_UP');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    style={[
                      styles.modeTab,
                      mode === 'SIGN_UP' && styles.modeTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeTabText,
                        mode === 'SIGN_UP' && styles.modeTabTextActive,
                      ]}
                    >
                      Create Account
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setMode('SIGN_IN');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    style={[
                      styles.modeTab,
                      mode === 'SIGN_IN' && styles.modeTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeTabText,
                        mode === 'SIGN_IN' && styles.modeTabTextActive,
                      ]}
                    >
                      Sign In
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 2. Method Switcher [ 📧 Email | 📱 Phone (+91) ] */}
                <View style={styles.methodTabsRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setMethod('EMAIL');
                      setErrorMsg(null);
                    }}
                    style={[
                      styles.methodTab,
                      method === 'EMAIL' && styles.methodTabActive,
                    ]}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={14}
                      color={method === 'EMAIL' ? '#0F172A' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.methodTabText,
                        method === 'EMAIL' && styles.methodTabTextActive,
                      ]}
                    >
                      Email & Password
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setMethod('PHONE');
                      setErrorMsg(null);
                    }}
                    style={[
                      styles.methodTab,
                      method === 'PHONE' && styles.methodTabActive,
                    ]}
                  >
                    <Ionicons
                      name="call-outline"
                      size={14}
                      color={method === 'PHONE' ? '#0F172A' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.methodTabText,
                        method === 'PHONE' && styles.methodTabTextActive,
                      ]}
                    >
                      Phone (+91 OTP)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Name Field (Sign Up Only) */}
                {mode === 'SIGN_UP' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="e.g. Mahak Sharma"
                      placeholderTextColor="#94A3B8"
                      style={styles.input}
                    />
                  </View>
                )}

                {/* Method 1: Email + Strong Password */}
                {method === 'EMAIL' ? (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Email Address</Text>
                      <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="youremail@domain.com"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={styles.input}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Password</Text>
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder={
                          mode === 'SIGN_UP'
                            ? 'Min 8 chars, 1 uppercase, 1 number, 1 symbol'
                            : 'Enter your password'
                        }
                        placeholderTextColor="#94A3B8"
                        secureTextEntry
                        style={styles.input}
                      />
                    </View>

                    {/* Strong Password Live Checklist (Sign Up Only) */}
                    {mode === 'SIGN_UP' && password.length > 0 && (
                      <View style={styles.passwordRulesBox}>
                        <Text style={styles.rulesHeader}>Password Requirements:</Text>
                        <View style={styles.ruleItem}>
                          <Ionicons
                            name={hasMinLength ? 'checkmark-circle' : 'ellipse-outline'}
                            size={14}
                            color={hasMinLength ? '#059669' : '#94A3B8'}
                          />
                          <Text
                            style={[
                              styles.ruleText,
                              hasMinLength && styles.ruleTextSuccess,
                            ]}
                          >
                            At least 8 characters
                          </Text>
                        </View>
                        <View style={styles.ruleItem}>
                          <Ionicons
                            name={hasUppercase ? 'checkmark-circle' : 'ellipse-outline'}
                            size={14}
                            color={hasUppercase ? '#059669' : '#94A3B8'}
                          />
                          <Text
                            style={[
                              styles.ruleText,
                              hasUppercase && styles.ruleTextSuccess,
                            ]}
                          >
                            At least 1 uppercase letter (A-Z)
                          </Text>
                        </View>
                        <View style={styles.ruleItem}>
                          <Ionicons
                            name={hasNumber ? 'checkmark-circle' : 'ellipse-outline'}
                            size={14}
                            color={hasNumber ? '#059669' : '#94A3B8'}
                          />
                          <Text
                            style={[
                              styles.ruleText,
                              hasNumber && styles.ruleTextSuccess,
                            ]}
                          >
                            At least 1 number (0-9)
                          </Text>
                        </View>
                        <View style={styles.ruleItem}>
                          <Ionicons
                            name={hasSpecialChar ? 'checkmark-circle' : 'ellipse-outline'}
                            size={14}
                            color={hasSpecialChar ? '#059669' : '#94A3B8'}
                          />
                          <Text
                            style={[
                              styles.ruleText,
                              hasSpecialChar && styles.ruleTextSuccess,
                            ]}
                          >
                            At least 1 special character (!@#$%...)
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  /* Method 2: Phone Number (+91) with OTP */
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Phone Number (+91)</Text>
                    <TextInput
                      value={phoneNumber}
                      onChangeText={setPhoneNumber}
                      placeholder="+91 98765 43210"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      style={styles.input}
                    />
                    <Text style={styles.phoneHint}>
                      We will send a 6-digit OTP code to verify your mobile number.
                    </Text>
                  </View>
                )}

                {/* Language Preference Section (Sign Up Only) */}
                {mode === 'SIGN_UP' && (
                  <View style={styles.langSection}>
                    <Text style={styles.label}>Language Preference / भाषा</Text>
                    <View style={styles.langRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setPreferredLanguage('en')}
                        style={[
                          styles.langBtn,
                          preferredLanguage === 'en' && styles.langBtnActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.langBtnText,
                            preferredLanguage === 'en' && styles.langBtnTextActive,
                          ]}
                        >
                          English
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setPreferredLanguage('hi')}
                        style={[
                          styles.langBtn,
                          preferredLanguage === 'hi' && styles.langBtnActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.langBtnText,
                            preferredLanguage === 'hi' && styles.langBtnTextActive,
                          ]}
                        >
                          हिन्दी (Hindi)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
                {infoMsg && <Text style={styles.infoText}>{infoMsg}</Text>}

                {/* Submit Action Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleSubmit}
                  disabled={isLoading}
                  style={styles.primaryBtn}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {mode === 'SIGN_UP'
                        ? method === 'PHONE'
                          ? 'Send Phone OTP'
                          : 'Sign Up (Verify OTP)'
                        : method === 'PHONE'
                        ? 'Send Login OTP'
                        : 'Sign In'}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              /* OTP VERIFICATION STEP */
              <View style={styles.otpSection}>
                <View style={styles.otpHeaderBox}>
                  <View style={styles.otpIconCircle}>
                    <Ionicons name="shield-checkmark-outline" size={28} color="#059669" />
                  </View>
                  <Text style={styles.otpTitle}>Verify Your OTP</Text>
                  <Text style={styles.otpSubtitle}>
                    Enter the 6-digit verification code sent to{' '}
                    <Text style={{ fontWeight: '700', color: '#0F172A' }}>
                      {method === 'EMAIL' ? email : phoneNumber}
                    </Text>
                  </Text>
                </View>

                <TextInput
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="000000"
                  placeholderTextColor="#CBD5E1"
                  keyboardType="numeric"
                  maxLength={6}
                  style={styles.otpInput}
                  autoFocus
                />

                {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
                {infoMsg && <Text style={styles.infoText}>{infoMsg}</Text>}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleVerifyOtp}
                  disabled={isLoading}
                  style={styles.primaryBtn}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Verify & Continue</Text>
                  )}
                </TouchableOpacity>

                <View style={styles.otpActionsRow}>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={isLoading}
                    style={styles.resendBtn}
                  >
                    <Text style={styles.resendBtnText}>Resend Code</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setIsVerifyingOtp(false);
                      setOtpCode('');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    style={styles.changeContactBtn}
                  >
                    <Text style={styles.changeContactText}>
                      Change {method === 'EMAIL' ? 'Email' : 'Number'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  outerViewport: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mobileFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  scrollInner: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  brandLogoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  checkpointBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  checkpointTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  checkpointBody: {
    fontSize: 11,
    color: '#B45309',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  modeTabsRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    backgroundColor: '#F1F5F9',
    marginBottom: 12,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#0F172A',
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  methodTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  methodTabActive: {
    borderColor: '#0F172A',
    backgroundColor: '#F1F5F9',
  },
  methodTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  methodTabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    fontFamily: SYSTEM_FONT_STACK,
  },
  phoneHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  passwordRulesBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  rulesHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  ruleTextSuccess: {
    color: '#059669',
    fontWeight: '600',
  },
  langSection: {
    marginBottom: 14,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  langBtnActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  langBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  langBtnTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 6,
    marginBottom: 4,
    fontWeight: '600',
  },
  infoText: {
    fontSize: 12,
    color: '#059669',
    marginTop: 6,
    marginBottom: 4,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: SYSTEM_FONT_STACK,
  },
  otpSection: {
    paddingVertical: 6,
  },
  otpHeaderBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  otpIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  otpTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  otpSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: '#059669',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 12,
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 10,
    fontFamily: SYSTEM_FONT_STACK,
    fontVariant: ['tabular-nums'],
    marginVertical: 12,
  },
  otpActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  resendBtn: {
    paddingVertical: 6,
  },
  resendBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  changeContactBtn: {
    paddingVertical: 6,
  },
  changeContactText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
});
