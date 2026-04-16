"use client";

import { useState, createContext, useContext } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { canAccessRoute } from "@/lib/rbac";
import {
  Building2,
  LayoutDashboard,
  FileText,
  Users,
  UserCheck,
  DollarSign,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  UsersRound,
  Receipt,
  Menu,
  ArrowUpRight,
} from "lucide-react";

const navigation = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Imóveis",
    href: "/imoveis",
    icon: Building2,
  },
  {
    label: "Proprietários",
    href: "/proprietarios",
    icon: Users,
  },
  {
    label: "Locatários",
    href: "/locatarios",
    icon: UserCheck,
  },
  {
    label: "Contratos",
    href: "/contratos",
    icon: FileText,
  },
  {
    label: "Financeiro",
    href: "/financeiro",
    icon: DollarSign,
  },
  {
    label: "Repasses",
    href: "/repasses",
    icon: ArrowUpRight,
  },
  {
    label: "Lançamentos",
    href: "/lancamentos",
    icon: Receipt,
  },
  {
    label: "Relatórios",
    href: "/relatorios",
    icon: BarChart3,
  },
  {
    label: "Fiscal",
    href: "/fiscal",
    icon: Receipt,
  },
  {
    label: "Notas Fiscais",
    href: "/notas-fiscais",
    icon: FileText,
  },
  {
    label: "Notificações",
    href: "/notificacoes",
    icon: Bell,
  },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: UsersRound,
    adminOnly: true,
  },
];

const bottomNavigation = [
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: Settings,
  },
];

// Context to share sidebar state with layout
const SidebarContext = createContext({ collapsed: false, mobileOpen: false, setMobileOpen: (_: boolean) => {} });
export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, mobileOpen, setMobileOpen }}>
      {children}
      {/* Desktop sidebar */}
      <DesktopSidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      {/* Mobile sidebar (Sheet) */}
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
    </SidebarContext.Provider>
  );
}

// Mobile hamburger button - rendered from the header/layout
export function MobileMenuButton() {
  const { setMobileOpen } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="md:hidden h-9 w-9"
      onClick={() => setMobileOpen(true)}
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}

function NavLinks({
  items,
  collapsed,
  onNavigate,
}: {
  items: typeof navigation;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "CORRETOR";

  const filtered = items.filter((item) => {
    if ((item as any).adminOnly && userRole !== "ADMIN") return false;
    return canAccessRoute(userRole, item.href);
  });

  return (
    <ul className="space-y-1">
      {filtered.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        const linkContent = (
          <Link
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {isActive && !collapsed && (
              <div className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
            )}
          </Link>
        );

        if (collapsed) {
          return (
            <li key={item.href}>
              <Tooltip>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        }

        return <li key={item.href}>{linkContent}</li>;
      })}
    </ul>
  );
}

function DesktopSidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <aside
      className={cn(
        "hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-4">
        <Image
          src="/logo-somma.webp"
          alt="Somma Imóveis"
          width={collapsed ? 40 : 160}
          height={collapsed ? 40 : 64}
          className="object-contain transition-all duration-300"
          priority
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks items={navigation} collapsed={collapsed} />
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <NavLinks items={bottomNavigation} collapsed={collapsed} />

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={onToggleCollapse}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="text-xs">Recolher</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

function MobileSidebar({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0 bg-sidebar">
        <SheetTitle className="sr-only">Menu de navegacao</SheetTitle>
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-4">
          <Image
            src="/logo-somma.webp"
            alt="Somma Imóveis"
            width={160}
            height={64}
            className="object-contain"
            priority
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks items={navigation} collapsed={false} onNavigate={() => onOpenChange(false)} />
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border px-3 py-3">
          <NavLinks items={bottomNavigation} collapsed={false} onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Keep backward-compatible export
export function Sidebar() {
  return null; // Rendering is now handled by SidebarProvider
}
