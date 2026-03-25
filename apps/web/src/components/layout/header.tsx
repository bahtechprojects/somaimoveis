"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Bell, Search, Plus, ChevronDown, Building2, FileText, Users, UserPlus, DollarSign, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
interface HeaderProps {
  title: string;
  subtitle?: string;
}

function getInitials(name: string): string {
  return name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    fetch("/api/notifications?status=PENDENTE&limit=50")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown[]) => setNotifCount(data.length))
      .catch(() => {});
  }, []);
  const userName = session?.user?.name || "Usuário";
  const initials = getInitials(userName);

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 sm:px-6">
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Search - desktop only */}
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar imóveis, contratos..."
            className="w-[280px] pl-9 h-9 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>

        {/* Quick actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1 h-10 sm:h-9 px-3 sm:px-3 min-w-[44px]">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo</span>
              <ChevronDown className="h-3 w-3 hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push("/imoveis?novo=true")}>
              <Building2 className="h-4 w-4 mr-2" />
              Novo Imóvel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/contratos?novo=true")}>
              <FileText className="h-4 w-4 mr-2" />
              Novo Contrato
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/proprietarios?novo=true")}>
              <Users className="h-4 w-4 mr-2" />
              Novo Proprietário
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/locatarios?novo=true")}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Locatário
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/financeiro?novo=true")}>
              <DollarSign className="h-4 w-4 mr-2" />
              Nova Cobrança
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative h-10 w-10 sm:h-9 sm:w-9" onClick={() => router.push("/notificacoes")}>
          <Bell className="h-4 w-4" />
          {notifCount > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px]">
              {notifCount > 9 ? "9+" : notifCount}
            </Badge>
          )}
        </Button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-1.5 sm:px-2 h-10 sm:h-9">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden md:inline">{userName}</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => router.push("/perfil")}>
              <User className="h-4 w-4 mr-2" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/configuracoes")}>
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
