import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';

const router = Router();

export function mapDbLanguageToAppLanguage(dbLang?: string | null): 'en' | 'hi' {
  if (dbLang === 'HINDI' || dbLang === 'hi') {
    return 'hi';
  }
  return 'en';
}

export function mapAppLanguageToDbLanguage(appLang: 'en' | 'hi'): 'ENGLISH' | 'HINDI' {
  return appLang === 'hi' ? 'HINDI' : 'ENGLISH';
}

/**
 * Ensures the user has a `users_profile` row (with phone_number, full_name, and preferred_language)
 * and both `PERSONAL` (#6F4E37) and `BUSINESS` (#3E2723) workspaces in Supabase.
 */
export async function ensureUserProfileAndWorkspaces(params: {
  userId: string;
  fullName: string;
  phoneNumber: string;
  preferredLanguage?: 'en' | 'hi';
}) {
  const dbLang = mapAppLanguageToDbLanguage(params.preferredLanguage || 'en');

  // 1. Upsert users_profile
  await supabaseAdmin.from('users_profile').upsert(
    {
      id: params.userId,
      full_name: params.fullName,
      phone_number: params.phoneNumber,
      preferred_language: dbLang,
      active_mode: 'PERSONAL',
    },
    { onConflict: 'id' }
  );

  // 2. Ensure PERSONAL & BUSINESS workspaces exist
  const { data: existingWs } = await supabaseAdmin
    .from('workspaces')
    .select('id, mode')
    .eq('user_id', params.userId);

  const hasPersonal = existingWs?.some((w) => w.mode === 'PERSONAL');
  const hasBusiness = existingWs?.some((w) => w.mode === 'BUSINESS');

  if (!hasPersonal) {
    const { data: pWs } = await supabaseAdmin
      .from('workspaces')
      .insert({
        user_id: params.userId,
        mode: 'PERSONAL',
        display_name: 'Ghar Ka Khata (Personal)',
        theme_primary_hex: '#6F4E37',
      })
      .select('id')
      .single();

    if (pWs?.id) {
      await supabaseAdmin.from('categories').upsert(
        [
          {
            workspace_id: pWs.id,
            user_id: params.userId,
            name: 'Grocery & Rashan',
            kind: 'EXPENSE',
            icon_name: 'basket-outline',
            color_hex: '#6F4E37',
            is_system: true,
          },
          {
            workspace_id: pWs.id,
            user_id: params.userId,
            name: 'Chai & Dining',
            kind: 'EXPENSE',
            icon_name: 'cafe-outline',
            color_hex: '#C88A4B',
            is_system: true,
          },
          {
            workspace_id: pWs.id,
            user_id: params.userId,
            name: 'Petrol & Travel',
            kind: 'EXPENSE',
            icon_name: 'car-outline',
            color_hex: '#8D5B4C',
            is_system: true,
          },
          {
            workspace_id: pWs.id,
            user_id: params.userId,
            name: 'Salary & Income',
            kind: 'INCOME',
            icon_name: 'wallet-outline',
            color_hex: '#3B7A57',
            is_system: true,
          },
        ],
        { onConflict: 'workspace_id,name,kind' }
      );
    }
  }

  if (!hasBusiness) {
    const { data: bWs } = await supabaseAdmin
      .from('workspaces')
      .insert({
        user_id: params.userId,
        mode: 'BUSINESS',
        display_name: 'Vyapaar Khata (Business)',
        theme_primary_hex: '#3E2723',
      })
      .select('id')
      .single();

    if (bWs?.id) {
      await supabaseAdmin.from('categories').upsert(
        [
          {
            workspace_id: bWs.id,
            user_id: params.userId,
            name: 'Dukaan Stock / Maal',
            kind: 'EXPENSE',
            icon_name: 'cube-outline',
            color_hex: '#3E2723',
            is_system: true,
          },
          {
            workspace_id: bWs.id,
            user_id: params.userId,
            name: 'Counter Bikri (Sales)',
            kind: 'INCOME',
            icon_name: 'cash-outline',
            color_hex: '#3B7A57',
            is_system: true,
          },
        ],
        { onConflict: 'workspace_id,name,kind' }
      );
    }
  }
}

/**
 * POST /api/v1/auth/register
 * Registers a user with BOTH Contact Number and Gmail address, and auto-confirms
 * the account (`email_confirm: true`) so no broken confirmation email link is required.
 */
