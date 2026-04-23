"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { usePortal } from "@/components/portal/portal-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User, Mail, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

function PerfilContent() {
  const { owner, token } = usePortal();
  const searchParams = useSearchParams();
  const mustDefinePassword = searchParams.get("definir-senha") === "1";

  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Buscar se ja tem senha definida
  useEffect(() => {
    if (!token) return;
    fetch("/api/portal/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setHasPassword(!!data.hasPassword);
      })
      .catch(() => {});
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas nao conferem");
      return;
    }
    if (hasPassword && !currentPassword) {
      toast.error("Informe sua senha atual");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/portal/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Erro ao alterar senha");
        return;
      }

      toast.success(data.message || "Senha atualizada com sucesso");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
    } catch {
      toast.error("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seus dados de acesso ao portal
        </p>
      </div>

      {/* Banner pra primeiro acesso */}
      {mustDefinePassword && !hasPassword && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Primeiro acesso detectado
              </p>
              <p className="text-xs text-amber-800 mt-1">
                Defina uma senha agora para nao depender mais do token em proximos
                acessos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info basica */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Informacoes da conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Nome</p>
              <p className="font-medium">{owner?.name || "-"}</p>
            </div>
          </div>
          {owner?.email && (
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{owner.email}</p>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Para atualizar nome, email ou outros dados cadastrais, entre em
            contato com a Somma Imoveis.
          </p>
        </CardContent>
      </Card>

      {/* Alterar senha */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            {hasPassword ? "Alterar Senha" : "Definir Senha"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {hasPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="current">Senha Atual</Label>
                <Input
                  id="current"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new">Nova Senha</Label>
              <Input
                id="new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                autoComplete="new-password"
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar Nova Senha</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Digite a nova senha novamente"
                autoComplete="new-password"
                required
                minLength={6}
                disabled={loading}
              />
            </div>

            {!hasPassword && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-800">
                  Apos definir sua senha, voce podera usa-la nos proximos acessos
                  — o token inicial continuara funcionando como alternativa caso
                  esqueca.
                </p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                hasPassword ? "Alterar Senha" : "Definir Senha"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PortalPerfilPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[40vh]"><p className="text-sm text-muted-foreground">Carregando...</p></div>}>
      <PerfilContent />
    </Suspense>
  );
}
