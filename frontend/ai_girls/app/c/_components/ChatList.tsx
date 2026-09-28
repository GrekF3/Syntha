"use client";

import Link from "next/link";
import { MessageSquare, MoreVertical, Pin, Trash2, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listChats, listModels, createChat, renameChat, togglePin, deleteChat, type Chat as ApiChat, type AiModel } from "@/lib/chats";
import { useUser } from "@/context/UserContext";

export default function ChatList({ highlightId }: { highlightId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isGuest, user } = useUser();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<ApiChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [models, setModels] = useState<AiModel[]>([]);
  const [tab, setTab] = useState<'default'|'mine'>('default');
  const [search, setSearch] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ApiChat | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiChat | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setMenuFor(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function refresh() {
    try {
      setLoading(true);
      const data = await listChats();
      setItems(data);
    } catch (e) {
      // ignore for now
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  // Listen for chat updates (last message preview)
  useEffect(() => {
    function onUpdate(e: any) {
      const d = e?.detail || {};
      if (!d) return;
      setItems((arr) => arr.map((it) => (it.id === d.id ? { ...it, last_text: d.last_text ?? it.last_text, last_created_at: d.last_created_at ?? it.last_created_at } : it)));
    }
    window.addEventListener('chat:updated', onUpdate);
    return () => window.removeEventListener('chat:updated', onUpdate);
  }, []);
  useEffect(() => { (async () => { try { const ms = await listModels('public'); const mine = isGuest ? [] : await listModels('mine'); setModels([...(ms||[]), ...(mine||[])]); } catch {} })(); }, [isGuest]);

  async function openNew() {
    setNewOpen(true);
    if (models.length === 0) {
      try { const ms = await listModels(); setModels(ms); } catch {}
    }
  }

  const activeId = highlightId ?? (pathname?.startsWith("/c/") ? pathname.split("/")[2] : undefined);
  const filteredModels = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = models;
    if (tab === 'mine' && !isGuest && user?.id) arr = arr.filter(m => m.created_by === user.id);
    if (tab === 'default') arr = arr.filter(m => m.is_public);
    if (q) arr = arr.filter(m => (m.name || '').toLowerCase().includes(q) || (m.bio || '').toLowerCase().includes(q));
    return arr;
  }, [models, tab, search, isGuest, user]);

  const modelById = useMemo(() => Object.fromEntries(models.map(m => [m.id, m])), [models]);

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const m = modelById[c.model];
      return (
        (c.title || '').toLowerCase().includes(q) ||
        (c.last_text || '').toLowerCase().includes(q) ||
        ((m?.name || '').toLowerCase().includes(q))
      );
    });
  }, [items, search, modelById]);


  return (
    <aside
      className="h-full w-full md:w-80 border-r border-sidebar-border bg-sidebar/50"
      ref={rootRef}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-actions-menu]') || target.closest('[data-actions-btn]')) return;
        if (menuFor) setMenuFor(null);
      }}
    >
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-5 text-muted-foreground" />
            <div className="text-sm font-medium">Мои чаты</div>
            <div className="ml-auto">
              <button onClick={openNew} className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary hover:bg-primary/25 px-2 py-1 text-xs">
                <Plus className="size-4" /> Новый чат
              </button>
            </div>
          </div>
          <div className="mt-2">
            <input
              type="text"
              placeholder="Поиск"
              className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto">
          <ul className="p-2 space-y-1">
            {loading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={`sk-${i}`} className="px-2 py-2">
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-full bg-muted animate-pulse" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                  </li>
                ))}
              </>
            )}
            {!loading && items.length === 0 && (
              <li className="px-2 py-2 text-xs text-muted-foreground">Чатов пока нет</li>
            )}
            {(() => {
              const pinned = filteredChats.filter(x => x.pinned);
              const others = filteredChats.filter(x => !x.pinned);
              const renderRow = (c: ApiChat) => {
              const active = String(c.uuid) === activeId;
              const m = modelById[c.model];
              const avatar = (m as any)?.avatar || "/girl.jpg";
              const title = c.title || (m?.name ? `Чат с ${m.name}` : 'Новый чат');
              const last = c.last_kind === 'image' ? '📷 Фото' : (c.last_text || '');
              const when = c.last_created_at ? new Date(c.last_created_at).toLocaleTimeString().slice(0,5) : '';
              return (
                <li key={c.id} className="relative">
                  <div className={`group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent ${active ? "bg-sidebar-accent" : ""}`}>
                    <Link href={`/c/${c.uuid}`} className="flex items-start gap-3 flex-1 min-w-0" onClick={() => setMenuFor(null)}>
                      <div className="size-9 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                        <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium truncate">{title}</div>
                          {c.pinned ? <Pin className="size-3 text-muted-foreground" /> : null}
                          <div className="ml-auto text-[10px] text-muted-foreground">{when}</div>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{last || (m?.name || `Модель #${c.model}`)}</div>
                      </div>
                    </Link>
                    <button
                      type="button"
                      aria-label="Действия"
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setMenuFor((m) => (m === String(c.id) ? null : String(c.id)));
                      }}
                      data-actions-btn
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </div>
                  {menuFor === String(c.id) && (
                    <div className="absolute right-2 top-full mt-1 z-10 min-w-44 rounded-md border bg-popover text-popover-foreground shadow-lg" data-actions-menu>
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-accent"
                        onClick={() => { setMenuFor(null); setRenameTarget(c); setRenameValue(c.title || ''); setRenameOpen(true); }}
                      >
                        Переименовать
                      </button>
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-accent"
                        onClick={async () => {
                          setMenuFor(null);
                          try {
                            const upd = await togglePin(String(c.uuid || c.id), !c.pinned);
                            setItems((arr) => arr.map((it) => it.id === c.id ? { ...it, pinned: upd.pinned } : it).sort((a,b) => (Number(!!b.pinned) - Number(!!a.pinned))));
                          } catch {}
                        }}
                      >
                        <Pin className="size-4" /> {c.pinned ? 'Открепить' : 'Закрепить'}
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-accent text-destructive" onClick={() => { setMenuFor(null); setDeleteTarget(c); setDeleteOpen(true); }}>
                        <Trash2 className="size-4" /> Удалить
                      </button>
                    </div>
                  )}
                </li>
              );
              };
              return (
                <>
                  {pinned.length > 0 && (
                    <>
                      <li key="hdr-pinned" className="px-3 pt-2 text-xs text-muted-foreground">Закрепленные</li>
                      {pinned.map(renderRow)}
                      <li key="sep-others" className="px-2"><div className="h-px bg-sidebar-border my-2" /></li>
                    </>
                  )}
                  {others.map(renderRow)}
                </>
              );
            })()}
          </ul>
        </nav>
      </div>

      {/* New chat modal */}
      <Dialog open={newOpen} onOpenChange={(v) => setNewOpen(!!v)}>
        {newOpen && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новый чат</DialogTitle>
            </DialogHeader>
            <div className="p-2">
              <div className="flex items-center gap-1 mb-2">
                <button onClick={() => setTab('default')} className={`px-2 py-1 text-xs rounded-md ${tab==='default'?'bg-sidebar-accent':'hover:bg-accent'}`}>Готовые модели</button>
                <button onClick={() => setTab('mine')} className={`px-2 py-1 text-xs rounded-md ${tab==='mine'?'bg-sidebar-accent':'hover:bg-accent'}`}>Мои модели</button>
                {isGuest && tab==='mine' && (
                  <span className="ml-2 text-xs text-muted-foreground">Чтобы создавать свои модели, пожалуйста, авторизуйтесь</span>
                )}
              </div>
              <div className="mb-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск моделей"
                  className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto">
                {filteredModels.map((m) => (
                  <button
                    key={m.id}
                    className="text-left rounded-md border p-2 hover:bg-sidebar-accent"
                    onClick={async () => {
                      try {
                        const chat = await createChat(m.id, `Чат с ${m.name}`);
                        setNewOpen(false);
                        // navigate by uuid if present, otherwise fallback to id path (legacy)
                        const to = chat?.uuid ? `/c/${chat.uuid}` : `/c/${chat.id}`;
                        router.push(to);
                      } catch (e) {}
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                        <img src={(m as any)?.avatar || '/girl.jpg'} alt="avatar" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <div className="text-sm font-medium truncate">{m.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{m.bio || ''}</div>
                      </div>
                    </div>
                  </button>
                ))}
                {filteredModels.length === 0 && (
                  <div className="col-span-full text-center text-xs text-muted-foreground py-6">Нет моделей</div>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Rename modal */}
      <Dialog open={renameOpen} onOpenChange={(v) => setRenameOpen(!!v)}>
        {renameOpen && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Переименовать чат</DialogTitle>
            </DialogHeader>
            <div className="p-2">
              <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Название чата" />
              <div className="mt-3 flex justify-end gap-2">
                <button className="rounded-md px-3 py-1.5 text-sm hover:bg-accent" onClick={() => setRenameOpen(false)}>Отмена</button>
                <button
                  className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90"
                  onClick={async () => {
                    const t = renameValue.trim();
                    if (!t || !renameTarget) return;
                    try {
                      const upd = await renameChat(String(renameTarget.uuid || renameTarget.id), t);
                      setItems((arr) => arr.map((it) => it.id === renameTarget.id ? { ...it, title: upd.title } : it));
                      setRenameOpen(false);
                      setRenameTarget(null);
                    } catch {}
                  }}
                >
                  Сохранить
                </button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Delete confirm modal */}
      <Dialog open={deleteOpen} onOpenChange={(v) => setDeleteOpen(!!v)}>
        {deleteOpen && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Удалить чат</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <div className="text-sm text-muted-foreground">Вы уверены, что хотите удалить этот чат?</div>
              <div className="mt-3 flex justify-end gap-2">
                <button className="rounded-md px-3 py-1.5 text-sm hover:bg-accent" onClick={() => setDeleteOpen(false)}>Отмена</button>
                <button
                  className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-sm hover:opacity-90"
                  onClick={async () => {
                    if (!deleteTarget) return;
                    try {
                      await deleteChat(String(deleteTarget.uuid || deleteTarget.id));
                      setItems((arr) => arr.filter((it) => it.id !== deleteTarget.id));
                      if (String(deleteTarget.uuid) === activeId) router.push('/c');
                    } catch {}
                    setDeleteOpen(false);
                    setDeleteTarget(null);
                  }}
                >
                  Удалить
                </button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </aside>
  );
}
