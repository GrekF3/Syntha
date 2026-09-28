"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { createChat, listModels, type AiModel } from "@/lib/chats";
import { useRouter } from "next/navigation";

export default function CharactersPage() {
  const [items, setItems] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const router = useRouter();
  useEffect(() => { (async () => { try { const mine = await listModels('mine'); setItems(mine); } catch {} finally { setLoading(false); } })(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-xl font-semibold">Мои персонажи</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Create-new card */}
        <Link href="/character-create" className="group rounded-lg border border-dashed bg-card hover:border-primary/50 hover:shadow transition-colors">
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="size-10 rounded-full grid place-items-center bg-primary/15 text-primary group-hover:bg-primary/25">
              <Plus className="size-5" />
            </div>
            <div className="text-sm font-medium">Создать нового персонажа</div>
            <div className="text-xs text-muted-foreground">Настройте имя, описание и аватар</div>
          </div>
        </Link>

        {loading && <div className="col-span-full text-center text-sm text-muted-foreground py-8">Загрузка…</div>}
        {!loading && items.length === 0 && <div className="col-span-full text-center text-sm text-muted-foreground py-8">Нет персонажей</div>}
        {items.map((c) => (
          <div key={c.id} className="rounded-lg border overflow-hidden bg-card hover:shadow-md transition-shadow">
            <div className="aspect-[4/3] relative bg-muted">
              {c.avatar ? (
                <Image src={c.avatar} alt={c.name} fill className="object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-muted-foreground text-2xl font-medium">{(c.name||'').slice(0, 2)}</div>
              )}
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name}</div>
                  {c.age ? <div className="text-[11px] text-muted-foreground">Возраст: {c.age}</div> : null}
                </div>
                <button
                  className="shrink-0 inline-flex items-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs hover:opacity-90"
                  onClick={async () => {
                    try {
                      const chat = await createChat(c.id, `Чат с ${c.name}`);
                      router.push(chat?.uuid ? `/c/${chat.uuid}` : `/c/${chat.id}`);
                    } catch {}
                  }}
                >
                  Создать чат
                </button>
              </div>
              {c.bio && (
                <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {expanded[c.id] || (c.bio || '').length <= 160 ? c.bio : `${(c.bio || '').slice(0,160)}…`}
                  {(c.bio || '').length > 160 && (
                    <button className="ml-2 inline text-xs rounded px-1 py-0.5 hover:bg-accent" onClick={() => setExpanded((s) => ({ ...s, [c.id]: !s[c.id] }))}>
                      {expanded[c.id] ? 'Свернуть' : 'Читать полностью'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
