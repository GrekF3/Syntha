const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000';

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetchJson<T=any>(url: string, opts: RequestInit = {}): Promise<T> {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}), ...authHeaders() } as any;
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type ReferralInvitee = { id: number; email: string; created_at: string };
export async function getReferralCode() { return authFetchJson<{ code: string }>(`${API_BASE}/api/v1/referrals/code/`); }
export async function getReferralSummary() { return authFetchJson<{ total: number; earnings: number }>(`${API_BASE}/api/v1/referrals/summary/`); }
export async function getReferralInvitees() { return authFetchJson<ReferralInvitee[]>(`${API_BASE}/api/v1/referrals/invitees/`); }

