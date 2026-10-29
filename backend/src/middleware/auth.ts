import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userFullName?: string;
  userPhone?: string;
  accessToken?: string;
  workspaceId?: string;
  db?: SupabaseClient;
}

/**
 * Strictly verifies the Supabase Bearer JWT token and extracts X-Workspace-Id.
 * Uses `supabaseAdmin` after JWT verification so missing table GRANTs on the
 * `authenticated` role never block verified requests.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error:
        'Unauthorized: Missing Authorization Bearer token. Please sign in via Supabase Auth.',
    });
    return;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({
      error: 'Unauthorized: Invalid or expired Supabase JWT token.',
    });
    return;
  }

  const workspaceHeader = req.headers['x-workspace-id'];
  const workspaceId =
    typeof workspaceHeader === 'string' && workspaceHeader.trim().length > 0
      ? workspaceHeader.trim()
      : undefined;

  req.userId = data.user.id;
  req.userEmail = data.user.email || '';
  req.userFullName = data.user.user_metadata?.full_name || 'FinTrack User';
  req.userPhone = data.user.user_metadata?.phone_number || '';
  req.accessToken = token;
  req.workspaceId = workspaceId;
  req.db = supabaseAdmin;
  next();
}
