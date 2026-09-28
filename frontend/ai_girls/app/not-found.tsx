"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="text-center max-w-md">
        <div className="logo-font text-4xl gradient-text">syntha</div>
        <div className="mt-3 text-2xl font-semibold">Страница не найдена</div>
        <div className="mt-1 text-sm text-muted-foreground">Похоже, вы перешли по неверной ссылке или страница была удалена.</div>
        <div className="mt-4">
          <Link href="/" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:opacity-90">На главную</Link>
        </div>
      </div>
    </div>
  );
}

