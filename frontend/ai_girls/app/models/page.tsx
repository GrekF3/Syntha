"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Info, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createChat, listModels, type AiModel } from "@/lib/chats";
import { useRouter } from "next/navigation";

const TABS = [
  { key: "female", label: "Женщина" },
  { key: "male", label: "Мужчина" },
  { key: "anime", label: "Аниме" },
] as const;

export default function ModelsPage() {
  const [tab, setTab] = useState<typeof TABS[number]["key"]>("female");
  const [open, setOpen] = useState<AiModel | null>(null);
  const [items, setItems] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  useEffect(() => { (async () => { try { const pub = await listModels('public'); setItems(pub); } catch {} finally { setLoading(false); } })(); }, []);
  const filtered = useMemo(() => items.filter((m) => (m.gender || '') === tab), [items, tab]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border bg-card p-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.key ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
          ))}
        </div>
        <div className="ml-auto">
          <Link href="/character-create" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90">
            <Sparkles className="size-4" /> Создать персонажа
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading && <div className="col-span-full text-center text-sm text-muted-foreground py-8">Загрузка…</div>}
        {!loading && filtered.length === 0 && <div className="col-span-full text-center text-sm text-muted-foreground py-8">Нет моделей</div>}
        {filtered.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)} className="group text-left rounded-lg border overflow-hidden bg-card hover:shadow-md transition-shadow">
            <div className="aspect-[4/3] bg-muted relative">
              {m.avatar ? (
                <Image src={m.avatar} alt={m.name} fill className="object-contain" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-muted-foreground">{(m.name||'').slice(0, 2)}</div>
              )}
            </div>
            <div className="p-3">
              <div className="font-medium truncate">{m.name}</div>
              {m.bio && <div className="mt-1 text-xs text-muted-foreground truncate">{m.bio}</div>}
            </div>
          </button>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        {open && (
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-muted grid place-items-center text-xs text-muted-foreground overflow-hidden">
                  {open.avatar ? (
                    <Image src={open.avatar} alt={open.name} width={40} height={40} className="object-cover" />
                  ) : (
                    (open.name||'').slice(0, 2)
                  )}
                </div>
                <div className="min-w-0">
                  <DialogTitle>{open.name}</DialogTitle>
                  {open.age ? <div className="text-xs text-muted-foreground">Возраст: {open.age}</div> : null}
                </div>
              </div>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-4 p-4">
              <div>
                <div className="text-sm font-medium flex items-center gap-2"><Info className="size-4" /> Биография</div>
                <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{open.bio || '—'}</div>
                {open.fetishes && (
                  <>
                    <div className="mt-4 text-sm font-medium">Фетиши</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(open.fetishes || '').split(',').map((p) => p.trim()).filter(Boolean).map((p) => (
                        <span key={p} className="text-xs rounded-md bg-secondary px-2 py-1">{p}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div>
                <div className="aspect-[4/3] rounded-lg border bg-muted overflow-hidden">
                  {open.avatar ? (
                    <Image src={open.avatar} alt={open.name} width={800} height={600} className="w-full h-full object-contain" />
                  ) : (
                    <div className="grid place-items-center h-full text-muted-foreground">Нет фото</div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <button className="rounded-md px-3 py-2 text-sm hover:bg-accent" onClick={() => setOpen(null)}>Закрыть</button>
              <button className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm hover:opacity-90" onClick={async () => { if (!open) return; try { const chat = await createChat(open.id, `Чат с ${open.name}`); router.push(chat?.uuid ? `/c/${chat.uuid}` : `/c/${chat.id}`); } catch {} }}>Написать</button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
