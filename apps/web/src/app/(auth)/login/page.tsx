"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Building2, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Email ou senha incorretos");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Erro ao fazer login. Tente novamente.");
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
            alt="Somma Imóveis"
            width={220}
            height={88}
            className="object-contain mx-auto mb-8"
            priority
          />
          <div className="space-y-4 text-left">
            {[
              "Gerencie todos os seus imoveis em um so lugar",
              "Contratos e cobranças automatizados",
              "Dashboard em tempo real com indicadores",
              "Split de pagamentos automatico",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sidebar-foreground/80">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20">
                  <Building2 className="h-3.5 w-3.5 text-sidebar-primary" />
                </div>
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex flex-1 items-center justify-center bg-muted/30 p-6">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-background p-8 shadow-lg">
          {/* Header */}
          <div className="flex flex-col items-center pb-6">
            <Image
              src="/logo-somma.webp"
              alt="Somma Imóveis"
              width={160}
              height={64}
              className="object-contain mb-4 lg:hidden"
              priority
            />
            <p className="text-xl font-medium">Bem-vindo de volta</p>
            <p className="text-sm text-muted-foreground">
              Entre na sua conta para continuar
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {/* Form */}
          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="seu@email.com"
                required
                className="h-11"
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={isVisible ? "text" : "password"}
                  placeholder="Digite sua senha"
                  required
                  className="h-11 pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setIsVisible(!isVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {isVisible ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex w-full items-center justify-between px-1 py-2">
              <div className="flex items-center gap-2">
                <Checkbox id="remember" name="remember" />
                <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                  Lembrar de mim
                </Label>
              </div>
              <Link
                href="/esqueci-senha"
                className="text-sm text-muted-foreground hover:text-primary hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>

            <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-sm text-center text-muted-foreground pt-4">
            Somma Imoveis &copy; {new Date().getFullYear()}
          </p>

          {/* Dev hint */}
          <p className="text-xs text-center text-muted-foreground/60">
            admin@somma.com.br / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
