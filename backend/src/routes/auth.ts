import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

/**
 * Ensures the user has a `users_profile` row (with both phone_number and full_name)
 * and both `PERSONAL` (#6F4E37) and `BUSINESS` (#3E2723) workspaces in Supabase.
 */
export async function ensureUserProfileAndWorkspaces(params: {
  userId: string;
  fullName: string;
  phoneNumber: string;
}) {
  // 1. Upsert users_profile
  await supabaseAdmin.from('users_profile').upsert(
    {
      id: params.userId,
      full_name: params.fullName,
      phone_number: params.phoneNumber,
      preferred_language: 'HINGLISH',
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
 * Also auto-confirms existing unconfirmed accounts if the user already tried signing up.
 */
router.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { fullName, phoneNumber, email, password } = req.body;

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

    // 1. Try creating auto-confirmed user via Supabase Admin SDK
    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: String(password),
        email_confirm: true,
        user_metadata: {
          full_name: cleanName,
          phone_number: cleanPhone,
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

    // 3. Provision users_profile (with phone_number) + PERSONAL & BUSINESS workspaces
    await ensureUserProfileAndWorkspaces({
      userId,
      fullName: cleanName,
      phoneNumber: cleanPhone,
    });

    res.status(201).json({
      userId,
      email: cleanEmail,
      phoneNumber: cleanPhone,
      fullName: cleanName,
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
 * Auto-confirms an unconfirmed email account if a user tries to Sign In
 * before clicking the broken localhost confirmation link.
 */
router.post('/auth/confirm-existing', async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber } = req.body;
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
    });

    res.json({ confirmed: true, userId: existingUser.id });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Could not confirm account';
    res.status(500).json({ error: message });
  }
});

export default router;

