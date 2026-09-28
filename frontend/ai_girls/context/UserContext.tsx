"use client";

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { me, updateMe } from '@/lib/auth';

export type UserState = {
  id?: number;
  email?: string;
  displayName?: string;
  plan?: string;
  nsfwEnabled?: boolean;
  isStaff?: boolean;
};

type Ctx = {
  loading: boolean;
  isGuest: boolean;
  user: UserState | null;
  displayName: string;
  plan: string;
  refresh: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  logout: () => void;
};

const UserContext = createContext<Ctx | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserState | null>(null);

  async function refresh() {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const u = await me();
      const next: UserState = {
        id: u?.id,
        email: u?.email,
        displayName: u?.display_name || '',
        plan: u?.plan || 'Free',
        nsfwEnabled: !!u?.nsfw_enabled,
        isStaff: !!u?.is_staff,
      };
      setUser(next);
      try {
        localStorage.setItem('user_plan', next.plan || 'Free');
        localStorage.setItem('user_display_name', next.displayName || '');
      } catch {}
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setDisplayName(name: string) {
    try {
      await updateMe({ display_name: name });
      setUser((u) => ({ ...(u || {}), displayName: name }));
      try { localStorage.setItem('user_display_name', name); } catch {}
    } catch {}
  }

  function logout() {
    try {
      localStorage.clear();
    } catch {}
    setUser(null);
    if (typeof window !== 'undefined') window.location.href = '/login';
  }

  const value = useMemo<Ctx>(() => ({
    loading,
    isGuest: !user,
    user,
    displayName: user?.displayName || 'Guest User',
    plan: user?.plan || 'Free',
    refresh,
    setDisplayName,
    logout,
  }), [loading, user]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
