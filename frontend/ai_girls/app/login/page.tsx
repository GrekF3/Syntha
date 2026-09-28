"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Mail, Lock, ArrowRight, Github } from "lucide-react";
import { ApiError, login, me } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      // username = email for now
      await login(email, password);
      try {
        const profile = await me();
        if (profile?.plan) localStorage.setItem('user_plan', profile.plan);
        if (profile?.display_name) localStorage.setItem('user_display_name', profile.display_name);
      } catch {}
      window.location.href = "/c";
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('No active account')) {
        setError('Неверный email или пароль');
      } else {
        setError(msg || 'Ошибка входа');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center p-4">
      <div className="relative w-[1000px] h-[680px] max-w-[95vw] rounded-2xl border bg-card shadow-lg overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 h-full">
          {/* Left image in card (hidden on mobile) */}
          <div className="relative hidden md:block">
            <Image src="/girl.jpg" alt="girl" fill priority className="object-cover" />
          </div>
          {/* Right form side */}
          <div className="flex items-center justify-center p-8">
            <div className="w-full max-w-sm">
              <Link href="/" className="logo-font text-3xl gradient-text leading-tight select-none">syntha</Link>
              <div className="mt-4 text-xl font-semibold">Вход</div>
              <div className="mt-1 text-sm text-muted-foreground">Добро пожаловать! Войдите в аккаунт для продолжения.</div>

              {error && (
                <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2">
                  {error}
                </div>
              )}
              <form onSubmit={onSubmit} className="mt-6 space-y-3">
                <div>
                  <label className="text-sm">Email</label>
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-input px-3 py-2">
                    <Mail className="size-4 text-muted-foreground" />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="flex-1 bg-transparent outline-none text-sm" placeholder="hello@example.com" />
                  </div>
                </div>
                <div>
                  <label className="text-sm">Пароль</label>
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-input px-3 py-2">
                    <Lock className="size-4 text-muted-foreground" />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="flex-1 bg-transparent outline-none text-sm" placeholder="••••••••" />
                  </div>
                </div>
                <button disabled={loading} type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50">
                  {loading ? 'Входим…' : 'Войти'} <ArrowRight className="size-4" />
                </button>
              </form>

              <div className="mt-6 grid grid-cols-2 gap-2">
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Войти через Google</button>
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Войти через Telegram</button>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <Link href="/register" className="underline">Создать аккаунт</Link>
                <Link href="/forgot-password" className="underline">Забыли пароль?</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
