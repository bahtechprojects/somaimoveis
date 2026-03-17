"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  Lock,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";

export default function EsqueciSenhaPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=email, 2=code+password, 3=success
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao enviar codigo");
        return;
      }

      setSuccessMessage(data.message);
      setStep(2);
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("As senhas nao coincidem");
      return;
    }

    if (newPassword.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao redefinir senha");
        return;
      }

      setStep(3);
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-background p-8 shadow-lg">
        {/* Logo */}
        <div className="flex justify-center pb-2">
          <Image
            src="/logo-somma.webp"
            alt="Somma Imoveis"
            width={160}
            height={64}
            className="object-contain"
            priority
          />
        </div>

        {/* Step 1: Enter Email */}
        {step === 1 && (
          <>
            <div className="flex flex-col items-center pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <p className="text-xl font-medium">Recuperar Senha</p>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Informe seu email para receber o codigo de recuperacao
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <form className="flex flex-col gap-3" onSubmit={handleRequestCode}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                  disabled={loading}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-medium mt-2"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar Codigo"
                )}
              </Button>
            </form>

            <Link
              href="/login"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary hover:underline mt-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>
          </>
        )}

        {/* Step 2: Enter Code + New Password */}
        {step === 2 && (
          <>
            <div className="flex flex-col items-center pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <p className="text-xl font-medium">Redefinir Senha</p>
              <p className="text-sm text-muted-foreground text-center mt-1">
                Digite o codigo recebido e sua nova senha
              </p>
            </div>

            {successMessage && (
              <div className="bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 text-sm p-3 rounded-lg text-center">
                {successMessage}
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">
                {error}
              </div>
            )}

            <form
              className="flex flex-col gap-3"
              onSubmit={handleResetPassword}
            >
              {/* Email (read-only) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="email-display">Email</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setError("");
                      setSuccessMessage("");
                      setCode("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Alterar
                  </button>
                </div>
                <Input
                  id="email-display"
                  type="email"
                  value={email}
                  readOnly
                  className="h-11 bg-muted/50"
                />
              </div>

              {/* Code */}
              <div className="space-y-2">
                <Label htmlFor="code">Codigo de Recuperacao</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(val);
                  }}
                  required
                  maxLength={6}
                  className="h-12 text-center text-xl font-mono tracking-[0.5em]"
                  disabled={loading}
                />
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Senha</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 pr-10"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-medium mt-2"
                disabled={loading || code.length !== 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Redefinindo...
                  </>
                ) : (
                  "Redefinir Senha"
                )}
              </Button>
            </form>

            <Link
              href="/login"
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary hover:underline mt-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>

            {/* Dev hint */}
            {process.env.NODE_ENV === "development" && (
              <p className="text-xs text-center text-muted-foreground/60 mt-1 border-t pt-3">
                Verifique o console do servidor para o codigo
              </p>
            )}
          </>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <>
            <div className="flex flex-col items-center py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/30 mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-xl font-medium">Senha Redefinida!</p>
              <p className="text-sm text-muted-foreground text-center mt-2">
                Sua senha foi alterada com sucesso. Voce ja pode fazer login com
                a nova senha.
              </p>
            </div>

            <Link href="/login" className="w-full">
              <Button className="w-full h-11 font-medium">
                Ir para o Login
              </Button>
            </Link>
          </>
        )}

        {/* Footer */}
        <p className="text-sm text-center text-muted-foreground pt-4">
          Somma Imoveis &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
