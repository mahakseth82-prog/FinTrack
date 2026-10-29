import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { isSupabaseConfigured } from './config/supabase';
import { requireAuth, AuthenticatedRequest } from './middleware/auth';
import {
  rupeesToPaise,
  paiseToRupees,
  formatINR,
  calculatePartialRepayment,
} from './utils/paise';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================================================
// Health Check & Architecture Status Route
// ============================================================================
app.get('/api/health', (_req, res) => {
  res.json({
    app: 'FinTrack Backend API',
    phase: 'Phase 1 — Foundation, Integer Paise Math & Cream/Brown Workspaces',
    status: 'OK',
    supabaseConfigured: isSupabaseConfigured,
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your-gemini')
    ),
    theme: {
      backgroundCream: '#FAF6F0',
      surfaceBeige: '#F3ECE1',
      personalModeBrown: '#6F4E37',
      businessModeMahogany: '#3E2723',
    },
  });
});

// ============================================================================
// Workspace & Profile Bootstrap Endpoint (Personal #6F4E37 vs Business #3E2723)
// ============================================================================
app.get('/api/workspaces', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    userId: req.userId,
    isDemoMode: req.isDemoMode,
    workspaces: [
      {
        id: 'ws-personal-001',
        mode: 'PERSONAL',
        displayName: 'Ghar Ka Khata (Personal)',
        themePrimaryHex: '#6F4E37',
        themeAccentHex: '#C88A4B',
        currencyCode: 'INR',
      },
      {
        id: 'ws-business-001',
        mode: 'BUSINESS',
        displayName: 'Vyapaar Khata (Business)',
        themePrimaryHex: '#3E2723',
        themeAccentHex: '#9C6B30',
        currencyCode: 'INR',
      },
    ],
  });
});

// ============================================================================
// Deterministic Paise Math Verification Endpoint (Rule #1 & Rule #2)
// ============================================================================
app.post('/api/math/repayment-preview', requireAuth, (req, res) => {
  try {
    const { principalRupees, alreadyPaidRupees = 0, newPaymentRupees } = req.body;
    const principalPaise = rupeesToPaise(principalRupees);
    const previousRepaidPaise = rupeesToPaise(alreadyPaidRupees);
    const paymentPaise = rupeesToPaise(newPaymentRupees);

    const calc = calculatePartialRepayment(
      principalPaise,
      previousRepaidPaise,
      paymentPaise
    );

    res.json({
      ...calc,
      formatted: {
        principal: formatINR(calc.principalPaise),
        paymentApplied: formatINR(calc.paymentAppliedPaise),
        newRepaid: formatINR(calc.newRepaidPaise),
        newRemaining: formatINR(calc.newRemainingPaise),
        newRemainingRupees: paiseToRupees(calc.newRemainingPaise),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid calculation input';
    res.status(400).json({ error: message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`☕ FinTrack Backend running on http://localhost:${PORT}`);
  });
}

export default app;

