"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Bell,
  MessageCircle,
  Mail,
  Phone,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================================================
// Types
// ==================================================

interface Notification {
  id: string;
  type: string;
  channel: string;
  recipientName: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  templateKey: string;
  subject: string | null;
  message: string;
  status: string;
  sentAt: string | null;
  errorMessage: string | null;
  paymentId: string | null;
  contractId: string | null;
  tenantId: string | null;
  ownerId: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SendBillingResult {
  sent: number;
  skipped: number;
  errors: number;
  details: {
    paymentId: string;
    paymentCode: string;
    tenantName: string;
    action: string;
    result: string;
  }[];
  message?: string;
}

// ==================================================
// Status config
// ==================================================

const statusConfig: Record<
  string,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  PENDENTE: {
    label: "Pendente",
    className: "bg-amber-100 text-amber-700 border-amber-200",
    icon: Clock,
  },
  ENVIADO: {
    label: "Enviado",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  FALHA: {
    label: "Falha",
    className: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
  },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-gray-100 text-gray-500 border-gray-200",
    icon: XCircle,
  },
};

const typeIcons: Record<string, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  SMS: Phone,
};

const templateLabels: Record<string, string> = {
  payment_reminder: "Lembrete de Pagamento",
  payment_overdue: "Pagamento em Atraso",
  payment_received: "Pagamento Confirmado",
  contract_expiring: "Contrato Expirando",
  owner_payment_received: "Repasse ao Proprietario",
  owner_payment_overdue: "Atraso (Proprietario)",
};

