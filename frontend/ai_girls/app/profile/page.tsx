"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { me, updateMe, changePassword, listSessions, revokeSession as apiRevokeSession, revokeOtherSessions, activateSubscription, getDeletionStatus, scheduleDeletion, cancelDeletion } from "@/lib/auth";
import {
  User2,
  ShieldCheck,
  KeyRound,
  CreditCard,
  EyeOff,
  Smartphone,
  LogOut,
} from "lucide-react";
import { toastError, toastSuccess, toastWarning } from "@/lib/toast";

type Session = {
  id: string;
  device: string;
  ip: string;
  lastActive: string;
  current?: boolean;
};

const MOCK_SESSIONS: Session[] = [];

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("Guest User");
  const [email, setEmail] = useState("hello@example.com");
  const [nsfw, setNsfw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [twoFA, setTwoFA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>(MOCK_SESSIONS);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [deletionInfo, setDeletionInfo] = useState<{ scheduled?: boolean; delete_at?: string } | null>(null);
  const [unauth, setUnauth] = useState(false);

  // Change password form
  const [currentPwd, setCurrentPwd] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");

  function formatDateTime(iso?: string) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffH = Math.floor(diffMin / 60);
      const diffD = Math.floor(diffH / 24);
      if (diffMin < 1) return 'Сейчас';
      if (diffMin < 60) return `${diffMin} мин назад`;
      if (diffH < 24) return `${diffH} ч назад`;
      if (diffD === 1) return `Вчера, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return d.toLocaleString();
    } catch { return iso as string; }
  }

  // Load profile from API or show unauth card
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const token = typeof window !== 'undefined' ? localStorage.getItem('jwt') : null;
        if (!token) {
          setUnauth(true);
          return;
        }
        const u = await me();
        if (u?.email) setEmail(u.email);
        if (typeof u?.nsfw_enabled === 'boolean') setNsfw(u.nsfw_enabled);
        if (u?.display_name) setDisplayName(u.display_name);
        if (typeof u?.two_factor_enabled === 'boolean') setTwoFA(!!u.two_factor_enabled);
        try { const ss = await listSessions(); setSessions(ss as any); } catch {}
        try { const di = await getDeletionStatus(); setDeletionInfo(di as any); } catch {}
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pwdMismatch = useMemo(() => pwd.length > 0 && pwd !== pwd2, [pwd, pwd2]);
  const canUpdatePwd = useMemo(() => !!currentPwd && !!pwd && !!pwd2 && !pwdMismatch, [currentPwd, pwd, pwd2, pwdMismatch]);

  async function revokeSession(id: string) {
    try { await apiRevokeSession(id); setSessions((s) => s.filter((x) => x.id !== id)); } catch {}
  }

  async function revokeAllExceptCurrent() {
    try { await revokeOtherSessions(); setSessions((s) => s.filter((x) => x.current)); } catch {}
  }

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {unauth ? (
        <div className="w-full grid place-items-center">
          <div className="w-[520px] max-w-[95vw] rounded-lg border bg-card p-6 text-center">
            <div className="text-xl font-semibold">Профиль доступен после входа</div>
            <div className="mt-1 text-sm text-muted-foreground">Авторизуйтесь или зарегистрируйтесь, чтобы настроить профиль, управлять сессиями и подпиской.</div>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/login" className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90">Войти</Link>
              <Link href="/register" className="rounded-md px-3 py-2 text-sm hover:bg-accent">Зарегистрироваться</Link>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Sticky side nav on desktop */}
      <aside className="md:w-60 md:shrink-0">
        <div className="sticky top-16 space-y-1">
          <a href="#general" className="block rounded-md px-3 py-2 text-sm hover:bg-accent">Общее</a>
          <a href="#nsfw" className="block rounded-md px-3 py-2 text-sm hover:bg-accent">NSFW</a>
          <a href="#security" className="block rounded-md px-3 py-2 text-sm hover:bg-accent">Безопасность</a>
          <a href="#sessions" className="block rounded-md px-3 py-2 text-sm hover:bg-accent">Сессии</a>
          <a href="#subscription" className="block rounded-md px-3 py-2 text-sm hover:bg-accent">Подписка</a>
        </div>
      </aside>

      <main className="flex-1 min-w-0 space-y-4">
        {/* General */}
        <section id="general" className="rounded-lg border bg-card scroll-mt-20">
          <div className="p-3 border-b flex items-center gap-2">
            <User2 className="size-4 text-muted-foreground" />
            <div className="text-sm font-medium">Общее</div>
          </div>
          {loading ? (
            <div className="p-4 grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <div className="h-4 w-48 bg-muted rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                <div className="h-9 w-full bg-muted rounded animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                <div className="h-9 w-full bg-muted rounded animate-pulse" />
                <div className="h-3 w-48 bg-muted/70 rounded animate-pulse" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 grid md:grid-cols-2 gap-4">
                {error && (
                  <div className="md:col-span-2 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
                )}
                <div className="space-y-2">
                  <label className="text-sm">Отображаемое имя</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">Email</label>
                  <input value={email} disabled className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none opacity-70 cursor-not-allowed" />
                  <div className="text-xs text-muted-foreground">Изменение email временно недоступно в интерфейсе.</div>
                </div>
              </div>
              <div className="px-4 pb-4 flex justify-end">
                <button
                  onClick={async () => {
                    try {
                      setSaving(true);
                      setError(null);
                      const updated = await updateMe({ display_name: displayName, nsfw_enabled: nsfw });
                      if (updated?.display_name) localStorage.setItem('user_display_name', updated.display_name);
                      if (updated?.plan) localStorage.setItem('user_plan', updated.plan);
                      toastSuccess('Профиль сохранён');
                    } catch (e: any) {
                      setError(e?.message || 'Ошибка сохранения');
                      toastError('Ошибка сохранения', e?.message);
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            </>
          )}
        </section>

        {/* NSFW */}
        <section id="nsfw" className="rounded-lg border bg-card scroll-mt-20">
          <div className="p-3 border-b flex items-center gap-2">
            <EyeOff className="size-4 text-muted-foreground" />
            <div className="text-sm font-medium">NSFW режим</div>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              <div className="h-4 w-40 bg-muted rounded animate-pulse" />
              <div className="h-5 w-56 bg-muted/70 rounded animate-pulse" />
            </div>
          ) : (
            <div className="p-4 space-y-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="size-4" />
                Разрешать откровенный контент (NSFW)
              </label>
              <div className="text-xs text-muted-foreground">Эта настройка влияет на генерацию изображений и отображение контента.</div>
              <div>
                <button onClick={async () => {
                  try {
                    setSaving(true);
                    setError(null);
                    await updateMe({ nsfw_enabled: nsfw });
                    toastSuccess('Настройка сохранена');
                  } catch (e: any) {
                    setError(e?.message || 'Ошибка сохранения');
                    toastError('Ошибка сохранения', e?.message);
                  } finally {
                    setSaving(false);
                  }
                }} disabled={saving} className="mt-2 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs hover:opacity-90 disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить настройку'}</button>
              </div>
            </div>
          )}
        </section>

        {/* Security */}
        <section id="security" className="rounded-lg border bg-card scroll-mt-20">
          <div className="p-3 border-b flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <div className="text-sm font-medium">Безопасность</div>
          </div>
          <div className="p-4 space-y-4">
            {/* Two-factor */}
            <div className="grid md:grid-cols-3 gap-3 items-start">
              <div className="md:col-span-1 text-sm font-medium">Двухфакторная аутентификация</div>
              <div className="md:col-span-2 text-sm">
                <div className="flex items-center gap-2">
                  <button
                    className={`inline-flex items-center rounded-md px-3 py-2 text-sm ${twoFA ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent'}`}
                    onClick={async () => {
                      try {
                        setSaving(true);
                        await updateMe({ two_factor_enabled: !twoFA } as any);
                        setTwoFA((v) => !v);
                        toastSuccess(!twoFA ? '2FA включена' : '2FA выключена');
                      } catch (e:any) {
                        toastError('Не удалось сохранить', e?.message);
                      } finally { setSaving(false); }
                    }}
                    disabled={saving}
                  >
                    {twoFA ? 'Включена' : 'Выключена'}
                  </button>
                  <div className="text-xs text-muted-foreground">При входе с нового устройства/браузера потребуется одноразовый код.</div>
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="md:col-span-1 text-sm font-medium flex items-center gap-2"><KeyRound className="size-4" /> Смена пароля</div>
              <div className="md:col-span-2 space-y-2">
                <input type="password" placeholder="Текущий пароль" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <input type="password" placeholder="Новый пароль" value={pwd} onChange={(e) => setPwd(e.target.value)} className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <input type="password" placeholder="Повторите пароль" value={pwd2} onChange={(e) => setPwd2(e.target.value)} className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                {pwdMismatch && <div className="text-xs text-destructive">Пароли не совпадают</div>}
                <div className="flex justify-end">
                  <button
                    disabled={!canUpdatePwd}
                    onClick={async () => {
                      try {
                        setSaving(true);
                        setError(null);
                        await changePassword(currentPwd, pwd);
                        setCurrentPwd(""); setPwd(""); setPwd2("");
                        toastSuccess('Пароль обновлён');
                      } catch (e: any) {
                        setError(e?.message || 'Ошибка смены пароля');
                        toastError('Ошибка смены пароля', e?.message);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Обновить пароль
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Sessions */}
        <section id="sessions" className="rounded-lg border bg-card scroll-mt-20">
          <div className="p-3 border-b flex items-center gap-2">
            <Smartphone className="size-4 text-muted-foreground" />
            <div className="text-sm font-medium">Сессии</div>
          </div>
          <div className="p-4 space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-2">Устройство</th>
                    <th className="py-2 pr-2">IP</th>
                    <th className="py-2 pr-2">Активность</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-2 pr-2">{s.device} {s.current && <span className="ml-2 rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px]">Текущая</span>}</td>
                      <td className="py-2 pr-2">{s.ip}</td>
                      <td className="py-2 pr-2">{formatDateTime(s.lastActive)}</td>
                      <td className="py-2 text-right">
                        {!s.current && (
                          <button className="rounded-md px-2 py-1 hover:bg-accent" onClick={async ()=>{ await revokeSession(s.id); toastSuccess('Сессия завершена'); }}>Завершить</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={async ()=>{ await revokeAllExceptCurrent(); toastSuccess('Остальные сессии завершены'); }}><LogOut className="size-4" /> Завершить остальные</button>
            </div>
          </div>
        </section>

        {/* Subscription */}
        <section id="subscription" className="rounded-lg border bg-card scroll-mt-20">
          <div className="p-3 border-b flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <div className="text-sm font-medium">Подписка</div>
          </div>
          <div className="p-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Free plan */}
              <div className="rounded-lg border p-4 bg-card/50">
                <div className="text-sm font-semibold">Free</div>
                <div className="mt-1 text-xs text-muted-foreground">Для знакомства с сервисом</div>
                <div className="mt-3 text-2xl font-bold">0₽<span className="text-sm font-normal text-muted-foreground">/мес</span></div>
                <ul className="mt-3 text-sm space-y-1">
                  <li>• NSFW отключен</li>
                  <li>• До 3 чатов</li>
                  <li>• До 50 сообщений/сутки</li>
                  <li>• Базовая генерация изображений</li>
                </ul>
                <div className="mt-3">
                  <button className="rounded-md px-3 py-2 text-sm hover:bg-accent">Текущий план</button>
                </div>
              </div>
              {/* Pro plan */}
              <div className="rounded-lg border p-4 bg-card">
                <div className="text-sm font-semibold">Pro</div>
                <div className="mt-1 text-xs text-muted-foreground">Для активного использования</div>
                <div className="mt-3 text-2xl font-bold">290₽<span className="text-sm font-normal text-muted-foreground">/мес</span></div>
                <ul className="mt-3 text-sm space-y-1">
                  <li>• NSFW включен</li>
                  <li>• Неограниченные чаты</li>
                  <li>• До 1000 сообщений/сутки</li>
                  <li>• Приоритетная генерация изображений</li>
                </ul>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setSubModalOpen(true)} className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90">Оформить</button>
                  <button className="rounded-md px-3 py-2 text-sm hover:bg-accent">Подробнее</button>
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              Бизнес‑модель: базовый бесплатный доступ с ограничениями по NSFW, количеству чатов и сообщений.
              Подписка Pro за 290₽/мес открывает NSFW, снимает ограничения по чатам, повысит лимиты сообщений и приоритет при генерации.
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-lg border bg-card">
          <div className="p-3 border-b text-sm font-medium">Опасная зона</div>
          <div className="p-4 grid md:grid-cols-3 gap-3 items-center">
            <div className="md:col-span-2 text-sm text-muted-foreground">
              Удаление аккаунта необратимо. Активная подписка будет отменена и аккаунт удалится по её завершению, но не ранее чем через 7 дней.
              {deletionInfo?.scheduled && (
                <div className="mt-1 text-xs">Запланировано удаление: {new Date(deletionInfo.delete_at || '').toLocaleString()}</div>
              )}
            </div>
            <div className="text-right space-x-2">
              {deletionInfo?.scheduled ? (
                <button onClick={async () => { try { await cancelDeletion(); setDeletionInfo({ scheduled: false } as any); } catch {} }} className="rounded-md px-3 py-2 text-sm border hover:bg-accent">Отменить удаление</button>
              ) : (
                <button onClick={async () => { try { const r = await scheduleDeletion('user_requested'); setDeletionInfo(r as any); } catch {} }} className="rounded-md px-3 py-2 text-sm bg-destructive text-white hover:opacity-90">Удалить аккаунт</button>
              )}
            </div>
          </div>
        </section>

        {subModalOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
            <div className="w-[480px] max-w-[95vw] rounded-lg border bg-popover text-popover-foreground p-4">
              <div className="text-lg font-semibold">Оформление подписки Pro</div>
              <div className="mt-2 text-sm text-muted-foreground">Это демонстрационное окно оплаты. Нажмите «Оплатить», чтобы активировать подписку на 30 дней.</div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setSubModalOpen(false)} className="rounded-md px-3 py-2 text-sm hover:bg-accent">Отмена</button>
                <button onClick={async () => { try { const r = await activateSubscription(); localStorage.setItem('user_plan', r.plan); setSubModalOpen(false); } catch {} }} className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90">Оплатить</button>
              </div>
            </div>
          </div>
        )}
      </main>
      </>
      )}
    </div>
  );
}
