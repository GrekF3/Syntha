"use client";

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={() => onOpenChange(false)}>
      <div className="fixed inset-0 bg-black/60" />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border bg-popover text-popover-foreground shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogContent({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="p-4 border-b">{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <div className="text-base font-semibold leading-none tracking-tight truncate">{children}</div>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-sm text-muted-foreground">{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="p-4 border-t flex justify-end gap-2">{children}</div>;
}

export function DialogTrigger({ asChild, children, onClick }: { asChild?: boolean; children: ReactNode; onClick?: () => void }) {
  if (asChild) return <>{children}</>;
  return (
    <button type="button" onClick={onClick} className="rounded-md px-3 py-2 text-sm hover:bg-accent">
      {children}
    </button>
  );
}

