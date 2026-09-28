"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, User, ArrowRight } from "lucide-react";
import { ApiError, registerUser, me } from "@/lib/auth";

export default function RegisterPage() {
  const search = useSearchParams();
  const refCode = (() => {
    const fromUrl = (search?.get('ref') || search?.get('ref_code') || '').trim();
    if (fromUrl) return fromUrl;
    try { return localStorage.getItem('ref_code') || ''; } catch { return ''; }
  })();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const mismatch = password.length > 0 && password !== password2;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [otpPhase, setOtpPhase] = useState(false);
  const [otp, setOtp] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    try {
      setLoading(true);
      setError(null);
      // First register only; then show OTP
      await (await import('@/lib/auth')).registerOnly?.(email, password, name, refCode || undefined);
      setOtpPhase(true);
    } catch (err: any) {
      if (err?.data?.username) {
        setError('Пользователь с таким email уже зарегистрирован');
      } else if (err?.data?.password) {
        setError(Array.isArray(err.data.password) ? err.data.password[0] : 'Некорректный пароль');
      } else {
        setError(err?.message || "Ошибка регистрации");
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
              <div className="mt-4 text-xl font-semibold">{otpPhase ? 'Подтверждение email' : 'Регистрация'}</div>
              <div className="mt-1 text-sm text-muted-foreground">{otpPhase ? 'Введите одноразовый код из письма' : 'Создайте аккаунт, чтобы начать.'}</div>

              {error && (
                <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2">
                  {error}
                </div>
              )}
              {!otpPhase ? (
              <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div>
              <label className="text-sm">Имя</label>
              <div className="mt-1 flex items-center gap-2 rounded-md bg-input px-3 py-2">
                <User className="size-4 text-muted-foreground" />
                <input value={name} onChange={(e) => setName(e.target.value)} required className="flex-1 bg-transparent outline-none text-sm" placeholder="Ваше имя" />
              </div>
            </div>
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
            <div>
              <label className="text-sm">Повтор пароля</label>
              <div className="mt-1 flex items-center gap-2 rounded-md bg-input px-3 py-2">
                <Lock className="size-4 text-muted-foreground" />
                <input value={password2} onChange={(e) => setPassword2(e.target.value)} type="password" required className="flex-1 bg-transparent outline-none text-sm" placeholder="••••••••" />
              </div>
              {mismatch && <div className="text-xs text-destructive mt-1">Пароли не совпадают</div>}
            </div>
            <button type="submit" disabled={mismatch || loading} className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50">
              {loading ? 'Создаём…' : 'Создать аккаунт'} <ArrowRight className="size-4" />
            </button>
          </form>
              ) : (
                <div className="mt-6 space-y-3">
                  <div>
                    <label className="text-sm">Код подтверждения</label>
                    <div className="mt-1 flex items-center gap-2 rounded-md bg-input px-3 py-2">
                      <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" pattern="[0-9]*" maxLength={6} className="flex-1 bg-transparent outline-none text-sm tracking-widest text-center" placeholder="000000" />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Для тестов используйте 000000</div>
                  </div>
                  <button
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
                    onClick={async () => {
                      if ((otp || '').trim() !== '000000') { setError('Неверный код'); return; }
                      try {
                        const { login, me } = await import('@/lib/auth');
                        await login(email, password);
                        try {
                          const profile = await me();
                          if (profile?.plan) localStorage.setItem('user_plan', profile.plan);
                          if (profile?.display_name) localStorage.setItem('user_display_name', profile.display_name);
                        } catch {}
                        window.location.href = '/c';
                      } catch (e:any) { setError(e?.message || 'Ошибка'); }
                    }}
                  >Подтвердить</button>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-2">
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Регистрация через Google</button>
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-accent">Регистрация через Telegram</button>
              </div>

              <div className="mt-4 text-xs text-muted-foreground">
                Уже есть аккаунт? <Link href="/login" className="underline">Войдите</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
