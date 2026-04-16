"use client";

import { useSession } from "next-auth/react";
import { SidebarProvider } from "@/components/layout/sidebar";
import { BottomNav, type BottomNavItem } from "@/components/layout/bottom-nav";
import { canAccessRoute } from "@/lib/rbac";
import {
  LayoutDashboard,
  Building2,
  DollarSign,
  FileText,
  Users,
  UserCheck,
  BarChart3,
  Receipt,
  Bell,
  UsersRound,
  Settings,
} from "lucide-react";

const primaryItems: BottomNavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, exact: true },
  { label: "Imóveis", href: "/imoveis", icon: Building2 },
  { label: "Financeiro", href: "/financeiro", icon: DollarSign },
  { label: "Contratos", href: "/contratos", icon: FileText },
];

const moreItems: BottomNavItem[] = [
  { label: "Proprietários", href: "/proprietarios", icon: Users },
  { label: "Locatários", href: "/locatarios", icon: UserCheck },
  { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
  { label: "Fiscal", href: "/fiscal", icon: Receipt },
  { label: "Notas Fiscais", href: "/notas-fiscais", icon: FileText },
  { label: "Notificações", href: "/notificacoes", icon: Bell },
  { label: "Usuários", href: "/usuarios", icon: UsersRound },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];

function DashboardBottomNav() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "CORRETOR";

  const filteredMore = moreItems.filter((item) => canAccessRoute(userRole, item.href));

  return <BottomNav primaryItems={primaryItems} moreItems={filteredMore} />;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen">
        <main className="flex-1 md:ml-[260px] transition-all duration-300 w-full pb-16 md:pb-0">
          {children}
        </main>
      </div>
      <DashboardBottomNav />
    </SidebarProvider>
  );
}
