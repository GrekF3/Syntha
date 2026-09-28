"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Users, ImageIcon, Filter, ChevronLeft, ChevronRight, Shield, Wallet } from "lucide-react";
import { useEffect } from "react";
import { listSupportTickets, updateSupportStatus, listUsersAdmin, setUserPlanAdmin, type SupportTicket, type AdminUser } from "@/lib/auth";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { listImagesAll, listImagesPaged, markImageNSFW } from "@/lib/chats";
import { type AppNotification, emitNotification } from "@/lib/notify";

type User = { id: string; email: string; role: "user" | "admin"; status: "active" | "banned"; plan: "free" | "pro"; expiresAt?: string };
type ImageItem = { id: string; src: string; email: string; model: string; nsfw: boolean; date: string };

export default function AdminPage() {
  const router = useRouter();
  const userCtx = useUser();
  const [users, setUsers] = useState<User[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imgCount, setImgCount] = useState(0);
  const [imgLoading, setImgLoading] = useState(false);
  const stats = useMemo(() => ({ users: users.length, images: images.length, revenue: 0, expenses: 0 }), [users.length, images.length]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<'all'|'new'|'in_progress'|'resolved'>('all');
  // Notification broadcast states
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [notifBtnLabel, setNotifBtnLabel] = useState("");
  const [notifBtnHref, setNotifBtnHref] = useState("");
  useEffect(() => {
    if (!userCtx.user?.isStaff) return;
    (async () => {
      try { const data = await listSupportTickets(); setTickets(data); } catch {}
      try {
        const us = await listUsersAdmin();
        const mapped: User[] = us.map((u) => ({ id: String(u.id), email: u.email || u.username, role: u.is_staff ? 'admin' : 'user', status: 'active', plan: (u.plan as any) || 'free' }));
        setUsers(mapped);
      } catch {}
      try {
        // initial page fetch (paged)
        setImgLoading(true);
        const { results, count } = await listImagesPaged({ page: 1, page_size: 8 });
        const mapped: ImageItem[] = results.map((im) => ({ id: String(im.id), src: im.url, email: '', model: im.model ? String(im.model) : '', nsfw: !!im.nsfw, date: new Date(im.created_at).toISOString().slice(0,10) }));
        setImages(mapped);
        setImgCount(count);
      } catch {}
      finally { setImgLoading(false); }
    })();
  }, [userCtx.user?.isStaff]);

  // Рендерим контент условно ниже, чтобы не ломать порядок хуков

  // Users state (filters, paging, selection)
  const [userQuery, setUserQuery] = useState("");
  const [userRole, setUserRole] = useState<"all" | "user" | "admin">("all");
  const [userStatus, setUserStatus] = useState<"all" | "active" | "banned">("all");
  const [userPlan, setUserPlan] = useState<"all" | "free" | "pro">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const filteredUsers = useMemo(() => {
    return users.filter((u) =>
      (userRole === "all" || u.role === userRole) &&
      (userStatus === "all" || u.status === userStatus) &&
      (userPlan === "all" || u.plan === userPlan) &&
      (!userQuery || u.email.toLowerCase().includes(userQuery.toLowerCase()))
    );
  }, [userQuery, userRole, userStatus, userPlan, users]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const usersPage = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {};
    usersPage.forEach((u) => (next[u.id] = checked));
    setSelected((prev) => ({ ...prev, ...next }));
  };
  const selection = Object.keys(selected).filter((k) => selected[k]);

  // Reports removed (no API wired yet)

  // Subscription dialog
  const [subUser, setSubUser] = useState<User | null>(null);
  const [subPlan, setSubPlan] = useState<"free" | "pro">("pro");
  const [subExtendMonths, setSubExtendMonths] = useState<number>(1);
  function applySubscription() {
    if (!subUser) return;
    (async () => {
      try {
        await setUserPlanAdmin(parseInt(subUser.id, 10), subPlan);
        setUsers((arr) => arr.map((u) => (u.id === subUser.id ? { ...u, plan: subPlan, expiresAt: subPlan === 'free' ? undefined : u.expiresAt } : u)));
      } catch {}
      setSubUser(null);
    })();
  }

  // Images filters & paging
  const [imgQuery, setImgQuery] = useState("");
  const [imgNSFW, setImgNSFW] = useState<"all" | "safe" | "nsfw">("all");
  const [imgPage, setImgPage] = useState(1);
  const imgPageSize = 8;
  const imgTotalPages = Math.max(1, Math.ceil(imgCount / imgPageSize));
  // Cache pages in sessionStorage to avoid reloading
  function cacheKey(p: number, q: string, f: string) { return `admin_imgs_v1:${p}:${imgPageSize}:${f}:${q}`; }
  function canCacheImagesPage(items: ImageItem[]) {
    // Do not cache pages that contain data URLs (too large for sessionStorage)
    return items.every((it) => !it.src.startsWith('data:'));
  }
  function safeSetCache(key: string, payload: any) {
    try {
      const json = JSON.stringify(payload);
      // avoid huge entries
      if (json.length > 200_000) return; // ~200KB per page cap
      sessionStorage.setItem(key, json);
    } catch (e: any) {
      // On quota errors, clear our own cache namespace and skip
      const msg = String(e?.name || e?.message || '');
      if (msg.includes('QuotaExceededError')) {
        try {
          const keys = Object.keys(sessionStorage);
          keys.filter((k) => k.startsWith('admin_imgs_v1:')).forEach((k) => sessionStorage.removeItem(k));
        } catch {}
      }
    }
  }
  async function loadImagesPage(p: number, q: string, f: 'all'|'safe'|'nsfw') {
    const key = cacheKey(p, q, f);
    const cached = sessionStorage.getItem(key);
    if (cached) {
      try {
        const parsed: { items: ImageItem[]; count: number } = JSON.parse(cached);
        setImages(parsed.items);
        setImgCount(parsed.count);
        return;
      } catch {}
    }
    setImgLoading(true);
    try {
      const { results, count } = await listImagesPaged({ page: p, page_size: imgPageSize, q, nsfw: f });
      const mapped: ImageItem[] = results.map((im) => ({ id: String(im.id), src: im.url, email: '', model: im.model ? String(im.model) : '', nsfw: !!im.nsfw, date: new Date(im.created_at).toISOString().slice(0,10) }));
      setImages(mapped);
      setImgCount(count);
      if (canCacheImagesPage(mapped)) {
        safeSetCache(key, { items: mapped, count });
      }
      // prefetch next page into cache
      const total = Math.max(1, Math.ceil(count / imgPageSize));
      const nextPage = p + 1;
      if (nextPage <= total) {
        const nextKey = cacheKey(nextPage, q, f);
        if (!sessionStorage.getItem(nextKey)) {
          listImagesPaged({ page: nextPage, page_size: imgPageSize, q, nsfw: f }).then(({results}) => {
            const nextMapped: ImageItem[] = results.map((im) => ({ id: String(im.id), src: im.url, email: '', model: im.model ? String(im.model) : '', nsfw: !!im.nsfw, date: new Date(im.created_at).toISOString().slice(0,10) }));
            if (canCacheImagesPage(nextMapped)) safeSetCache(nextKey, { items: nextMapped, count });
          }).catch(()=>{});
        }
      }
    } finally {
      setImgLoading(false);
    }
  }
  useEffect(() => { if (userCtx.user?.isStaff) loadImagesPage(imgPage, imgQuery.trim(), imgNSFW); }, [imgPage, imgQuery, imgNSFW, userCtx.user?.isStaff]);
  async function toggleImageNSFW(id: string) {
    try {
      await markImageNSFW(id);
      setImages((arr) => arr.map((i) => i.id === id ? { ...i, nsfw: true } : i));
      const key = cacheKey(imgPage, imgQuery.trim(), imgNSFW);
      const cached = sessionStorage.getItem(key);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          parsed.items = (parsed.items || []).map((i: ImageItem) => i.id === id ? { ...i, nsfw: true } : i);
          sessionStorage.setItem(key, JSON.stringify(parsed));
        } catch {}
      }
    } catch {}
  }

  return (
    (userCtx.loading || userCtx.isGuest || !userCtx.user?.isStaff) ? (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="text-center max-w-md">
          <div className="logo-font text-4xl gradient-text">syntha</div>
          <div className="mt-3 text-2xl font-semibold">Страница не найдена</div>
          <div className="mt-1 text-sm text-muted-foreground">Эта страница недоступна.</div>
          <div className="mt-4">
            <a href="/" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">На главную</a>
          </div>
        </div>
      </div>
    ) : (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Админ‑панель</div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2"><Users className="size-4" /> Пользователи</div>
          <div className="text-2xl font-bold mt-1">{stats.users}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2"><ImageIcon className="size-4" /> Изображения</div>
          <div className="text-2xl font-bold mt-1">{stats.images}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2"><Wallet className="size-4" /> Доход</div>
          <div className="text-2xl font-bold mt-1">{stats.revenue ? stats.revenue.toLocaleString() + ' ₽' : '—'}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2"><Wallet className="size-4" /> Расходы</div>
          <div className="text-2xl font-bold mt-1">{stats.expenses ? stats.expenses.toLocaleString() + ' ₽' : '—'}</div>
        </div>
      </div>

      {/* Оповещение для всех пользователей */}
      <div className="rounded-lg border bg-card p-3">
        <div className="text-sm font-medium">Оповещение для всех пользователей</div>
        <div className="mt-2 grid md:grid-cols-4 gap-2 items-start">
          <input
            className="rounded-md bg-input px-3 py-2 text-sm text-foreground outline-none"
            placeholder="Заголовок"
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
          />
          <input
            className="rounded-md bg-input px-3 py-2 text-sm text-foreground outline-none"
            placeholder="Текст (опционально)"
            value={notifBody}
            onChange={(e) => setNotifBody(e.target.value)}
          />
          <input
            className="rounded-md bg-input px-3 py-2 text-sm text-foreground outline-none"
            placeholder="Текст кнопки (опц.)"
            value={notifBtnLabel}
            onChange={(e) => setNotifBtnLabel(e.target.value)}
          />
          <input
            className="rounded-md bg-input px-3 py-2 text-sm text-foreground outline-none"
            placeholder="Ссылка кнопки (опц.)"
            value={notifBtnHref}
            onChange={(e) => setNotifBtnHref(e.target.value)}
          />
          <div className="md:col-span-4 md:text-right">
            <button
              className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90"
              onClick={async () => {
                const title = notifTitle.trim();
                const body = notifBody.trim();
                const label = notifBtnLabel.trim();
                const href = notifBtnHref.trim();
                if (!title) {
                  window.dispatchEvent(new CustomEvent('app:toast', { detail: { variant: 'error', title: 'Укажите заголовок' } }));
                  return;
                }
                try {
                  await (await import('@/lib/auth')).broadcastNotificationAll({ title, body: body || undefined, action_label: label || undefined, action_href: href || undefined });
                } catch {
                  // fallback to local event to at least see it on this device
                  try {
                    const n: AppNotification = {
                      id: `adm-${Date.now()}`,
                      title,
                      body: body || undefined,
                      createdAt: new Date().toISOString(),
                      unread: true,
                      action: (label && href) ? { label, href } : undefined,
                    };
                    const key = 'app_notifications';
                    const raw = localStorage.getItem(key);
                    const arr: AppNotification[] = raw ? JSON.parse(raw) : [];
                    const next = [n, ...arr];
                    localStorage.setItem(key, JSON.stringify(next));
                    emitNotification(n);
                  } catch {}
                }
                setNotifTitle(""); setNotifBody(""); setNotifBtnLabel(""); setNotifBtnHref("");
                window.dispatchEvent(new CustomEvent('app:toast', { detail: { variant: 'success', title: 'Оповещение отправлено' } }));
              }}
            >
              Отправить
            </button>
          </div>
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">Если ссылку и текст кнопки не указывать, будет обычное уведомление без кнопки.</div>
      </div>

      {/* Users management */}
      <div className="rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium">Управление пользователями</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="size-4" />
            <input
              placeholder="Поиск email"
              value={userQuery}
              onChange={(e) => { setUserQuery(e.target.value); setPage(1); }}
              className="rounded-md bg-input px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <select value={userRole} onChange={(e) => { setUserRole(e.target.value as any); setPage(1); }} className="rounded-md bg-input px-2 py-1 text-sm text-foreground outline-none">
              <option value="all">Все роли</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <select value={userStatus} onChange={(e) => { setUserStatus(e.target.value as any); setPage(1); }} className="rounded-md bg-input px-2 py-1 text-sm text-foreground outline-none">
              <option value="all">Все статусы</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
            <select value={userPlan} onChange={(e) => { setUserPlan(e.target.value as any); setPage(1); }} className="rounded-md bg-input px-2 py-1 text-sm text-foreground outline-none">
              <option value="all">Все планы</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
          </div>
        </div>
        {/* Bulk actions removed until API endpoints are added */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="py-2 pr-2"><input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">Роль</th>
                <th className="py-2 pr-2">Статус</th>
                <th className="py-2 pr-2">План</th>
                <th className="py-2 pr-2">Действует до</th>
                <th className="py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {usersPage.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="py-2 pr-2"><input type="checkbox" checked={!!selected[u.id]} onChange={(e) => setSelected((s) => ({ ...s, [u.id]: e.target.checked }))} /></td>
                  <td className="py-2 pr-2">{u.email}</td>
                  <td className="py-2 pr-2">{u.role}</td>
                  <td className="py-2 pr-2">{u.status}</td>
                  <td className="py-2 pr-2">{u.plan}</td>
                  <td className="py-2 pr-2">{u.expiresAt ?? "—"}</td>
                  <td className="py-2 text-right space-x-2">
                    <button className="rounded-md px-2 py-1 hover:bg-accent" onClick={() => alert(`Выдать admin для ${u.email} (мок)`) }>Сделать админом</button>
                    <button className="rounded-md px-2 py-1 hover:bg-accent text-destructive" onClick={() => alert(`Забанить ${u.email} (мок)`) }>Забанить</button>
                    <button className="rounded-md px-2 py-1 hover:bg-accent" onClick={() => alert(`Отнять подписку у ${u.email} (мок)`) }>Отнять подписку</button>
                    <button className="rounded-md px-2 py-1 hover:bg-accent" onClick={() => { setSubUser(u); setSubPlan(u.plan); setSubExtendMonths(1); }}>Подписка…</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="mt-2 flex items-center justify-between text-xs">
          <div>Пользователи: {filteredUsers.length}</div>
          <div className="inline-flex items-center gap-2">
            <button className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="size-4" /></button>
            <span>Стр. {page} / {totalPages}</span>
            <button className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="size-4" /></button>
          </div>
        </div>
      </div>

      {/* Reports removed until wired to API */}

      {/* Global images */}
      <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-medium">Все изображения</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <input placeholder="Поиск (email/модель)" value={imgQuery} onChange={(e) => { setImgQuery(e.target.value); setImgPage(1); }} className="rounded-md bg-input px-2 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
            <select value={imgNSFW} onChange={(e) => { setImgNSFW(e.target.value as any); setImgPage(1); }} className="rounded-md bg-input px-2 py-1 text-sm text-foreground outline-none">
              <option value="all">Все</option>
              <option value="safe">Безопасные</option>
              <option value="nsfw">NSFW</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {imgLoading && Array.from({length: imgPageSize}).map((_,i) => (
            <div key={`sk-${i}`} className="relative aspect-square rounded-md overflow-hidden bg-muted">
              <div className="absolute inset-0 animate-pulse bg-muted/70" />
            </div>
          ))}
          {!imgLoading && images.map((img) => (
            <div key={img.id} className="relative aspect-square rounded-md border overflow-hidden bg-muted group">
              <button className="absolute inset-0" onClick={() => setViewer(img.src)} aria-label="Просмотр">
                <img src={img.src} alt="img" loading="lazy" className="w-full h-full object-contain" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/40 text-[10px] text-white flex items-center justify-between">
                <span className="truncate">{img.email} • {img.model}</span>
                <span>{img.nsfw ? "NSFW" : ""}</span>
              </div>
              <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                <button className="rounded-md bg-black/50 text-white px-2 py-1 text-[10px] disabled:opacity-50" onClick={() => toggleImageNSFW(img.id)} disabled={img.nsfw}>{img.nsfw ? "NSFW" : "Mark NSFW"}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <div>Изображения: {imgCount}</div>
          <div className="inline-flex items-center gap-2">
            <button className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-50" disabled={imgPage <= 1 || imgLoading} onClick={() => setImgPage((p) => Math.max(1, p - 1))}><ChevronLeft className="size-4" /></button>
            <span>Стр. {imgPage} / {imgTotalPages}</span>
            <button className="rounded-md px-2 py-1 hover:bg-accent disabled:opacity-50" disabled={imgPage >= imgTotalPages || imgLoading} onClick={() => setImgPage((p) => Math.min(imgTotalPages, p + 1))}><ChevronRight className="size-4" /></button>
          </div>
        </div>
      </div>

      {/* Notifications removed (нет API) */}

      {/* Support tickets */}
      <div className="rounded-lg border bg-card p-3">
          <div className="text-sm font-medium flex items-center gap-2"><Shield className="size-4" /> Тикеты поддержки</div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">Статус:</span>
          {(['all','new','in_progress','resolved'] as const).map((s) => (
            <button key={s} onClick={()=>setTicketFilter(s)} className={`rounded-full px-2 py-1 border ${ticketFilter===s? 'bg-sidebar-accent':''}`}>{s}</button>
          ))}
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="py-2 pr-2">ID</th>
                <th className="py-2 pr-2">Тема</th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">Статус</th>
                <th className="py-2 pr-2">Дата</th>
                <th className="py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {tickets.filter(t => ticketFilter==='all' || t.status===ticketFilter).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2 pr-2">{t.id}</td>
                  <td className="py-2 pr-2 max-w-[24rem] truncate" title={t.subject}>{t.subject}</td>
                  <td className="py-2 pr-2">{t.email || '—'}</td>
                  <td className="py-2 pr-2">{t.status}</td>
                  <td className="py-2 pr-2">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-2 text-right">
                    <div className="inline-flex gap-1">
                      {(['new','in_progress','resolved'] as const).map((s) => (
                        <button key={s} className="rounded-md px-2 py-1 text-xs hover:bg-accent" onClick={async ()=>{ try { const u = await updateSupportStatus(t.id, s); setTickets(arr => arr.map(x => x.id===t.id ? u : x)); } catch {} }}>{s}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={() => setViewer(null)}>
          <div className="relative max-w-[90vw] max-h-[85vh] w-full h-full md:w-[80vw] md:h-[80vh] bg-black/40 rounded-lg overflow-hidden border" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Закрыть" className="absolute top-2 right-2 z-10 rounded-full bg-black/60 text-white px-2 py-1 text-xs hover:bg-black" onClick={() => setViewer(null)}>Закрыть ✕</button>
            <img src={viewer} alt="viewer" className="w-full h-full object-contain" />
          </div>
        </div>
      )}

      {/* Subscription dialog */}
      <Dialog open={!!subUser} onOpenChange={(v) => { if (!v) setSubUser(null); }}>
        {subUser && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Подписка: {subUser.email}</DialogTitle>
            </DialogHeader>
            <div className="p-4 grid md:grid-cols-2 gap-3 items-end">
              <div>
                <div className="text-xs text-muted-foreground mb-1">План</div>
                <select value={subPlan} onChange={(e) => setSubPlan(e.target.value as any)} className="w-full rounded-md bg-input px-3 py-2 text-sm text-foreground outline-none">
                  <option value="pro">Pro</option>
                  <option value="free">Free</option>
                </select>
              </div>
              {subPlan === 'pro' && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Продлить на (мес.)</div>
                  <input type="number" min={1} value={subExtendMonths} onChange={(e) => setSubExtendMonths(parseInt(e.target.value || '1', 10))} className="w-full rounded-md bg-input px-3 py-2 text-sm text-foreground outline-none" />
                </div>
              )}
            </div>
            <DialogFooter>
              <button className="rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => setSubUser(null)}>Отмена</button>
              <button className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90" onClick={applySubscription}>Применить</button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Report dialog removed */}
    </div>
    )
  );
}
