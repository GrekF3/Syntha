"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Bookmark, Sparkles, RefreshCw, Square, Search } from "lucide-react";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AiModel = { id: number; name: string; gender?: string; bio?: string; avatar?: string };

export default function ImageCreatePage() {
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [model, setModel] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [progress, setProgress] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [size, setSize] = useState<'1:1' | '4:3' | '16:9'>('4:3');
  const [viewer, setViewer] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    setImage(null);
    setProgress(0);
    const t = setInterval(() => setProgress((p) => Math.min(100, p + Math.ceil(Math.random() * 12))), 300);
    const end = setTimeout(() => { setImage("/girl.jpg"); setRunning(false); }, 4500);
    return () => { clearInterval(t); clearTimeout(end); };
  }, [running]);

  // Load models once
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/models/');
        if (!res.ok) return;
        const data = await res.json();
        const items: AiModel[] = Array.isArray(data) ? data : (data.results || []);
        setModels(items);
        if (items.length && model === null) setModel(items[0].id);
      } catch {}
    })();
  }, []);

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter(m => m.name.toLowerCase().includes(q));
  }, [models, modelQuery]);

  const selectedModel = useMemo(() => models.find(m => m.id === model) || null, [models, model]);
  const startGenerate = useCallback(() => {
    if (!prompt.trim() || !model) return;
    setRunning(true);
  }, [prompt, model]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xl font-semibold">Создать изображение</div>
      </div>

      {/* Controls */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-1 rounded-lg border bg-card p-3 space-y-3">
          <div className="text-sm font-medium">Модель</div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setModelsOpen(true)} className="rounded-full px-3 py-1 text-sm border hover:bg-accent">
              {selectedModel ? `Модель: ${selectedModel.name}` : 'Выбрать модель'}
            </button>
            {selectedModel && (
              <button onClick={()=>setModel(null)} className="rounded-full px-2 py-1 text-xs border hover:bg-accent" title="Сбросить">Сброс</button>
            )}
          </div>

          <div className="pt-2">
            <div className="text-sm font-medium">NSFW</div>
            <label className="mt-1 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="size-4" />
              Разрешить откровенный контент
            </label>
          </div>

          <div className="pt-2">
            <div className="text-sm font-medium">Размер</div>
            <div className="flex flex-wrap gap-2 mt-1">
              {(['1:1','4:3','16:9'] as const).map((s) => (
                <button key={s} onClick={() => setSize(s)} className={`rounded-full px-3 py-1 text-sm border ${size === s ? 'bg-sidebar-accent' : 'hover:bg-accent'}`}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-2 rounded-lg border bg-card p-3 space-y-3">
          <div className="text-sm font-medium">Промт</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="Опишите желаемое изображение..."
            className="w-full rounded-md bg-input/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-vertical"
          />
          <div className="flex justify-end">
            <button
              onClick={startGenerate}
              disabled={!prompt.trim() || !model || running}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-50"
            >
              <Sparkles className="size-4" />
              Сгенерировать
            </button>
          </div>
        </div>
      </div>

      {/* Output */}
      <div className="rounded-lg border bg-card p-3">
        <div className={`relative rounded-md overflow-hidden border bg-muted mx-auto w-full max-w-[720px] h-[420px]`}>
          {!image ? (
            <div className="absolute inset-0 grid place-items-center">
              {running ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="logo-font text-2xl md:text-3xl gradient-text">syntha</div>
                  <div className="w-80 max-w-[80%]">
                    <div className="text-sm text-muted-foreground mb-2">Генерация…</div>
                    <div className="h-2 rounded bg-secondary overflow-hidden">
                      <div className="h-full bg-primary/70 transition-[width]" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Укажите модель и промт, затем запустите генерацию</div>
              )}
            </div>
          ) : (
            <Image src={image} alt="result" fill className="object-contain" onClick={() => { setViewer(true); setZoom(1); setOffset({ x:0, y:0 }); }} />
          )}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {running ? (
            <button onClick={() => setRunning(false)} className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent" aria-label="Остановить">
              <Square className="size-4" />
              <span className="hidden sm:inline text-sm">Стоп</span>
            </button>
          ) : (
            <>
              {image && (
                <button onClick={() => setRunning(true)} className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent" aria-label="Перегенерировать">
                  <RefreshCw className="size-4" />
                  <span className="hidden sm:inline text-sm">Перегенерировать</span>
                </button>
              )}
              {image && (
                <>
                  <button className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent" aria-label="Сохранить">
                    <Bookmark className="size-4" />
                    <span className="hidden sm:inline text-sm">Сохранить</span>
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent" aria-label="Скачать">
                    <Download className="size-4" />
                    <span className="hidden sm:inline text-sm">Скачать</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Model picker dialog */}
      <Dialog open={modelsOpen} onOpenChange={setModelsOpen}>
        {modelsOpen && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Выбор модели</DialogTitle>
            </DialogHeader>
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input value={modelQuery} onChange={(e)=>setModelQuery(e.target.value)} placeholder="Поиск модели..." className="w-full rounded-md bg-input/40 pl-8 pr-2 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 max-h-80 overflow-auto">
                {filteredModels.map((m) => (
                  <button key={m.id} onClick={()=>{ setModel(m.id); setModelsOpen(false); }} className={`flex items-center gap-2 rounded-md border px-2 py-2 text-left hover:bg-accent ${m.id===model ? 'bg-sidebar-accent' : ''}`}>
                    <div className="size-8 rounded-full bg-muted grid place-items-center text-xs text-muted-foreground overflow-hidden">
                      {m.avatar ? (<Image src={m.avatar} alt={m.name} width={32} height={32} className="object-cover" />) : (m.name.slice(0,2))}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      {m.gender && <div className="text-[10px] text-muted-foreground">{m.gender}</div>}
                    </div>
                  </button>
                ))}
                {filteredModels.length === 0 && (
                  <div className="col-span-full text-xs text-muted-foreground">Ничего не найдено</div>
                )}
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Viewer modal (like chat) */}
      {viewer && image && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewer(false)}>
          <div ref={viewerRef} className="relative max-w-[90vw] max-h-[85vh] w-full h-full md:w-[80vw] md:h-[80vh] bg-black/40 rounded-lg overflow-hidden border" onClick={(e) => e.stopPropagation()}>
            <button
              aria-label="Закрыть"
              className="absolute top-2 right-2 z-20 rounded-full bg-black/60 text-white px-2 py-1 text-xs hover:bg-black"
              onClick={() => setViewer(false)}
            >
              Закрыть ✕
            </button>
            <div className="absolute top-2 right-2 z-10">
              <button className="rounded-md bg-white/10 text-white px-2 py-1 text-xs hover:bg-white/20" onClick={() => { setZoom(baseScale); setOffset({ x:0, y:0 }); }}>Сброс</button>
            </div>
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onWheel={(e) => {
                e.preventDefault();
                const delta = -e.deltaY; const factor = delta > 0 ? 1.1 : 0.9;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const cx = e.clientX - rect.left - rect.width / 2; const cy = e.clientY - rect.top - rect.height / 2;
                setOffset((o) => ({ x: (o.x - cx) * factor + cx, y: (o.y - cy) * factor + cy }));
                setZoom((z) => {
                  const minZ = baseScale || 1;
                  const maxZ = minZ * 5;
                  const nz = z * factor;
                  return Math.min(maxZ, Math.max(minZ, nz));
                });
              }}
              onPointerDown={(e) => { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY }; offsetStart.current = { ...offset }; }}
              onPointerMove={(e) => { if (!dragging.current) return; const dx = e.clientX - dragStart.current.x; const dy = e.clientY - dragStart.current.y; setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy }); }}
              onPointerUp={(e) => { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); dragging.current = false; }}
              onDragStart={(e) => e.preventDefault()}
            >
              <img
                src={image}
                alt="viewer"
                className="select-none pointer-events-none"
                draggable={false}
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
                style={{ position:'absolute', left:'50%', top:'50%', transform:`translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
