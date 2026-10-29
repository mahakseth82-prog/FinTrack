import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { LedgerProvider } from './src/context/LedgerContext';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LedgerProvider>
          <StatusBar style="dark" backgroundColor="#F3ECE1" />
          <RootNavigator />
        </LedgerProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
