import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  WorkspaceMode,
  FinTrackPalette,
  PERSONAL_THEME,
  BUSINESS_THEME,
} from '../theme/colors';

interface ThemeContextValue {
  mode: WorkspaceMode;
  palette: FinTrackPalette;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setMode] = useState<WorkspaceMode>('PERSONAL');

  const value = useMemo<ThemeContextValue>(() => {
    const palette = mode === 'PERSONAL' ? PERSONAL_THEME : BUSINESS_THEME;
    return {
      mode,
      palette,
      setMode,
      toggleMode: () =>
        setMode((prev) => (prev === 'PERSONAL' ? 'BUSINESS' : 'PERSONAL')),
    };
  }, [mode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useFinTrackTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useFinTrackTheme must be used inside ThemeProvider');
  }
  return ctx;
}

