"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePortal } from "@/components/portal/portal-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Building2,
  FileText,
  DollarSign,
  Receipt,
  LogOut,
  ChevronDown,
  UserCog,
} from "lucide-react";

const navigation = [
  {
    label: "Dashboard",
    href: "/portal",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Imóveis",
    href: "/portal/imoveis",
    icon: Building2,
  },
  {
    label: "Contratos",
    href: "/portal/contratos",
    icon: FileText,
  },
  {
    label: "Financeiro",
    href: "/portal/financeiro",
    icon: DollarSign,
  },
  {
    label: "Extrato",
    href: "/portal/extrato",
    icon: Receipt,
  },
  {
    label: "Fiscal",
    href: "/portal/fiscal",
    icon: FileText,
  },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function PortalNavbar() {
  const { owner, logout } = usePortal();
  const pathname = usePathname();

  const ownerName = owner?.name || "Proprietário";
  const initials = getInitials(ownerName);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 md:h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/portal" className="flex items-center gap-2 shrink-0">
            <Image
              src="/logo-somma.webp"
              alt="Somma Imoveis"
              width={120}
              height={48}
              className="object-contain"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 ml-8">
            {navigation.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-1.5 sm:px-2 h-8 sm:h-9">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium max-w-[150px] truncate hidden sm:inline">
                  {ownerName}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{ownerName}</p>
                {owner?.email && (
                  <p className="text-xs text-muted-foreground truncate">
                    {owner.email}
                  </p>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/portal/perfil">
                  <UserCog className="h-4 w-4 mr-2" />
                  Meu Perfil / Senha
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive cursor-pointer"
                onClick={logout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair do Portal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
