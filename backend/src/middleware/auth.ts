import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin, isSupabaseConfigured } from '../config/supabase';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  accessToken?: string;
  isDemoMode?: boolean;
}

/**
 * Verifies the user's Supabase Bearer token or allows safe local Demo Mode
 * while the beginner user is setting up their .env keys.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const demoUserHeader = req.headers['x-fintrack-demo-user'] as string | undefined;

  // Allow explicit demo user header or fallback when Supabase is not yet configured
  if (!isSupabaseConfigured || demoUserHeader === 'demo-user-001') {
    req.userId = '00000000-0000-0000-0000-000000000001';
    req.isDemoMode = true;
    next();
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing Bearer token. Please log in to FinTrack.',
    });
    return;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!supabaseAdmin) {
    res.status(500).json({ error: 'Supabase client is not initialized.' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }

  req.userId = data.user.id;
  req.accessToken = token;
  req.isDemoMode = false;
  next();
}

