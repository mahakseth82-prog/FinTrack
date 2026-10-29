import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, createRlsClient } from '../config/supabase';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  accessToken?: string;
  workspaceId?: string;
  db?: SupabaseClient;
}

/**
 * Strictly verifies the Supabase Bearer JWT token and extracts X-Workspace-Id.
 * Zero dummy user fallbacks or fake tokens allowed.
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
  req.accessToken = token;
  req.workspaceId = workspaceId;
  req.db = createRlsClient(token);
  next();
}
