"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Mail, ArrowRight } from "lucide-react";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setOk(null);
      await forgotPassword(email);
      setOk("Ссылка для восстановления отправлена на вашу почту");
    } catch (e: any) {
      setError(e?.message || "Ошибка отправки");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center p-4">
      <div className="relative w-[560px] h-[420px] max-w-[92vw] rounded-2xl border bg-card shadow-lg overflow-hidden">
        <div className="flex items-center justify-center p-6 h-full">
          <div className="w-full max-w-sm">
              <Link href="/" className="logo-font text-3xl gradient-text leading-tight select-none">syntha</Link>
            <div className="mt-4 text-xl font-semibold">Восстановление пароля</div>
            <div className="mt-1 text-sm text-muted-foreground">Введите email, и мы отправим ссылку для восстановления.</div>

            {error && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2">
                {error}
              </div>
            )}
            {ok && (
              <div className="mt-4 rounded-md border border-emerald-600/30 bg-emerald-600/10 text-emerald-400 text-sm px-3 py-2">
                {ok}
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
              <button disabled={loading} type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50">
                {loading ? 'Отправляем…' : 'Отправить ссылку'} <ArrowRight className="size-4" />
              </button>
            </form>

            <div className="mt-4 text-xs text-muted-foreground">
              Вспомнили пароль? <Link href="/login" className="underline">Войти</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
