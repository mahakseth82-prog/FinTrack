import { supabase } from './supabase';

const BASE_API_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000/api/v1'
).replace(/\/$/, '');

let currentActiveWorkspaceId: string | null = null;

/**
 * Updates the active workspace ID sent in the `X-Workspace-Id` header on every request.
 */
export function setApiActiveWorkspaceId(workspaceId: string | null): void {
  currentActiveWorkspaceId = workspaceId;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  workspaceId?: string | null;
  body?: unknown;
}

/**
 * Unified FinTrack API Client (`/mobile/src/services/api.ts`)
 * - Points to `http://<BACKEND_HOST>:5000/api/v1`
 * - Automatically injects `Authorization: Bearer <TOKEN>` from Supabase session
 * - Automatically injects `X-Workspace-Id: <WORKSPACE_ID>`
 */
export async function apiFetch<TResponse>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Please add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env'
    );
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Authentication required. Please log in to FinTrack.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    ...(options.headers as Record<string, string>),
  };

  const resolvedWorkspaceId = options.workspaceId ?? currentActiveWorkspaceId;
  if (resolvedWorkspaceId) {
    headers['X-Workspace-Id'] = resolvedWorkspaceId;
  }

  const normalizedPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const response = await fetch(`${BASE_API_URL}${normalizedPath}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.error) {
        errorMessage = errBody.error;
      }
    } catch {
      // Non-JSON error response
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as TResponse;
}

