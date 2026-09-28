export type LoginResult = { access: string; refresh?: string };

export class ApiError extends Error {
  data?: any;
  status?: number;
  constructor(message: string, data?: any, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.data = data;
    this.status = status;
  }
}

// Backend base URL. Default to local Django on 8000; override in env for prod.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const ACCESS_KEY = 'jwt';
const REFRESH_KEY = 'jwt_refresh';

function saveTokens(access?: string, refresh?: string) {
  if (typeof window === 'undefined') return;
  if (access) localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function refreshAccessToken(): Promise<string> {
  const refresh = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
  if (!refresh) throw new ApiError('refresh token missing');
  const res = await fetch(`${API_BASE}/api/v1/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) {
    clearTokens();
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      throw new ApiError(data?.detail || 'refresh failed', data, res.status);
    } catch {
      throw new ApiError(text || 'refresh failed', undefined, res.status);
    }
  }
  const data = (await res.json()) as { access: string };
  saveTokens(data.access);
  return data.access;
}

import { addLoginNotification } from "@/lib/notify";

async function authFetchJson<T = any>(url: string, opts: RequestInit = {}): Promise<T> {
  const doFetch = async () => {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}), ...authHeaders() } as Record<string, string>;
    const res = await fetch(url, { ...opts, headers });
    return res;
  };
  let res = await doFetch();
  if (res.status === 401) {
    try {
      // Try to parse error to see token_not_valid
      let needsRefresh = true;
      try {
        const err = await res.clone().json();
        needsRefresh = err?.code === 'token_not_valid' || String(err?.detail || '').toLowerCase().includes('token');
      } catch {
        // If cannot parse, attempt refresh anyway if we have refresh token
        needsRefresh = !!(typeof window !== 'undefined' && localStorage.getItem(REFRESH_KEY));
      }
      if (needsRefresh) {
        await refreshAccessToken();
        res = await doFetch();
      }
    } catch {
      // failed to refresh — bubble up
    }
  }
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      const firstField = Object.keys(data)[0];
      const firstMsg = Array.isArray(data[firstField]) ? data[firstField][0] : data.detail;
      const msg = (typeof firstMsg === 'string' && firstMsg) || res.statusText || 'Ошибка запроса';
      throw new ApiError(msg, data, res.status);
    } catch {
      throw new ApiError(text || res.statusText, undefined, res.status);
    }
  }
  return res.json();
}

async function api<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      const firstField = Object.keys(data)[0];
      const firstMsg = Array.isArray(data[firstField]) ? data[firstField][0] : data.detail;
      const msg = (typeof firstMsg === 'string' && firstMsg) || res.statusText || 'Ошибка запроса';
      throw new ApiError(msg, data, res.status);
    } catch {
      throw new ApiError(text || res.statusText, undefined, res.status);
    }
  }
  return res.json();
}

export async function login(username: string, password: string) {
  const data = await api<LoginResult>('/api/v1/token/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  saveTokens(data.access, data.refresh);
  try { addLoginNotification(); } catch {}
  return data;
}

export async function registerUser(email: string, password: string, displayName?: string, refCode?: string) {
  // Use email as username for auth; display_name is a non-unique profile field
  const body: any = { username: email, email, password, display_name: displayName || '' };
  if (refCode) body.ref = refCode;
  await api('/api/v1/auth/register/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return login(email, password);
}

// For registration page OTP flow (register only, without immediate login)
export async function registerOnly(email: string, password: string, displayName?: string, refCode?: string) {
  const body: any = { username: email, email, password, display_name: displayName || '' };
  if (refCode) body.ref = refCode;
  await api('/api/v1/auth/register/', { method: 'POST', body: JSON.stringify(body) });
}

export async function me() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  if (!token) throw new Error('not authenticated');
  return authFetchJson(`${API_BASE}/api/v1/users/me/`);
}

export async function updateMe(patch: Partial<{ display_name: string; nsfw_enabled: boolean; two_factor_enabled: boolean }>) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  if (!token) throw new Error('not authenticated');
  return authFetchJson(`${API_BASE}/api/v1/users/me/`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function forgotPassword(email: string) {
  return api('/api/v1/auth/forgot-password/', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function resetPassword(token: string, newPassword: string) {
  return api('/api/v1/auth/reset-password/', { method: 'POST', body: JSON.stringify({ token, new_password: newPassword }) });
}

// Support
export type SupportTicket = { id: number; email?: string; subject: string; message: string; status: 'new'|'in_progress'|'resolved'; created_at: string };
export async function createSupportTicket(subject: string, message: string, email?: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  const res = await fetch(`${API_BASE}/api/v1/support/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ subject, message, email })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function listSupportTickets() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  if (!token) throw new Error('not authenticated');
  const res = await fetch(`${API_BASE}/api/v1/support/`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
export async function updateSupportStatus(id: number, status: 'new'|'in_progress'|'resolved') {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  if (!token) throw new Error('not authenticated');
  const res = await fetch(`${API_BASE}/api/v1/support/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Security & sessions
export async function changePassword(current_password: string, new_password: string) {
  return authFetchJson(`${API_BASE}/api/v1/auth/change-password/`, {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password }),
  });
}

export type SessionInfo = { id: string; device: string; ip: string; lastActive: string; current?: boolean };
export async function listSessions() {
  return authFetchJson<SessionInfo[]>(`${API_BASE}/api/v1/auth/sessions/`);
}
export async function revokeSession(id: string) {
  return authFetchJson(`${API_BASE}/api/v1/auth/sessions/${encodeURIComponent(id)}/revoke/`, { method: 'POST' });
}
export async function revokeOtherSessions() {
  return authFetchJson(`${API_BASE}/api/v1/auth/sessions/revoke-others/`, { method: 'POST' });
}

// Subscription (mock)
export async function activateSubscription() {
  return authFetchJson<{ plan: string; until?: string }>(`${API_BASE}/api/v1/subscription/activate/`, { method: 'POST' });
}
export async function cancelSubscription() {
  return authFetchJson<{ plan: string }>(`${API_BASE}/api/v1/subscription/cancel/`, { method: 'POST' });
}

// Account deletion scheduling
export async function getDeletionStatus() {
  return authFetchJson(`${API_BASE}/api/v1/account/delete/status/`);
}
export async function scheduleDeletion(reason?: string) {
  return authFetchJson(`${API_BASE}/api/v1/account/delete/`, { method: 'POST', body: JSON.stringify({ reason: reason || '' }) });
}
export async function cancelDeletion() {
  return authFetchJson(`${API_BASE}/api/v1/account/delete/cancel/`, { method: 'POST' });
}

// Admin-only helpers
export type AdminUser = { id: number; username: string; email?: string; display_name?: string; plan?: string; is_staff?: boolean; nsfw_enabled?: boolean };
export async function listUsersAdmin() {
  return authFetchJson<AdminUser[]>(`${API_BASE}/api/v1/users/`);
}
export async function setUserPlanAdmin(userId: number, plan: 'free'|'pro') {
  return authFetchJson(`${API_BASE}/api/v1/users/${userId}/set_plan/`, { method: 'POST', body: JSON.stringify({ plan }) });
}

// Notifications API
export type NotificationItem = { id: number; title: string; body?: string; created_at: string; unread?: boolean; action?: { label: string; href?: string } };
export async function listNotifications(): Promise<NotificationItem[]> {
  return authFetchJson(`${API_BASE}/api/v1/notifications/`);
}
export async function markNotificationRead(id: number) {
  return authFetchJson(`${API_BASE}/api/v1/notifications/${id}/read/`, { method: 'POST' });
}
export async function deleteNotification(id: number) {
  return authFetchJson(`${API_BASE}/api/v1/notifications/${id}/`, { method: 'DELETE' });
}
export async function broadcastNotificationAll(payload: { title: string; body?: string; action_label?: string; action_href?: string }) {
  return authFetchJson(`${API_BASE}/api/v1/admin/notifications/broadcast/`, { method: 'POST', body: JSON.stringify(payload) });
}
