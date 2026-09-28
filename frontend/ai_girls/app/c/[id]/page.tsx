"use client";

import ChatList from "../_components/ChatList";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Send, Images, Info } from "lucide-react";
import { getModel, getChat, listImagesByModel, listMessages, sendMessage, type Message as ApiMsg, type AiModel, type ImageItem } from "@/lib/chats";
import { getCached, setCached, type CachedMsg } from "@/lib/chatStore";

type Base = { id: string; from: "me" | "model"; time: string };
type Msg =
  | (Base & { type: "text"; text: string })
  | (Base & { type: "image"; url: string; caption?: string })
  | (Base & { type: "typing" })
  | (Base & { type: "generating"; prompt: string });

export default function ChatViewPage() {
  const { id: uuid } = useParams<{ id: string }>();
  const router = useRouter();
  const [chatId, setChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [mounted, setMounted] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [model, setModel] = useState<AiModel | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState<ImageItem[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [viewer, setViewer] = useState<{ url: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const [infoOpen, setInfoOpen] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    try { setIsPro(localStorage.getItem('user_plan') === 'pro'); } catch {}
  }, []);

  // Simulate progress for generating messages
  useEffect(() => {
    const gens = messages.filter((m) => m.type === "generating");
    if (gens.length === 0) return;
    const timers: NodeJS.Timeout[] = [];
    gens.forEach((g) => {
      if (progress[g.id] && progress[g.id] >= 100) return;
      timers.push(
        setInterval(() => {
          setProgress((p) => {
            const cur = p[g.id] ?? 0;
            const next = Math.min(100, cur + Math.ceil(Math.random() * 10));
            return { ...p, [g.id]: next };
          });
        }, 500)
      );
    });
    return () => timers.forEach(clearInterval);
  }, [messages, progress]);

  useEffect(() => {
    // Render cached messages instantly to avoid flicker
    const cached = getCached(uuid);
    if (cached) {
      setChatId(cached.chatId);
      setMessages(cached.messages as Msg[]);
    }
    (async () => {
      try {
        const chat = await getChat(uuid);
        setChatId(chat.id);
        if ((chat as any).model) {
          try { const m = await getModel((chat as any).model); setModel(m); } catch {}
        }
      } catch {
        // Possibly archived/soft-deleted — go back to list
        router.push('/c');
      }
    })();
  }, [uuid]);

  useEffect(() => {
    (async () => {
      if (!chatId) return;
      try {
        const apiMsgs = await listMessages(chatId);
        const mapped: Msg[] = apiMsgs.map((m: ApiMsg) => {
          const from: "me"|"model" = m.role === 'me' ? 'me' : 'model';
          const time = new Date(m.created_at).toLocaleTimeString().slice(0,5);
          if (m.kind === 'image' && m.image_url) return { id: String(m.id), type: 'image', from, url: m.image_url, time };
        	return { id: String(m.id), type: 'text', from, text: m.text || '', time };
        });
        setMessages(mapped);
        setCached(uuid, chatId, mapped as unknown as CachedMsg[]);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [chatId]);

  // SSE (stub) hookup
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/v1/stream/chat/${uuid}`);
      es.onmessage = () => {};
      es.onerror = () => { es?.close(); };
    } catch {}
    return () => { try { es?.close(); } catch {} };
  }, [uuid]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function autoResize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    const max = 160;
    const next = Math.min(el.scrollHeight, max);
    el.style.height = next + "px";
  }

  async function send() {
    const text = input.trim();
    if (!text || !chatId) return;
    try {
      const msg = await sendMessage(chatId, text, 'me');
      const time = new Date(msg.created_at).toLocaleTimeString().slice(0,5);
      const typing: Msg = { id: crypto.randomUUID(), type: 'typing', from: 'model', time };
      setMessages((m) => [
        ...m,
        { id: String(msg.id), type: 'text', from: 'me', text: msg.text || '', time },
        typing,
      ]);
      try { window.dispatchEvent(new CustomEvent('chat:updated', { detail: { id: chatId, last_text: msg.text || '', last_created_at: msg.created_at } })); } catch {}
      setCached(uuid, chatId, [
        ...((getCached(uuid)?.messages as Msg[]) || []),
        { id: String(msg.id), type: 'text', from: 'me', text: msg.text || '', time },
        typing as unknown as Msg,
      ] as unknown as CachedMsg[]);
      setInput("");
      requestAnimationFrame(() => autoResize());
      // placeholder model message (until real t2t)
      setTimeout(() => {
        const textDefault = "Привет, прости есть неполадки со связью, попробуй написать мне чуть позже";
        const echo: Msg = { id: crypto.randomUUID(), type: 'text', from: 'model', text: textDefault, time };
        setMessages((m) => {
          const withoutTyping = m.filter((x) => x.type !== 'typing');
          return [...withoutTyping, echo];
        });
        const cur = (getCached(uuid)?.messages as Msg[]) || [];
        const withoutTyping2 = cur.filter((x) => x.type !== 'typing');
        setCached(uuid, chatId, [...withoutTyping2, echo] as unknown as CachedMsg[]);
        try { window.dispatchEvent(new CustomEvent('chat:updated', { detail: { id: chatId, last_text: textDefault, last_created_at: new Date().toISOString() } })); } catch {}
      }, 1000);

      // if generating, after few seconds turn into image
      // image generation deferred to backend filtering later
    } catch {}
  }

  return (
    <div className="flex h-[100dvh] md:h-[calc(100vh-3.5rem)] -m-4 sm:-m-6">
      <div className="hidden md:block">
        <ChatList highlightId={uuid} />
      </div>
      <main className="flex-1 min-w-0 bg-transparent">
        <div className="h-full flex flex-col">
          <div className="sticky top-0 z-10 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
            <div className="flex items-center gap-3 px-4 h-12">
              <a href="/c" className="md:hidden inline-flex items-center justify-center rounded-md hover:bg-accent size-8" aria-label="Назад">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </a>
              <div className="relative">
                <div className="size-8 rounded-full overflow-hidden bg-muted text-muted-foreground grid place-items-center text-xs">
                  {model?.avatar ? (
                    <img src={model.avatar} alt={model.name} className="w-full h-full object-cover" />
                  ) : (
                    'AI'
                  )}
                </div>
                <span className="absolute -bottom-0 -right-0 size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight truncate">{model?.name || 'AI Model'}</div>
                <div className="text-[11px] text-muted-foreground truncate">онлайн</div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  className="inline-flex items-center justify-center rounded-md hover:bg-accent px-2 py-1 text-muted-foreground"
                  aria-label="Галерея"
                  onClick={async () => {
                    try {
                      if (!model) return;
                      const imgs = await listImagesByModel(model.id);
                      setGallery(imgs);
                      setGalleryOpen(true);
                    } catch {}
                  }}
                >
                  <Images className="size-4" />
                </button>
                <div className="relative">
                  <button
                    className="inline-flex items-center justify-center rounded-md hover:bg-accent px-2 py-1 text-muted-foreground"
                    aria-label="Инфо"
                    onClick={async () => { setInfoOpen((v) => !v); }}
                  >
                    <Info className="size-4" />
                  </button>
                  {infoOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 p-3 w-72 rounded-md border bg-popover text-popover-foreground shadow-md" role="menu">
                      <div className="text-sm font-medium">{model?.name || 'Модель'}</div>
                      <div className="text-xs text-muted-foreground mt-1">Пол: {model?.gender || '—'}</div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{model?.bio || 'Описание недоступно'}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div ref={scrollerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
            {messages.length === 0 && (
              <div className="h-full w-full grid place-items-center py-10">
                <div className="max-w-md w-full rounded-xl border bg-card p-4 text-center">
                  <div className="mx-auto size-16 rounded-full overflow-hidden bg-muted grid place-items-center">
                    {model?.avatar ? <img src={model.avatar} alt={model?.name || 'AI'} className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="mt-3 text-lg font-medium">{model?.name || 'AI Model'}</div>
                  {model?.age ? <div className="text-xs text-muted-foreground">Возраст: {model.age}</div> : null}
                  {model?.fetishes && (
                    <div className="mt-2 flex flex-wrap gap-1 justify-center">
                      {(model.fetishes || '').split(',').map((p) => p.trim()).filter(Boolean).slice(0,6).map((p) => (
                        <span key={p} className="text-[10px] rounded bg-secondary px-2 py-0.5">{p}</span>
                      ))}
                    </div>
                  )}
                  {model?.bio && <div className="mt-3 text-sm text-muted-foreground whitespace-pre-wrap">{model.bio}</div>}
                </div>
              </div>
            )}
            {messages.map((m) => {
              const isMe = m.from === "me";
              return (
                <div key={m.id} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                  {!isMe && (
                    <div className="size-8 rounded-full overflow-hidden bg-muted text-muted-foreground grid place-items-center text-[10px]">
                      {model?.avatar ? (
                        <img src={model.avatar} alt={model?.name || 'AI'} className="w-full h-full object-cover" />
                      ) : (
                        'AI'
                      )}
                    </div>
                  )}
                  {m.type === "text" && (
                    <div className={`max-w-[70%] md:max-w-[55%] rounded-2xl px-3 py-2 text-sm shadow-sm break-words whitespace-pre-wrap ${isMe ? "bg-primary/90 text-white rounded-br-md" : "bg-secondary text-secondary-foreground rounded-bl-md"}`}>
                      <div>{m.text}</div>
                      <div className={`mt-1 text-[10px] ${isMe ? "text-white/80 text-right" : "text-muted-foreground"}`}>{m.time}</div>
                    </div>
                  )}
                  {m.type === "image" && (
                    <div className={`max-w-[70%] md:max-w-[360px] space-y-2 ${isMe ? "text-right" : "text-left"}`}>
                      <div className="relative rounded-xl overflow-hidden border">
                        <img
                          src={!isMe && mounted && !isPro ? "/girl.jpg" : m.url}
                          alt={m.caption ?? "image"}
                          className={`w-full h-auto object-contain select-none ${(!isMe && mounted && !isPro) ? 'blur-sm md:blur' : ''}`}
                          draggable={false}
                          onClick={() => {
                            if (!isMe && mounted && !isPro) { window.location.href = '/profile#subscription'; return; }
                            setViewer({ url: m.url });
                            setBaseScale(1); setZoom(1); setOffset({ x: 0, y: 0 });
                          }}
                          onDragStart={(e) => e.preventDefault()}
                        />
                        {(!isMe && mounted && !isPro) && (
                          <div className="absolute inset-0 grid place-items-center bg-black/55">
                            <div className="text-center px-4">
                              <div className="text-white text-sm font-medium">Для просмотра изображения оформите подписку PRO</div>
                              <a href="/profile#subscription" className="mt-2 inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs hover:opacity-90">Оформить PRO</a>
                            </div>
                          </div>
                        )}
                      </div>
                      {m.caption && (
                        <div className={`text-xs text-muted-foreground ${isMe ? "" : ""}`}>{m.caption}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground">{m.time}</div>
                    </div>
                  )}
                  {m.type === "generating" && (
                    <div className="max-w-[70%] md:max-w-[55%] rounded-2xl p-3 text-sm bg-secondary text-secondary-foreground shadow-sm">
                      <div className="rounded-md h-24 bg-muted/30 overflow-hidden relative">
                        <div className="absolute inset-x-0 bottom-0 p-2 text-[10px] text-muted-foreground flex items-center gap-2">
                          <div className="h-1 flex-1 rounded bg-muted/40 overflow-hidden">
                            <div className="h-full bg-primary/60" style={{ width: `${Math.min(progress[m.id] ?? 10, 100)}%` }} />
                          </div>
                          <span>{Math.min(progress[m.id] ?? 10, 100)}%</span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">Запрос: {m.prompt}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">{m.time}</div>
                    </div>
                  )}
                  {m.type === "typing" && (
                    <div className="rounded-2xl px-3 py-2 bg-secondary text-secondary-foreground shadow-sm">
                      <div className="typing-dots"><span className="dot" /><span className="dot" /><span className="dot" /></div>
                    </div>
                  )}
                  {isMe && (
                    <div className="hidden md:grid size-8 rounded-full bg-muted text-muted-foreground place-items-center text-[10px]">ME</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t mb-2 max-w-full border-border p-3 pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto w-full max-w-2xl flex items-end gap-2">
              <div className="flex-1 rounded-2xl border bg-input/40 px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); autoResize(); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  rows={1}
                  placeholder="Введите сообщение..."
                  className="w-full max-h-40 min-h-[44px] leading-5 bg-transparent text-sm outline-none resize-none overflow-y-auto no-scrollbar"
                />
              </div>
              <button onClick={send} className={`inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground size-10 transition-opacity ${input.trim() ? "opacity-100" : "opacity-0 pointer-events-none"}`} aria-label="Отправить">
                <Send className="size-5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {galleryOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setGalleryOpen(false)}>
          <div className="bg-background rounded-lg border w-full max-w-5xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center"><div className="font-medium text-sm">Галерея модели</div><button className="ml-auto text-xs hover:underline" onClick={() => setGalleryOpen(false)}>Закрыть</button></div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {gallery.map((g) => (
                <button key={g.id} className="aspect-square rounded-md overflow-hidden border bg-muted" onClick={() => setViewer({ url: g.url })}>
                  <img src={g.url} alt="img" className="w-full h-full object-cover" />
                </button>
              ))}
              {gallery.length === 0 && (<div className="col-span-full text-center text-xs text-muted-foreground py-10">Нет изображений</div>)}
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewer(null)}>
          <div ref={viewerRef} className="relative max-w-[90vw] max-h-[85vh] w-full h-full md:w-[80vw] md:h-[80vh] bg-black/40 rounded-lg overflow-hidden border" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Закрыть" className="absolute top-2 right-2 z-20 rounded-full bg-black/60 text-white px-2 py-1 text-xs hover:bg-black" onClick={() => setViewer(null)}>Закрыть ✕</button>
            <div className="absolute top-2 right-2 z-10">
              <button className="rounded-md bg-white/10 text-white px-2 py-1 text-xs hover:bg-white/20" onClick={() => { setZoom(baseScale); setOffset({ x: 0, y: 0 }); }}>Сброс</button>
            </div>
            <div className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onWheel={(e) => {
                e.preventDefault();
                const delta = -e.deltaY;
                const factor = delta > 0 ? 1.1 : 0.9;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const cx = e.clientX - rect.left - rect.width / 2;
                const cy = e.clientY - rect.top - rect.height / 2;
                setOffset((o) => ({ x: (o.x - cx) * factor + cx, y: (o.y - cy) * factor + cy }));
                setZoom((z) => {
                  const minZ = baseScale || 1;
                  const maxZ = minZ * 5;
                  const nz = z * factor;
                  return Math.min(maxZ, Math.max(minZ, nz));
                });
              }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                dragging.current = true;
                dragStart.current = { x: e.clientX, y: e.clientY };
                offsetStart.current = { ...offset };
              }}
              onPointerMove={(e) => {
                if (!dragging.current) return;
                const dx = e.clientX - dragStart.current.x;
                const dy = e.clientY - dragStart.current.y;
                setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy });
              }}
              onPointerUp={(e) => {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
                dragging.current = false;
              }}
              onDragStart={(e) => e.preventDefault()}
            >
              <img src={viewer.url} alt="viewer" className="select-none pointer-events-none" draggable={false}
                onLoad={(e) => {
                  const iw = (e.target as HTMLImageElement).naturalWidth || 1;
                  const ih = (e.target as HTMLImageElement).naturalHeight || 1;
                  const rect = viewerRef.current?.getBoundingClientRect();
                  if (rect) {
                    const fit = Math.min(rect.width / iw, rect.height / ih);
                    setBaseScale(fit);
                    setZoom(fit);
                    setOffset({ x: 0, y: 0 });
                  }
                }}
                style={{ position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
