"use client";

import { Geist, Geist_Mono, Rowdies, Manrope } from "next/font/google";
import "./globals.css";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { me, listNotifications, markNotificationRead, deleteNotification } from "@/lib/auth";
import { AppNotification, emitNotification, seedDefaultNotifications } from "@/lib/notify";
import { UserProvider, useUser } from "@/context/UserContext";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Compass,
  MessageSquare,
  Images,
  ImagePlus,
  UserPlus,
  Users2,
  Menu,
  ChevronLeft,
  Gift,
  UserStar,
  Bell,
} from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const rowdies = Rowdies({
  variable: "--font-rowdies",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type NavItem = {
  label: string;
  href: string;
  icon: (props: { className?: string }) => ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Все модели", href: "/models", icon: (p) => <Compass className={p.className} /> },
  { label: "Мои чаты", href: "/c", icon: (p) => <MessageSquare className={p.className} /> },
  { label: "Галерея", href: "/gallery", icon: (p) => <Images className={p.className} /> },
  { label: "Создать изображение", href: "/image-create", icon: (p) => <ImagePlus className={p.className} /> },
  { label: "Создать персонажа", href: "/character-create", icon: (p) => <UserPlus className={p.className} /> },
  { label: "Мои персонажи", href: "/characters", icon: (p) => <Users2 className={p.className} /> },
  { label: "Админ-панель", href: "/admin", icon: (p) => <UserStar className={p.className} /> },
];

function Sidebar({ collapsed, className = "" }: { collapsed: boolean; className?: string }) {
  const pathname = usePathname();
  const userCtx = useUser();
  const isChatDetail = pathname?.startsWith("/c/") ?? false;
  return (
    <aside
      className={`
        bg-sidebar text-sidebar-foreground border-r border-sidebar-border
        transition-[width] duration-200 ease-out h-[calc(100vh-3.5rem)] sticky top-14
        overflow-x-hidden ${collapsed ? "w-16" : "w-64"} ${className}
      `}
    >
      <div className="h-full flex flex-col">
        <nav className="px-2 pt-3 flex-1 overflow-y-auto overflow-x-hidden">
          <ul className="space-y-1">
            {NAV_ITEMS.filter((it) => {
              if (it.href === "/admin" && !userCtx.user?.isStaff) return false;
              return true;
            }).map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              const iconClass = `${collapsed ? "size-6" : "size-5"} shrink-0 ${active ? "" : "opacity-90"}`;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`
                      group relative flex items-center rounded-lg py-2 text-sm
                      ${collapsed ? "justify-center gap-0 px-0" : "gap-3 px-2"}
                      transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring
                      hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground
                      ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"}
                    `}
                  >
                    {item.icon({ className: iconClass })}
                    <span className={`${collapsed ? "hidden" : "block"} whitespace-nowrap overflow-hidden text-ellipsis`}>
                      {item.label}
                    </span>
                    <span
                      className={`pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded border bg-popover text-popover-foreground px-2 py-1 text-xs opacity-0 shadow-lg transition-opacity ${collapsed ? "group-hover:opacity-100 group-focus:opacity-100" : ""}`}
                      role="tooltip"
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-2 border-t border-sidebar-border p-2">
          <div className="px-1">
            <Link
              href="/referrals"
              title="Реферальная программа"
              className={`flex items-center rounded-lg ${collapsed ? "justify-center px-0" : "px-2"} py-2 text-sm hover:bg-sidebar-accent/80`}
            >
              <Gift className={`${collapsed ? "size-6" : "size-5 mr-2"}`} />
              <span className={`${collapsed ? "hidden" : "inline"}`}>Реферальная программа</span>
            </Link>
          </div>
          <div className={`mt-2 ${collapsed ? "hidden" : "px-2"}`}>
            <div className="relative rounded-md overflow-hidden border bg-muted/30 aspect-[6/3]">
              <img src="/girl.jpg" alt="ad" className="absolute inset-0 w-full h-full object-cover opacity-90" />
            </div>
          </div>
          <div className={`mt-2 ${collapsed ? "text-center" : "text-left"}`}>
            <div className={`text-[10px] text-muted-foreground ${collapsed ? "hidden" : "block"}`}>
              <Link href="/terms" className="hover:underline">Условия</Link>
              <span className="mx-1">•</span>
              <Link href="/privacy" className="hover:underline">Политика</Link>
              <span className="mx-1">•</span>
              <Link href="/support" className="hover:underline">Поддержка</Link>
            </div>
            <div className={`${collapsed ? "hidden" : "block"} text-[10px] text-muted-foreground mt-1`}>© syntha</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileSidebar({ open, onClose, headerHidden }: { open: boolean; onClose: () => void; headerHidden?: boolean }) {
  const pathname = usePathname();
  const topClass = headerHidden ? "top-0" : "top-14";
  return (
    <div className={`pointer-events-none fixed inset-x-0 top-0 bottom-0 z-30 md:hidden`}>
      <div
        className={`pointer-events-auto absolute inset-x-0 ${topClass} bottom-0 bg-black/40 transition-opacity ${open ? "opacity-100" : "opacity-0"} ${open ? "" : "hidden"}`}
        onClick={onClose}
      />
      <div
        className={`pointer-events-auto fixed ${topClass} left-0 bottom-0 w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transform transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-full flex flex-col">
          <nav className="px-2 pt-2 flex-1 overflow-y-auto">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                      className={`
                        group flex items-center gap-3 rounded-md px-2 py-2 text-sm
                        transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring
                        hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                        ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"}
                      `}
                      onClick={onClose}
                    >
                      {item.icon({ className: `size-6 shrink-0 ${active ? "" : "opacity-90"}` })}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="border-t border-sidebar-border p-2 space-y-2">
            <Link href="/referrals" className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent/80">
              <Gift className="size-5" /> Реферальная программа
            </Link>
            <div className="relative rounded-md overflow-hidden border bg-muted/30 aspect-[6/3]">
              <img src="/girl.jpg" alt="ad" className="absolute inset-0 w-full h-full object-cover opacity-90" />
            </div>
            <div className="text-center text-[10px] text-muted-foreground">
              <Link href="/terms" className="hover:underline">Условия</Link>
              <span className="mx-1">•</span>
              <Link href="/privacy" className="hover:underline">Политика</Link>
              <span className="mx-1">•</span>
              <Link href="/support" className="hover:underline">Поддержка</Link>
            </div>
            <div className="text-center text-[10px] text-muted-foreground">© syntha</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const userCtx = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return !localStorage.getItem('jwt');
  });
  const [plan, setPlan] = useState<string>(() => {
    if (typeof window === 'undefined') return 'Free';
    return localStorage.getItem('user_plan') || 'Free';
  });
  const [displayName, setDisplayName] = useState<string>(() => {
    if (typeof window === 'undefined') return 'Guest User';
    return localStorage.getItem('user_display_name') || 'Guest User';
  });
  const profileRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const search = useSearchParams();
  const isChatDetail = pathname?.startsWith("/c/") ?? false;
  const isAuth = pathname === "/login" || pathname === "/register" || pathname === "/forgot-password";
  const contentPad = isChatDetail ? "pt-0 md:pt-14" : "pt-14";

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      // close notifications if click outside
      const notifMenu = document.getElementById('notif-menu');
      const notifBtn = document.getElementById('notif-btn');
      const target = e.target as Node;
      if (notifBtn && notifBtn.contains(target)) return; // allow toggle by button without auto-close race
      if (notifMenu && !notifMenu.contains(target)) setNotifOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Capture referral code from URL and persist
  useEffect(() => {
    try {
      const ref = (search?.get('ref') || search?.get('ref_code') || '').trim();
      if (ref) localStorage.setItem('ref_code', ref);
    } catch {}
  }, [search]);

  // Mark mounted on client to avoid SSR hydration mismatch for preloader overlay
  useEffect(() => { setMounted(true); }, []);

  // Notifications: for guests use local storage; for logged-in load from API. Also listen to client-side events.
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('jwt');
        if (token) {
          const arr = await listNotifications();
          setNotifications(arr.map(n => ({ id: String(n.id), title: n.title, body: n.body, createdAt: n.created_at, unread: !!n.unread, action: n.action })));
        } else {
          seedDefaultNotifications();
          const raw = localStorage.getItem('app_notifications');
          if (raw) setNotifications(JSON.parse(raw));
        }
      } catch {}
    })();
    function onNotif(ev: any) {
      try {
        const n: AppNotification = ev.detail;
        setNotifications((prev) => {
          const arr = [n, ...prev];
          try { localStorage.setItem('app_notifications', JSON.stringify(arr)); } catch {}
          return arr;
        });
      } catch {}
    }
    window.addEventListener('app:notification', onNotif as any);
    return () => window.removeEventListener('app:notification', onNotif as any);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('jwt');
        setIsGuest(!token);
        if (token) {
          const u = await me();
          if (u?.plan) {
            setPlan(u.plan);
            localStorage.setItem('user_plan', u.plan);
          }
          if (u?.display_name) {
            setDisplayName(u.display_name);
            localStorage.setItem('user_display_name', u.display_name);
          }
        }
      } catch {
        // keep local values
      } finally {
        setBootLoading(false);
      }
    })();
  }, []);

  // Simple toast system via window events
  const [toasts, setToasts] = useState<Array<{ id: number; variant: string; title?: string; description?: string }>>([]);
  const [notifExpanded, setNotifExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    function onToast(ev: any) {
      const d = ev.detail || {};
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, variant: d.variant || 'info', title: d.title, description: d.description }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
    }
    window.addEventListener('app:toast', onToast as any);
    return () => window.removeEventListener('app:toast', onToast as any);
  }, []);

  if (isAuth) {
    return (<>{children}</>);
  }

  return (
    <>
        {mounted && bootLoading && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur">
            <div className="flex flex-col items-center gap-4">
              <div className="logo-font text-3xl md:text-4xl gradient-text">syntha</div>
              <div className="w-64 max-w-[70vw]">
                <div className="h-2 w-full rounded bg-muted overflow-hidden animate-pulse" />
              </div>
              <div className="text-xs text-muted-foreground">Загрузка профиля…</div>
            </div>
          </div>
        )}
        {/* Toasts */}
        <div className="fixed right-3 bottom-3 z-50 space-y-2">
          {toasts.map((t) => (
            <div key={t.id} className={`min-w-60 max-w-96 rounded-md border px-3 py-2 text-sm shadow-sm ${t.variant==='success' ? 'bg-emerald-600 text-white border-emerald-700' : t.variant==='error' ? 'bg-destructive text-white border-destructive/70' : t.variant==='warning' ? 'bg-amber-500 text-black border-amber-600' : 'bg-popover text-popover-foreground'}`}>
              {t.title && <div className="font-medium">{t.title}</div>}
              {t.description && <div className="text-xs opacity-90">{t.description}</div>}
            </div>
          ))}
        </div>
        <header
          className={`fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b ${isChatDetail ? "hidden md:block" : ""}`}
        >
          <div className="flex items-center gap-3 px-4 h-14">
            {/* Mobile: back in chat, otherwise open slide-out */}
            {isChatDetail ? (
              <Link
                href="/c"
                aria-label="Назад к списку чатов"
                className="md:hidden inline-flex items-center justify-center rounded-md border border-transparent hover:bg-accent hover:text-accent-foreground transition-colors size-9"
              >
                <ChevronLeft className="size-6" />
              </Link>
            ) : (
              <button
                type="button"
                aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
                onClick={() => setMobileOpen((v) => !v)}
                className="relative md:hidden inline-flex items-center justify-center rounded-md border border-transparent hover:bg-accent hover:text-accent-foreground transition-colors size-9 group"
              >
                <Menu className="size-6 block" />
                <span className="pointer-events-none absolute top-full mt-2 whitespace-nowrap rounded border bg-popover text-popover-foreground px-2 py-1 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100">Меню</span>
              </button>
            )}
            {/* Desktop: collapse/expand */}
            <button
              type="button"
              aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
              onClick={() => setCollapsed((v) => !v)}
              className="relative hidden md:inline-flex items-center justify-center rounded-md border border-transparent hover:bg-accent hover:text-accent-foreground transition-colors size-9 group"
            >
              <Menu className="size-5 block" />
              <span className="pointer-events-none absolute top-full mt-2 whitespace-nowrap rounded border bg-popover text-popover-foreground px-2 py-1 text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100">{collapsed ? "Развернуть" : "Свернуть"}</span>
            </button>
            <Link href="/c" className="logo-font text-2xl md:text-3xl gradient-text leading-none select-none h-9 flex items-center relative -top-[1px]">syntha</Link>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  aria-label="Уведомления"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative inline-flex items-center justify-center rounded-md border border-transparent hover:bg-accent hover:text-accent-foreground transition-colors size-9"
                  id="notif-btn"
                >
                  <Bell className="size-5" />
                  {notifications.some(n => n.unread) && (
                    <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground h-4 min-w-4 text-[10px] px-1">{notifications.filter(n=>n.unread).length}</span>
                  )}
                </button>
                {notifOpen && (
                  <div id="notif-menu" className="absolute right-0 mt-2 z-50 w-80 max-w-[90vw] rounded-md border bg-popover text-popover-foreground shadow-md">
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div className="text-sm font-medium">Уведомления</div>
                      <button
                        className="text-xs rounded px-2 py-1 hover:bg-accent"
                        onClick={async () => {
                          try {
                            const token = localStorage.getItem('jwt');
                            if (token) {
                              const unread = notifications.filter(n => n.unread);
                              for (const n of unread) {
                                await markNotificationRead(parseInt(String(n.id), 10));
                              }
                            }
                          } catch {}
                          setNotifications(prev => {
                            const arr = prev.map(n => ({...n, unread: false}));
                            try { localStorage.setItem('app_notifications', JSON.stringify(arr)); } catch {}
                            return arr;
                          });
                        }}
                      >
                        Прочитать все
                      </button>
                    </div>
                    <div className="max-h-80 overflow-auto">
                      {notifications.length === 0 ? (
                        <div className="px-3 py-6 text-xs text-muted-foreground text-center">Нет уведомлений</div>
                      ) : (
                        notifications.slice(0,3).map((n) => (
                          <div key={n.id} className={`px-3 py-2 border-t first:border-t-0 ${n.unread ? 'bg-accent/30' : ''}`}>
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">{n.title}</div>
                                {n.body && (
                                  <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                                    {notifExpanded[String(n.id)] || n.body.length <= 140 ? n.body : (n.body.slice(0, 140) + '…')}
                                    {n.body.length > 140 && (
                                      <button
                                        className="ml-2 inline text-xs rounded px-1 py-0.5 hover:bg-accent"
                                        onClick={() => setNotifExpanded((s) => ({ ...s, [String(n.id)]: !s[String(n.id)] }))}
                                      >
                                        {notifExpanded[String(n.id)] ? 'Свернуть' : 'Читать полностью'}
                                      </button>
                                    )}
                                  </div>
                                )}
                                <div className="mt-2 flex items-center justify-between">
                                  <div className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                  {n.action && (
                                    <Link href={n.action.href || '#'} className="text-xs rounded bg-primary text-primary-foreground px-2 py-1 hover:opacity-90">{n.action.label}</Link>
                                  )}
                                </div>
                              </div>
                              <button
                                className="text-xs rounded px-2 py-1 hover:bg-accent"
                                aria-label="Удалить уведомление"
                                onClick={async () => {
                                  try {
                                    const token = localStorage.getItem('jwt');
                                    if (token) await deleteNotification(parseInt(String(n.id), 10));
                                  } catch {}
                                  setNotifications((prev) => {
                                    const arr = prev.filter(x => x.id !== n.id);
                                    try { localStorage.setItem('app_notifications', JSON.stringify(arr)); } catch {}
                                    return arr;
                                  });
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2" ref={profileRef}>
              {bootLoading ? (
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-muted animate-pulse" />
                  <div className="hidden sm:inline h-4 w-24 bg-muted rounded animate-pulse" />
                </div>
              ) : (
                <button
                  type="button"
                  className="relative inline-flex items-center gap-2 rounded-full px-2 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label="Профиль"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((v) => !v)}
                >
                <div className="size-8 rounded-full bg-muted text-muted-foreground grid place-items-center text-xs font-medium">
                  {(userCtx.displayName || 'Guest User').slice(0,2).toUpperCase()}
                </div>
                <span className="hidden sm:inline text-sm">{userCtx.displayName || 'Guest User'}</span>
                </button>
              )}
              {profileOpen && (
                <div
                  className="absolute right-4 top-[3.25rem] z-50 min-w-48 rounded-md border bg-popover text-popover-foreground shadow-md"
                  role="menu"
                >
                  <div className="px-3 py-2 text-xs text-muted-foreground">План: {userCtx.isGuest ? 'Гость (ограничения)' : userCtx.plan}</div>
                  {userCtx.isGuest ? (
                    <>
                      <Link href="/login" className="block px-3 py-2 text-sm hover:bg-sidebar-accent" role="menuitem" onClick={() => setProfileOpen(false)}>
                        Авторизация
                      </Link>
                      <Link href="/register" className="block px-3 py-2 text-sm hover:bg-sidebar-accent" role="menuitem" onClick={() => setProfileOpen(false)}>
                        Регистрация
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href="/profile" className="block px-3 py-2 text-sm hover:bg-sidebar-accent" role="menuitem" onClick={() => setProfileOpen(false)}>
                        Настройки
                      </Link>
                      <Link href="/profile#subscription" className="block px-3 py-2 text-sm hover:bg-sidebar-accent" role="menuitem" onClick={() => setProfileOpen(false)}>
                        Подписка
                      </Link>
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-sidebar-accent text-destructive"
                        role="menuitem"
                        onClick={() => {
                          setProfileOpen(false);
                          userCtx.logout();
                        }}
                      >
                        Выйти
                      </button>
                    </>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        </header>

        <div className={`${contentPad} flex min-h-screen`}>
          {/* Desktop sidebar */}
          <Sidebar collapsed={collapsed} className="hidden md:block" />
          <main className="flex-1 min-w-0 p-4 sm:p-6">{children}</main>
        </div>
        {/* Mobile slide-out sidebar */}
        <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} headerHidden={isChatDetail} />
  </>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} ${rowdies.variable} ${manrope.variable} antialiased`}>
        <UserProvider>
          <Suspense fallback={null}>
            <AppShell>{children}</AppShell>
          </Suspense>
        </UserProvider>
      </body>
    </html>
  );
}