router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { fullName, phoneNumber, email, password, preferredLanguage } = req.body;

    if (!email || !password || !phoneNumber) {
      res.status(400).json({
        error:
          'Contact Number, Gmail address, and Password are all required to create an account.',
      });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phoneNumber).trim();
    const cleanName = String(fullName || 'FinTrack User').trim();
    const langPref: 'en' | 'hi' = preferredLanguage === 'hi' ? 'hi' : 'en';

    // 1. Try creating auto-confirmed user via Supabase Admin SDK
    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: String(password),
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          phone_number: cleanPhone,
          preferred_language: langPref,
        },
      });

    let userId = created?.user?.id || null;

    // 2. If user already exists (e.g. stuck waiting for email confirmation link),
    // auto-confirm their existing account and update their phone & password!
    if (createError || !userId) {
      const { data: listData, error: listErr } =
        await supabaseAdmin.auth.admin.listUsers();

      if (listErr) {
        res.status(400).json({
          error: createError?.message || listErr.message,
        });
        return;
      }

      const existingUser = listData.users.find(
        (u) => u.email?.toLowerCase() === cleanEmail
      );

      if (!existingUser) {
        res.status(400).json({
          error: createError?.message || 'Could not create user account.',
        });
        return;
      }

      const { data: updated, error: updateErr } =
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
          email_confirm: true,
          password: String(password),
          user_metadata: {
            full_name: cleanName,
            phone_number: cleanPhone,
            preferred_language: langPref,
          },
        });

      if (updateErr || !updated.user) {
        res.status(400).json({
          error: updateErr?.message || 'Failed to confirm existing user account.',
        });
        return;
      }

      userId = updated.user.id;
    }

    // 3. Provision users_profile (with phone_number & preferred_language) + PERSONAL & BUSINESS workspaces
    await ensureUserProfileAndWorkspaces({
      userId,
      fullName: cleanName,
      phoneNumber: cleanPhone,
      preferredLanguage: langPref,
    });

    res.status(201).json({
      userId,
      email: cleanEmail,
      phoneNumber: cleanPhone,
      fullName: cleanName,
      preferredLanguage: langPref,
      autoConfirmed: true,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Account registration failed';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/v1/auth/confirm-existing
 */
router.post('/auth/confirm-existing', async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber, preferredLanguage } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const { data: listData, error: listErr } =
      await supabaseAdmin.auth.admin.listUsers();

    if (listErr) {
      res.status(500).json({ error: listErr.message });
      return;
    }

    const existingUser = listData.users.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    );

    if (!existingUser) {
      res.status(404).json({ error: 'Account not found. Please Sign Up first.' });
      return;
    }

    await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
    });

    await ensureUserProfileAndWorkspaces({
      userId: existingUser.id,
      fullName: existingUser.user_metadata?.full_name || 'FinTrack User',
      phoneNumber:
        phoneNumber || existingUser.user_metadata?.phone_number || '',
      preferredLanguage: preferredLanguage === 'hi' ? 'hi' : 'en',
    });

    res.json({ confirmed: true, userId: existingUser.id });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Could not confirm account';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/v1/auth/profile
 * Returns authenticated user's profile and preferred_language ('en' or 'hi').
 */
router.get('/auth/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: profile, error } = await req.db!
      .from('users_profile')
      .select('id, full_name, phone_number, preferred_language, active_mode')
      .eq('id', req.userId!)
      .single();

    if (error || !profile) {
      res.status(404).json({ error: 'User profile not found' });
      return;
    }

    const appLang = mapDbLanguageToAppLanguage(profile.preferred_language);

    res.json({
      id: profile.id,
      fullName: profile.full_name,
      phoneNumber: profile.phone_number,
      preferredLanguage: appLang,
      activeMode: profile.active_mode,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch user profile';
    res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/v1/auth/language
 * Mandatory Onboarding Language Selection: strictly 'en' or 'hi' only.
 * NO Urdu script / Perso-Arabic alphabet.
 */
router.put('/auth/language', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { preferredLanguage } = req.body;

    if (preferredLanguage !== 'en' && preferredLanguage !== 'hi') {
      res.status(400).json({
        error: "Invalid language selection. FinTrack supports strictly 'en' (English) or 'hi' (हिन्दी) only.",
      });
      return;
    }

    const dbLang = mapAppLanguageToDbLanguage(preferredLanguage);

    const { error } = await req.db!
      .from('users_profile')
      .update({ preferred_language: dbLang })
      .eq('id', req.userId!);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      success: true,
      preferredLanguage,
      message:
        preferredLanguage === 'hi'
          ? 'भाषा सफलतापूर्वक हिन्दी में सेट हो गई है।'
          : 'Language preference saved as English.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update language';
    res.status(500).json({ error: message });
  }
});

export default router;
