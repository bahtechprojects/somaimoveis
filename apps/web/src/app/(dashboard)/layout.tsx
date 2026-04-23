"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarProvider } from "@/components/layout/sidebar";
import { BottomNav, type BottomNavItem } from "@/components/layout/bottom-nav";
import { canAccessRoute, getUserAllowedPages, PAGES } from "@/lib/rbac";
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
  const userPermissions = (session?.user as any)?.permissions || null;

  const filteredMore = moreItems.filter((item) =>
    canAccessRoute(userRole, item.href, userPermissions)
  );

  return <BottomNav primaryItems={primaryItems} moreItems={filteredMore} />;
}

/**
 * Guard de rota: se o usuario nao tem permissao para a rota atual,
 * redireciona para a primeira rota permitida.
 */
function RouteGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const userRole = (session?.user as any)?.role || "";
  const userPermissions = (session?.user as any)?.permissions || null;

  useEffect(() => {
    if (status !== "authenticated") return;

    // Rotas que nunca devem ser bloqueadas (perfil do proprio usuario, etc)
    const alwaysAllowed = ["/perfil"];
    if (alwaysAllowed.some((p) => pathname.startsWith(p))) return;

    const allowed = canAccessRoute(userRole, pathname, userPermissions);
    if (!allowed) {
      const allowedPages = getUserAllowedPages(userRole, userPermissions);
      // Preferir dashboard se permitido
      if (allowedPages.includes("dashboard") && pathname !== "/") {
        router.replace("/");
        return;
      }
      // Senao, primeira pagina que ele pode ver
      const firstPage = PAGES.find(
        (p) => p.key !== "dashboard" && allowedPages.includes(p.key)
      );
      if (firstPage && firstPage.path !== pathname) {
        router.replace(firstPage.path);
      } else {
        router.replace("/perfil");
      }
    }
  }, [status, pathname, userRole, userPermissions, router]);

  return <>{children}</>;
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
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
      <DashboardBottomNav />
    </SidebarProvider>
  );
}
