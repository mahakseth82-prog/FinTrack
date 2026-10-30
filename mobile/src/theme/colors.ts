/**
 * FinTrack — Enterprise Fintech Design System (Mercury / Stripe / Brex Aesthetic)
 *
 * Base Aesthetic:
 *   - Background: Crisp Off-White / Slate (#F8FAFC)
 *   - Cards & Surfaces: Pure White (#FFFFFF)
 *   - Borders & Dividers: Subtle Slate (#E2E8F0)
 *   - Primary Text: Dark Charcoal (#0F172A)
 *   - Secondary Text: Muted Slate (#64748B)
 *
 * Workspace Mode Palettes:
 *   1. PERSONAL MODE: Slate Indigo (#4338CA / #312E81)
 *   2. BUSINESS MODE: Deep Slate Teal (#0F766E)
 */

export type WorkspaceMode = 'PERSONAL' | 'BUSINESS';

export const SYSTEM_FONT_STACK: string | undefined = undefined;

export interface FinTrackPalette {
  mode: WorkspaceMode;
  modeTitle: string;
  modeSubtitle: string;
  workspaceId: string;

  // Base Surfaces
  backgroundCream: string;
  surfaceBeige: string;
  surfaceElevated: string;
  borderLatte: string;

  // Mode-Specific Accents
  primaryBrown: string;
  primaryBrownDark: string;
  accentWarm: string;
  pillActiveBg: string;
  pillInactiveBg: string;

  // Text Colors
  textEspresso: string;
  textMocha: string;
  textOnPrimary: string;

  // Semantic Financial Colors
  receiveSageGreen: string;      // Income / Receipt (#065F46)
  receiveSageTint: string;
  giveTerracottaRed: string;     // Expense / Receivable (#991B1B)
  giveTerracottaTint: string;
  warningAmber: string;
  warningAmberTint: string;
}

const SHARED_ENTERPRISE_BASE = {
  backgroundCream: '#F8FAFC',
  surfaceBeige: '#FFFFFF',
  surfaceElevated: '#F8FAFC',
  borderLatte: '#E2E8F0',
  textEspresso: '#0F172A',
  textMocha: '#64748B',
  textOnPrimary: '#FFFFFF',
  receiveSageGreen: '#065F46',
  receiveSageTint: '#ECFDF5',
  giveTerracottaRed: '#991B1B',
  giveTerracottaTint: '#FEF2F2',
  warningAmber: '#B45309',
  warningAmberTint: '#FFFBEB',
};

export const EMERALD_THEME = {
  emeraldGreen: '#059669',
  emeraldGreenDark: '#047857',
  emeraldGreenLight: '#10B981',
  emeraldPastel: '#ECFDF5',
  emeraldTint: '#F0FDF4',
  alertRed: '#EF4444',
  alertRedTint: '#FEF2F2',
  warningOrange: '#F59E0B',
  warningOrangeTint: '#FFFBEB',
};

export const PERSONAL_THEME: FinTrackPalette = {
  ...SHARED_ENTERPRISE_BASE,
  mode: 'PERSONAL',
  modeTitle: 'Personal Workspace',
  modeSubtitle: 'Transactions & Monthly Budgets',
  workspaceId: 'ws-personal-001',
  primaryBrown: '#059669',      // Emerald Green Primary
  primaryBrownDark: '#047857',
  accentWarm: '#10B981',
  pillActiveBg: '#059669',
  pillInactiveBg: '#F1F5F9',
};

export const BUSINESS_THEME: FinTrackPalette = {
  ...SHARED_ENTERPRISE_BASE,
  mode: 'BUSINESS',
  modeTitle: 'Business Workspace',
  modeSubtitle: 'Credit & Receivables Ledger',
  workspaceId: 'ws-business-001',
  primaryBrown: '#0F766E',      // Deep Slate Teal
  primaryBrownDark: '#115E59',
  accentWarm: '#0D9488',
  pillActiveBg: '#0F766E',
  pillInactiveBg: '#F1F5F9',
};
