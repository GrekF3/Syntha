export type NotificationAction = { label: string; href?: string; onClickEvent?: string };
export type AppNotification = {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  unread?: boolean;
  action?: NotificationAction;
};

const STORAGE_KEY = 'app_notifications';

export function emitNotification(n: AppNotification) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:notification', { detail: n }));
}

export function seedDefaultNotifications() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return; // already seeded/saved
    const now = new Date().toISOString();
    const seed: AppNotification[] = [
      {
        id: `n-${Date.now()}`,
        title: 'Добро пожаловать в syntha',
        body: 'Откройте подписку Pro, чтобы снять ограничения и включить NSFW.',
        createdAt: now,
        unread: true,
        action: { label: 'Оформить', href: '/profile#subscription' },
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  } catch {}
}

export function addLoginNotification() {
  if (typeof window === 'undefined') return;
  const now = new Date().toISOString();
  emitNotification({
    id: `login-${Date.now()}`,
    title: 'Вход выполнен',
    body: 'Вы вошли в аккаунт на этом устройстве.',
    createdAt: now,
    unread: true,
  });
}
