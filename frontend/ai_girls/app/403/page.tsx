"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center rounded-full bg-destructive/10 text-destructive p-3">
          <ShieldAlert className="size-6" />
        </div>
        <div className="mt-3 text-2xl font-semibold">Доступ запрещён</div>
        <div className="mt-1 text-sm text-muted-foreground">У вас нет прав для просмотра этой страницы.</div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link href="/" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">На главную</Link>
          <Link href="/login" className="rounded-md px-4 py-2 text-sm hover:bg-accent">Войти</Link>
        </div>
      </div>
    </div>
  );
}

