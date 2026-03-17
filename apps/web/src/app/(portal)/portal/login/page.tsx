"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { usePortal } from "@/components/portal/portal-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, Loader2, ArrowLeft, Building2 } from "lucide-react";

export default function PortalLoginPage() {
  const router = useRouter();
  const { login } = usePortal();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const identifier = (formData.get("identifier") as string).trim();
    const token = (formData.get("token") as string).trim();

    if (!identifier || !token) {
      setError("Preencha todos os campos");
      setLoading(false);
      return;
    }

    // Determine if identifier is email or CPF/CNPJ
    const isEmail = identifier.includes("@");
    const body = isEmail
      ? { email: identifier, token }
      : { cpfCnpj: identifier, token };

    try {
      const response = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Erro ao autenticar");
        return;
      }

      login(data.token, data.owner);
      router.replace("/portal");
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left - Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar items-center justify-center p-12">
        <div className="max-w-md text-center">
          <Image
            src="/logo-somma.webp"
            alt="Somma Imoveis"
            width={220}
            height={88}
            className="object-contain mx-auto mb-8"
            priority
          />
          <h2 className="text-2xl font-semibold text-sidebar-foreground mb-4">
            Portal do Proprietario
          </h2>
          <p className="text-sidebar-foreground/70 mb-8">
            Acompanhe seus imoveis, contratos e financeiro de forma simples e
            transparente.
          </p>
          <div className="space-y-4 text-left">
            {[
              "Visualize todos os seus imoveis e contratos",
              "Acompanhe pagamentos em tempo real",
              "Acesse extratos financeiros detalhados",
              "Transparencia total na gestao dos seus ativos",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 text-sidebar-foreground/80"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20">
                  <Building2 className="h-3.5 w-3.5 text-sidebar-primary" />
                </div>
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Login Form */}
      <div className="flex flex-1 items-center justify-center bg-muted/30 p-6">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-background p-8 shadow-lg">
          {/* Header */}
          <div className="flex flex-col items-center pb-4">
            <Image
              src="/logo-somma.webp"
              alt="Somma Imoveis"
              width={160}
              height={64}
              className="object-contain mb-4 lg:hidden"
              priority
            />
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-primary">
                Portal do Proprietario
              </span>
            </div>
            <p className="text-xl font-medium">Acesse sua conta</p>
            <p className="text-sm text-muted-foreground text-center">
              Use suas credenciais de acesso ao portal
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {/* Form */}
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="identifier">Email ou CPF/CNPJ</Label>
              <Input
                id="identifier"
                name="identifier"
                type="text"
                placeholder="seu@email.com ou 000.000.000-00"
                required
                className="h-11"
                disabled={loading}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">Token de Acesso</Label>
              <div className="relative">
                <Input
                  id="token"
                  name="token"
                  type={showToken ? "text" : "password"}
                  placeholder="Digite seu token de acesso"
                  required
                  className="h-11 pr-10"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Token fornecido pela administracao da Somma
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-medium mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar no Portal"
              )}
            </Button>
          </form>

          {/* Footer links */}
          <div className="flex flex-col items-center gap-3 pt-4 border-t border-border">
            <Link
              href="/login"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao sistema
            </Link>
            <p className="text-xs text-muted-foreground/60">
              Somma Imoveis &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
