"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { listImagesAll, listModels, type AiModel, type ImageItem } from "@/lib/chats";
import { useUser } from "@/context/UserContext";

type Card = { id: string; model?: AiModel | null; images: ImageItem[] };

export default function GalleryPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<ImageItem | null>(null);
  const dragging = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const viewerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const user = useUser();

  useEffect(() => {
    (async () => {
      try {
        const [imgs, pub, mine] = await Promise.all([listImagesAll(), listModels('public'), user.isGuest ? Promise.resolve([]) : listModels('mine')]);
        const models: Record<number, AiModel> = {};
        [...pub, ...(mine as AiModel[])].forEach((m) => { models[m.id] = m; });
        const byModel: Record<string, ImageItem[]> = {};
        imgs.forEach((im) => {
          const key = String(im.model || 'none');
          byModel[key] = byModel[key] || [];
          byModel[key].push(im);
        });
        const out: Card[] = Object.entries(byModel).map(([k, arr]) => ({ id: k, model: models[Number(k)] || null, images: arr }));
        setCards(out);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [user.isGuest]);

  const canSeeNSFW = (!user.isGuest) && (user.user?.plan === 'pro') && (!!user.user?.nsfwEnabled);

  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Галерея</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {loading && <div className="col-span-full text-center text-sm text-muted-foreground py-8">Загрузка…</div>}
        {!loading && cards.length === 0 && <div className="col-span-full text-center text-sm text-muted-foreground py-8">Нет изображений</div>}
        {cards.map((card) => (
          <div key={card.id} className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center gap-2 p-2 border-b">
              <div className="size-8 rounded-full bg-muted grid place-items-center text-xs text-muted-foreground overflow-hidden">
                {card.model?.avatar ? (
                  <Image src={card.model.avatar} alt={card.model.name} width={32} height={32} className="object-cover" />
                ) : (
                  (card.model?.name || '—').slice(0, 2)
                )}
              </div>
              <div className="text-sm font-medium truncate">{card.model?.name || 'Без модели'}</div>
            </div>
            <div className="grid grid-cols-3 gap-1.5 p-2">
              {card.images.slice(0, 6).map((im, i) => (
                <button key={im.id} className="relative aspect-square rounded-md overflow-hidden border bg-muted" onClick={() => setViewer(im)} aria-label="Просмотр">
                  <Image src={im.url} alt="image" fill className={`object-cover ${(!canSeeNSFW && im.nsfw) ? 'blur-sm' : ''}`} />
                  {i === 5 && card.images.length > 6 && (
                    <div className="absolute inset-0 bg-black/50 text-white grid place-items-center text-sm font-medium">+{card.images.length - 6}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setViewer(null)}>
          <div ref={viewerRef} className="relative max-w-[90vw] max-h-[85vh] w-full h-full md:w-[80vw] md:h-[80vh] bg-black/40 rounded-lg overflow-hidden border" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Закрыть" className="absolute top-2 right-2 z-10 rounded-full bg-black/60 text-white px-2 py-1 text-xs hover:bg-black" onClick={() => setViewer(null)}>Закрыть ✕</button>
            <div className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onWheel={(e) => { e.preventDefault(); const delta = -e.deltaY; const factor = delta > 0 ? 1.1 : 0.9; const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const cx = e.clientX - rect.left - rect.width / 2; const cy = e.clientY - rect.top - rect.height / 2; setOffset((o) => ({ x: (o.x - cx) * factor + cx, y: (o.y - cy) * factor + cy })); setZoom((z) => { const minZ = baseScale || 1; const maxZ = minZ * 5; const nz = z * factor; return Math.min(maxZ, Math.max(minZ, nz)); }); }}
              onPointerDown={(e) => { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); dragging.current = true; dragStart.current = { x: e.clientX, y: e.clientY }; offsetStart.current = { ...offset }; }}
              onPointerMove={(e) => { if (!dragging.current) return; const dx = e.clientX - dragStart.current.x; const dy = e.clientY - dragStart.current.y; setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy }); }}
              onPointerUp={(e) => { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); dragging.current = false; }}
              onDragStart={(e) => e.preventDefault()}
            >
              <img src={viewer.url} alt="viewer" className={`select-none pointer-events-none ${(!canSeeNSFW && viewer.nsfw) ? 'blur-sm' : ''}`} draggable={false}
                onLoad={(e) => { const iw = (e.target as HTMLImageElement).naturalWidth || 1; const ih = (e.target as HTMLImageElement).naturalHeight || 1; const rect = viewerRef.current?.getBoundingClientRect(); if (rect) { const fit = Math.min(rect.width / iw, rect.height / ih); setBaseScale(fit); setZoom(fit); setOffset({ x: 0, y: 0 }); } }}
                style={{ position:'absolute', left:'50%', top:'50%', transform:`translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
