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
  const { signInWithDemo, signInWithEmail, isLoading } = useAuth();
  const [name, setName] = useState('Aarav Verma');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEmailLogin = async () => {
    setErrorMsg(null);
    if (!email.trim()) {
      signInWithDemo(name.trim() || 'FinTrack User');
      return;
    }
    const res = await signInWithEmail(email.trim(), password);
    if (res.error) {
      setErrorMsg(res.error);
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

        <View
          style={[
            styles.card,
            {
              backgroundColor: palette.surfaceBeige,
              borderColor: palette.borderLatte,
            },
          ]}
        >
          <Text style={[styles.label, { color: palette.textEspresso }]}>
            Aapka Naam (Your Name)
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
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

          <Text style={[styles.label, { color: palette.textEspresso }]}>
            Email (Optional for Cloud Sync)
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

          {email.trim().length > 0 && (
            <>
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
            </>
          )}

          {errorMsg && (
            <Text style={[styles.errorText, { color: palette.giveTerracottaRed }]}>
              {errorMsg}
            </Text>
          )}

          <TouchableOpacity
            onPress={handleEmailLogin}
            disabled={isLoading}
            style={[
              styles.primaryBtn,
              { backgroundColor: palette.primaryBrown },
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: palette.textOnPrimary }]}>
              {isLoading ? 'Opening Khata...' : 'Enter FinTrack →'}
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
    marginBottom: 24,
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
});

