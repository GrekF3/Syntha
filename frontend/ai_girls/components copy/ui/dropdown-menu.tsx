"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <div className="relative inline-block">{children}</div>;
}

export function DropdownMenuTrigger({ children, onOpenChange }: { children: ReactNode; onOpenChange?: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.parentElement?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  return (
    <button
      ref={ref}
      type="button"
      className="inline-flex items-center"
      aria-haspopup="menu"
      aria-expanded={open}
      onMouseDownCapture={(e) => { setOpen((v) => !v); }}
      data-menu-trigger
    >
      {children}
      <input type="hidden" value={open ? "1" : "0"} readOnly />
    </button>
  );
}

export function DropdownMenuContent({ open, children, align = "end" }: { open: boolean; children: ReactNode; align?: "start" | "end" }) {
  if (!open) return null;
  return (
    <div
      className={`absolute z-50 mt-1 min-w-40 rounded-md border bg-popover text-popover-foreground shadow-md ${align === "end" ? "right-0" : "left-0"}`}
      data-actions-menu
      tabIndex={-1}
      role="menu"
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({ children, onSelect, className = "" }: { children: ReactNode; onSelect?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onSelect} className={`w-full text-left px-3 py-2 text-sm hover:bg-sidebar-accent ${className}`}>
      {children}
    </button>
  );
}
