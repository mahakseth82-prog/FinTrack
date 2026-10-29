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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Kripya apna Gmail address aur Password dono dalein.');
      return;
    }

    const digitsOnlyPhone = phoneNumber.replace(/\D/g, '');
    if (digitsOnlyPhone.length < 10) {
      setErrorMsg(
        'Kripya apna valid 10-digit Contact Number (+91...) dalein.'
      );
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password kam se kam 6 characters ka hona chahiye.');
      return;
    }

    if (isSignUp) {
      const res = await signUpWithContactAndGmail(
        fullName.trim() || 'FinTrack User',
        phoneNumber.trim(),
        email.trim(),
        password
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
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: palette.backgroundCream },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
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
          {/* Mode Switch Tabs: Create Account vs Sign In */}
          <View
            style={[
              styles.modeTabsRow,
              {
                backgroundColor: palette.pillInactiveBg,
                borderColor: palette.borderLatte,
              },
            ]}
          >
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
                  fontWeight: '800',
                  color: isSignUp
                    ? palette.textOnPrimary
                    : palette.textEspresso,
                }}
              >
                ✨ Create Account
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
                  fontWeight: '800',
                  color: !isSignUp
                    ? palette.textOnPrimary
                    : palette.textEspresso,
                }}
              >
                🔑 Sign In
              </Text>
            </TouchableOpacity>
          </View>

          {isSignUp && (
            <>
              <Text style={[styles.label, { color: palette.textEspresso }]}>
                👤 Aapka Naam (Full Name)
              </Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Aarav Verma"
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

          {/* Contact Number (Required for both Create Account & WhatsApp Reminders) */}
          <Text style={[styles.label, { color: palette.textEspresso }]}>
            📱 Contact Number (WhatsApp / Mobile No.)
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+91 9876543210"
            placeholderTextColor={palette.textMocha}
            keyboardType="phone-pad"
            style={[
              styles.input,
              {
                backgroundColor: palette.surfaceElevated,
                borderColor: palette.borderLatte,
                color: palette.textEspresso,
              },
            ]}
          />

          {/* Gmail Address */}
          <Text style={[styles.label, { color: palette.textEspresso }]}>
            📧 Gmail Address
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="yourname@gmail.com"
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
            🔒 Password (Min 6 characters)
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

          <Text style={[styles.helperNote, { color: palette.receiveSageGreen }]}>
            ✅ Instant Auto-Verification: No email link click needed! Your
            Contact No. & Gmail will be verified immediately.
          </Text>

          {errorMsg && (
            <Text
              style={[styles.errorText, { color: palette.giveTerracottaRed }]}
            >
              ⚠️ {errorMsg}
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
                ? 'Verifying Contact & Gmail...'
                : isSignUp
                  ? 'Create FinTrack Account →'
                  : 'Sign In to FinTrack →'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollInner: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoEmoji: {
    fontSize: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
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
    maxWidth: 440,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
  },
  modeTabsRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    marginBottom: 10,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
  },
  helperNote: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '700',
  },
  primaryBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
