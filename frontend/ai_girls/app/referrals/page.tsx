"use client";

import { useEffect, useMemo, useState } from "react";
import { getReferralCode, getReferralInvitees, getReferralSummary, type ReferralInvitee } from "@/lib/referrals";

export default function ReferralsPage() {
  const [code, setCode] = useState<string>("");
  const [invites, setInvites] = useState<ReferralInvitee[]>([]);
  const [summary, setSummary] = useState<{ total: number; earnings: number }>({ total: 0, earnings: 0 });
  const [copied, setCopied] = useState(false);
  const link = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return code ? `${origin}/register?ref=${encodeURIComponent(code)}` : '';
  }, [code]);
  useEffect(() => { (async () => { try { const c = await getReferralCode(); setCode(c.code); } catch {} })(); }, []);
  useEffect(() => { (async () => { try { const s = await getReferralSummary(); setSummary(s); } catch {} })(); }, []);
  useEffect(() => { (async () => { try { const list = await getReferralInvitees(); setInvites(list); } catch {} })(); }, []);

  return (
    <div className="space-y-6">
      {/* HERO */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="text-2xl sm:text-3xl font-bold">Приглашайте друзей — получайте до 30%</div>
          <div className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Делитесь своей реферальной ссылкой и получайте до 30% от каждого пополнения баланса приглашённого пользователя. Начисления происходят автоматически после оплаты. Чем больше приглашённых — тем больше вы зарабатываете.
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-background p-3">
              <div className="text-xs text-muted-foreground">Ваша ссылка</div>
              <div className="mt-1 flex items-center gap-2">
                <input readOnly value={link} className="flex-1 rounded-md bg-input px-3 py-2 text-sm outline-none" />
                <button
                  className="shrink-0 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
                  onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(()=>setCopied(false), 1500); } catch {} }}
                  disabled={!code}
                >
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
              </div>
            </div>
            <div className="rounded-lg border bg-background p-3 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Приглашено</div>
                <div className="text-2xl font-bold mt-0.5">{summary.total}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Доход</div>
                <div className="text-2xl font-bold mt-0.5">{summary.earnings ? summary.earnings.toLocaleString() + ' ₽' : '—'}</div>
              </div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">Начисления будут активированы после подключения платёжной системы. TODO: привязать платёжный шлюз и расчёт вознаграждений.</div>
        </div>
      </section>

      {/* Invitees */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="text-sm font-medium">Приглашённые пользователи</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2 pr-2">Email</th>
                  <th className="py-2 pr-2">Дата</th>
                </tr>
              </thead>
              <tbody>
                {invites.length === 0 ? (
                  <tr><td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">Пока никого</td></tr>
                ) : invites.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="py-2 pr-2">{it.email}</td>
                    <td className="py-2 pr-2">{new Date(it.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Payouts placeholder */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="text-sm font-medium">Вывод средств</div>
          <div className="mt-2 text-sm text-muted-foreground">После интеграции платежной системы вы сможете настроить реквизиты и выводить вознаграждение. TODO: форма реквизитов и запрос вывода.</div>
          <div className="mt-3">
            <button className="rounded-md bg-primary/40 text-primary-foreground/80 px-3 py-2 text-sm cursor-not-allowed" disabled>Запросить вывод (скоро)</button>
          </div>
        </div>
      </section>
    </div>
  );
}

