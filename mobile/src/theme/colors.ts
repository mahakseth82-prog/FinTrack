/**
 * FinTrack — Warm Cream/Beige & Rich Brown Design System
 *
 * Base Aesthetic:
 *   - Background: Soft Warm Cream (#FAF6F0)
 *   - Cards & Surfaces: Rich Sand / Warm Beige (#F3ECE1)
 *   - Borders & Dividers: Latte Border (#E2D5C3)
 *   - Primary Text: Deep Espresso (#2C1E16)
 *   - Secondary Text: Muted Mocha (#7A6352)
 *
 * Workspace Mode Palettes (Rule #3: Strictly Separated Modes):
 *   1. PERSONAL MODE: Warm Coffee Brown (#6F4E37) + Caramel Accent (#C88A4B)
 *   2. BUSINESS MODE: Deep Mahogany Brown (#3E2723) + Antique Bronze Accent (#9C6B30)
 */

export type WorkspaceMode = 'PERSONAL' | 'BUSINESS';

export interface FinTrackPalette {
  mode: WorkspaceMode;
  modeTitle: string;
  modeSubtitle: string;
  workspaceId: string;

  // Base Cream/Beige Surfaces
  backgroundCream: string;
  surfaceBeige: string;
  surfaceElevated: string;
  borderLatte: string;

  // Mode-Specific Browns
  primaryBrown: string;
  primaryBrownDark: string;
  accentWarm: string;
  pillActiveBg: string;
  pillInactiveBg: string;

  // Text Colors
  textEspresso: string;
  textMocha: string;
  textOnPrimary: string;

  // Semantic Financial Colors (Harmonized with Cream & Brown)
  receiveSageGreen: string;      // You Will Get / Wapas Mila / Income
  receiveSageTint: string;       // Right Chat Bubble / Positive Badge Bg
  giveTerracottaRed: string;     // You Will Give / Udhaar Diya / Expense
  giveTerracottaTint: string;    // Left Chat Bubble / Overdue Badge Bg
  warningAmber: string;          // Due Today / 80%+ Budget Warning
  warningAmberTint: string;
}

const SHARED_CREAM_BASE = {
  backgroundCream: '#FAF6F0',
  surfaceBeige: '#F3ECE1',
  surfaceElevated: '#FFFDF9',
  borderLatte: '#E2D5C3',
  textEspresso: '#2C1E16',
  textMocha: '#7A6352',
  textOnPrimary: '#FAF6F0',
  receiveSageGreen: '#3B7A57',
  receiveSageTint: '#E6F2EB',
  giveTerracottaRed: '#B84A39',
  giveTerracottaTint: '#F9E6E2',
  warningAmber: '#B7791F',
  warningAmberTint: '#FDF3DC',
};

export const PERSONAL_THEME: FinTrackPalette = {
  ...SHARED_CREAM_BASE,
  mode: 'PERSONAL',
  modeTitle: 'Ghar Ka Khata',
  modeSubtitle: 'Personal Expenses, Budget & Friends Udhaar',
  workspaceId: 'ws-personal-001',
  primaryBrown: '#6F4E37',      // Warm Coffee Roast
  primaryBrownDark: '#543927',
  accentWarm: '#C88A4B',        // Warm Caramel
  pillActiveBg: '#6F4E37',
  pillInactiveBg: '#EAE0D2',
};

export const BUSINESS_THEME: FinTrackPalette = {
  ...SHARED_CREAM_BASE,
  mode: 'BUSINESS',
  modeTitle: 'Vyapaar Khata',
  modeSubtitle: 'Customer & Supplier Digital Udhaar Ledger',
  workspaceId: 'ws-business-001',
  primaryBrown: '#3E2723',      // Deep Mahogany / Dark Cocoa
  primaryBrownDark: '#271714',
  accentWarm: '#9C6B30',        // Antique Bronze
  pillActiveBg: '#3E2723',
  pillInactiveBg: '#E6DBD0',
};