// ==================================================
// Helpers
// ==================================================

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhone(phone: string | null): string {
  if (!phone) return "-";
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

function truncateMessage(message: string, maxLength: number = 60): string {
  if (message.length <= maxLength) return message;
  return message.substring(0, maxLength) + "...";
}

// ==================================================
// Page Component
// ==================================================

export default function NotificacoesPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("todas");
  const [selectedNotification, setSelectedNotification] =
    useState<Notification | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendBillingResult | null>(null);
  const [sendResultOpen, setSendResultOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === "whatsapp") params.set("type", "WHATSAPP");
      else if (activeTab === "email") params.set("type", "EMAIL");
      else if (activeTab === "sms") params.set("type", "SMS");
      if (search) params.set("search", search);
      params.set("limit", "200");

      const response = await fetch(`/api/notifications?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error("Erro ao buscar notificacoes:", error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ---- Stats ----
  const totalEnviadas = notifications.filter(
    (n) => n.status === "ENVIADO"
  ).length;
  const totalPendentes = notifications.filter(
    (n) => n.status === "PENDENTE"
  ).length;
  const totalFalhas = notifications.filter((n) => n.status === "FALHA").length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const enviadasHoje = notifications.filter((n) => {
    if (n.status !== "ENVIADO" || !n.sentAt) return false;
    const sentDate = new Date(n.sentAt);
    return sentDate >= today;
  }).length;

  // ---- Send Billing ----
  async function handleSendBilling() {
    setSending(true);
    setSendResult(null);
    try {
      const response = await fetch("/api/notifications/send-billing", {
        method: "POST",
      });
      const data = await response.json();
      setSendResult(data);
      setSendResultOpen(true);
      // Recarregar lista
      fetchNotifications();
    } catch (error) {
      console.error("Erro ao enviar cobrancas:", error);
      setSendResult({
        sent: 0,
        skipped: 0,
        errors: 1,
        details: [],
        message: "Erro de conexao ao processar cobrancas.",
      });
      setSendResultOpen(true);
    } finally {
      setSending(false);
    }
  }

  // ---- Row click ----
  function handleRowClick(notification: Notification) {
    setSelectedNotification(notification);
    setDetailOpen(true);
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Notificacoes"
        subtitle="Gerenciamento de notificacoes e mensagens enviadas"
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Total Enviadas
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : totalEnviadas}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Notificacoes entregues
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Pendentes
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : totalPendentes}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aguardando envio
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Falhas
                  </p>
                  <p className="text-2xl font-bold mt-1 text-red-600">
                    {loading ? "..." : totalFalhas}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Erros no envio
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Enviadas Hoje
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    {loading ? "..." : enviadasHoje}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ultimas 24h
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
                  <Send className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notifications Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="p-3 sm:p-4 border-b space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-auto"
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="todas" className="text-xs h-7 px-2 sm:px-3">
                      Todas
                    </TabsTrigger>
                    <TabsTrigger value="whatsapp" className="text-xs h-7 px-2 sm:px-3">
                      <MessageCircle className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </TabsTrigger>
                    <TabsTrigger value="email" className="text-xs h-7 px-2 sm:px-3">
                      <Mail className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">Email</span>
                    </TabsTrigger>
                    <TabsTrigger value="sms" className="text-xs h-7 px-2 sm:px-3">
                      <Phone className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">SMS</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Button
                  size="sm"
                  className="gap-1.5 h-8 text-xs shrink-0"
                  onClick={handleSendBilling}
                  disabled={sending}
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{sending ? "Enviando..." : "Enviar Cobrancas"}</span>
                  <span className="sm:hidden">{sending ? "..." : "Enviar"}</span>
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar destinatario..."
                  className="pl-9 h-8 w-full text-xs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Carregando...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Bell className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "Nenhuma notificacao encontrada para a busca."
                    : "Nenhuma notificacao enviada ainda."}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Clique em &quot;Enviar Cobrancas&quot; para processar os
                  pagamentos pendentes.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile: Card list */}
                <div className="md:hidden divide-y">
                  {notifications.map((notification) => {
                    const status = statusConfig[notification.status] || {
                      label: notification.status,
                      className: "bg-muted text-muted-foreground",
                      icon: Clock,
                    };
                    const StatusIcon = status.icon;
                    const TypeIcon =
                      typeIcons[notification.type] || MessageCircle;

                    return (
                      <button
                        key={notification.id}
                        className="w-full text-left p-3 hover:bg-muted/30 transition-colors"
                        onClick={() => handleRowClick(notification)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            notification.type === "WHATSAPP" ? "bg-emerald-100" :
                            notification.type === "EMAIL" ? "bg-blue-100" : "bg-violet-100"
                          )}>
                            <TypeIcon className={cn(
                              "h-4 w-4",
                              notification.type === "WHATSAPP" ? "text-emerald-600" :
                              notification.type === "EMAIL" ? "text-blue-600" : "text-violet-600"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">
                                {notification.recipientName}
                              </p>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] border gap-1 shrink-0",
                                  status.className
                                )}
                              >
                                <StatusIcon className="h-2.5 w-2.5" />
                                {status.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {templateLabels[notification.templateKey] ||
                                notification.templateKey}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">
                              {truncateMessage(notification.message, 80)}
                            </p>
                            <p className="text-[10px] text-muted-foreground/50 mt-1">
                              {formatDateTime(notification.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Desktop: Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs whitespace-nowrap">Data</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">Tipo</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">Destinatario</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">Template</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">Mensagem</TableHead>
                        <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notifications.map((notification) => {
                        const status = statusConfig[notification.status] || {
                          label: notification.status,
                          className: "bg-muted text-muted-foreground",
                          icon: Clock,
                        };
                        const StatusIcon = status.icon;
                        const TypeIcon =
                          typeIcons[notification.type] || MessageCircle;

                        return (
                          <TableRow
                            key={notification.id}
                            className="cursor-pointer"
                            onClick={() => handleRowClick(notification)}
                          >
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDateTime(notification.createdAt)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs">
                                  {notification.type}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-xs font-medium">
                                  {notification.recipientName}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {formatPhone(notification.recipientPhone)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {templateLabels[notification.templateKey] ||
                                notification.templateKey}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[250px]">
                              {truncateMessage(notification.message)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs border gap-1",
                                  status.className
                                )}
                              >
                                <StatusIcon className="h-3 w-3" />
                                {status.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Notification Detail Dialog ---- */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Detalhes da Notificacao
            </DialogTitle>
            <DialogDescription>
              Informacoes completas sobre a notificacao enviada.
            </DialogDescription>
          </DialogHeader>

          {selectedNotification && (
            <div className="space-y-4 mt-2">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                {(() => {
                  const s =
                    statusConfig[selectedNotification.status] || {
                      label: selectedNotification.status,
                      className: "bg-muted text-muted-foreground",
                      icon: Clock,
                    };
                  const SIcon = s.icon;
                  return (
                    <Badge
                      variant="outline"
                      className={cn("text-xs border gap-1", s.className)}
                    >
                      <SIcon className="h-3 w-3" />
                      {s.label}
                    </Badge>
                  );
                })()}
              </div>

              {/* Tipo / Canal */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tipo</p>
                  <p className="text-sm font-medium">
                    {selectedNotification.type}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Template
                  </p>
                  <p className="text-sm font-medium">
                    {templateLabels[selectedNotification.templateKey] ||
                      selectedNotification.templateKey}
                  </p>
                </div>
              </div>

              {/* Destinatario */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Destinatario
                </p>
                <p className="text-sm font-medium">
                  {selectedNotification.recipientName}
                </p>
                {selectedNotification.recipientPhone && (
                  <p className="text-xs text-muted-foreground">
                    Tel: {formatPhone(selectedNotification.recipientPhone)}
                  </p>
                )}
                {selectedNotification.recipientEmail && (
                  <p className="text-xs text-muted-foreground">
                    Email: {selectedNotification.recipientEmail}
                  </p>
                )}
              </div>

              {/* Assunto */}
              {selectedNotification.subject && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assunto</p>
                  <p className="text-sm">{selectedNotification.subject}</p>
                </div>
              )}

              {/* Mensagem completa */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Mensagem</p>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedNotification.message}
                  </p>
                </div>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Criada em
                  </p>
                  <p className="text-xs">
                    {formatDateTime(selectedNotification.createdAt)}
                  </p>
                </div>
                {selectedNotification.sentAt && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Enviada em
                    </p>
                    <p className="text-xs">
                      {formatDateTime(selectedNotification.sentAt)}
                    </p>
                  </div>
                )}
              </div>

              {/* Erro */}
              {selectedNotification.errorMessage && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Mensagem de Erro
                  </p>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-700">
                        {selectedNotification.errorMessage}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* IDs de referencia */}
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Referencias
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {selectedNotification.paymentId && (
                    <div>
                      <span className="text-muted-foreground">
                        Pagamento:{" "}
                      </span>
                      <span className="font-mono">
                        {selectedNotification.paymentId.substring(0, 12)}...
                      </span>
                    </div>
                  )}
                  {selectedNotification.contractId && (
                    <div>
                      <span className="text-muted-foreground">
                        Contrato:{" "}
                      </span>
                      <span className="font-mono">
                        {selectedNotification.contractId.substring(0, 12)}...
                      </span>
                    </div>
                  )}
                  {selectedNotification.tenantId && (
                    <div>
                      <span className="text-muted-foreground">
                        Locatario:{" "}
                      </span>
                      <span className="font-mono">
                        {selectedNotification.tenantId.substring(0, 12)}...
                      </span>
                    </div>
                  )}
                  {selectedNotification.ownerId && (
                    <div>
                      <span className="text-muted-foreground">
                        Proprietario:{" "}
                      </span>
                      <span className="font-mono">
                        {selectedNotification.ownerId.substring(0, 12)}...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Send Billing Result Dialog ---- */}
      <Dialog open={sendResultOpen} onOpenChange={setSendResultOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Resultado do Envio de Cobrancas
            </DialogTitle>
            <DialogDescription>
              Resumo do processamento das notificacoes de cobranca.
            </DialogDescription>
          </DialogHeader>

          {sendResult && (
            <div className="space-y-4 mt-2">
              {sendResult.message && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-700">
                    {sendResult.message}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-600">
                    {sendResult.sent}
                  </p>
                  <p className="text-xs text-emerald-600/70">Enviadas</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-2xl font-bold text-amber-600">
                    {sendResult.skipped}
                  </p>
                  <p className="text-xs text-amber-600/70">Ignoradas</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {sendResult.errors}
                  </p>
                  <p className="text-xs text-red-600/70">Erros</p>
                </div>
              </div>

              {sendResult.details.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Detalhes
                  </p>
                  <div className="max-h-[200px] overflow-y-auto space-y-1.5">
                    {sendResult.details.map((detail, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs bg-muted/50 rounded px-3 py-2"
                      >
                        <div>
                          <span className="font-medium">
                            {detail.tenantName}
                          </span>
                          <span className="text-muted-foreground ml-1">
                            ({detail.paymentCode})
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            detail.result === "enviado"
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : detail.result.startsWith("ja_enviado")
                              ? "bg-amber-100 text-amber-700 border-amber-200"
                              : detail.result === "sem_telefone" ||
                                detail.result === "sem_telefone_locatario"
                              ? "bg-gray-100 text-gray-500 border-gray-200"
                              : "bg-red-100 text-red-700 border-red-200"
                          )}
                        >
                          {detail.result === "enviado"
                            ? "Enviado"
                            : detail.result === "ja_enviado" ||
                              detail.result === "ja_enviado_hoje"
                            ? "Ja enviado"
                            : detail.result === "sem_telefone" ||
                              detail.result === "sem_telefone_locatario"
                            ? "Sem telefone"
                            : "Erro"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
