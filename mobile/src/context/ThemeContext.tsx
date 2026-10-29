import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
} from 'react';
import {
  WorkspaceMode,
  FinTrackPalette,
  PERSONAL_THEME,
  BUSINESS_THEME,
} from '../theme/colors';
import { setApiActiveWorkspaceId } from '../services/api';

interface ThemeContextValue {
  mode: WorkspaceMode;
  palette: FinTrackPalette;
  activeWorkspaceId: string | null;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
  registerBackendWorkspaces: (
    workspaces: { id: string; mode: WorkspaceMode }[]
  ) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [mode, setMode] = useState<WorkspaceMode>('PERSONAL');
  const [workspaceMap, setWorkspaceMap] = useState<
     Partial<Record<WorkspaceMode, string>>
  >({});

  const activeWorkspaceId = workspaceMap[mode] || null;

  useEffect(() => {
    setApiActiveWorkspaceId(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const registerBackendWorkspaces = (
    workspaces: { id: string; mode: WorkspaceMode }[]
  ) => {
    const nextMap: Partial<Record<WorkspaceMode, string>> = {};
    for (const ws of workspaces) {
      nextMap[ws.mode] = ws.id;
    }
    setWorkspaceMap(nextMap);
  };

  const value = useMemo<ThemeContextValue>(() => {
    const basePalette = mode === 'PERSONAL' ? PERSONAL_THEME : BUSINESS_THEME;
    const palette: FinTrackPalette = {
      ...basePalette,
      workspaceId: activeWorkspaceId || '',
    };
    return {
      mode,
      palette,
      activeWorkspaceId,
      setMode,
      toggleMode: () =>
        setMode((prev) => (prev === 'PERSONAL' ? 'BUSINESS' : 'PERSONAL')),
      registerBackendWorkspaces,
    };
  }, [mode, activeWorkspaceId]);

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
