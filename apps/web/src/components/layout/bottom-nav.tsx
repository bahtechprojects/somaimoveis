"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Menu, type LucideIcon } from "lucide-react";

export interface BottomNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
}

interface BottomNavProps {
  primaryItems: BottomNavItem[];
  moreItems: BottomNavItem[];
}

function isRouteActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function BottomNav({ primaryItems, moreItems }: BottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some((item) =>
    isRouteActive(pathname, item.href, item.exact)
  );

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-background border-t border-border pb-safe">
        <div className="flex items-stretch justify-around h-16">
          {primaryItems.map((item) => {
            const active = isRouteActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </Link>
            );
          })}

          {/* Mais tab */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
              isMoreActive
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <Menu className={cn("h-5 w-5", isMoreActive && "stroke-[2.5]")} />
            <span className="text-[10px] font-medium leading-tight">Mais</span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8" showCloseButton={false}>
          <SheetTitle className="sr-only">Mais opcoes</SheetTitle>
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-4">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {moreItems.map((item) => {
              const active = isRouteActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl p-4 transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full",
                    active ? "bg-primary/15" : "bg-muted"
                  )}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
