"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

export interface ContextMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: "default" | "destructive";
  separator?: boolean;
}

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/**
 * Hook para gerenciar context menu customizado.
 * Retorna [state, openMenu, ContextMenuPortal]
 *
 * Uso:
 *   const [ctxMenu, openCtxMenu, CtxMenuPortal] = useContextMenu();
 *   <tr onContextMenu={(e) => openCtxMenu(e, items)}>...</tr>
 *   <CtxMenuPortal />
 */
export function useContextMenu() {
  const [state, setState] = React.useState<ContextMenuState>({
    open: false, x: 0, y: 0, items: [],
  });
  const menuRef = React.useRef<HTMLDivElement>(null);

  const openMenu = React.useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - items.length * 42 - 20);
    setState({ open: true, x, y, items });
  }, []);

  const closeMenu = React.useCallback(() => {
    setState(prev => ({ ...prev, open: false }));
  }, []);

  React.useEffect(() => {
    if (!state.open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const handleScroll = () => closeMenu();
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMenu(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [state.open, closeMenu]);

  const Portal = React.useCallback(() => {
    if (!state.open) return null;
    return createPortal(
      <div className="fixed inset-0 z-50">
        <div
          ref={menuRef}
          className="absolute animate-in fade-in-0 zoom-in-95 min-w-[210px] rounded-xl border bg-popover/95 backdrop-blur-sm p-1.5 text-popover-foreground shadow-xl shadow-black/10"
          style={{ left: state.x, top: state.y }}
        >
          {state.items.map((item, i) => (
            <React.Fragment key={i}>
              {item.separator && i > 0 && (
                <div className="my-1 h-px bg-border" />
              )}
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                  item.variant === "destructive"
                    ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                    : "text-foreground hover:bg-accent"
                )}
                onClick={() => {
                  closeMenu();
                  item.onClick();
                }}
              >
                {item.icon && <item.icon className="h-4 w-4 opacity-60" />}
                {item.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>,
      document.body
    );
  }, [state, closeMenu]);

  return [openMenu, Portal] as const;
}
