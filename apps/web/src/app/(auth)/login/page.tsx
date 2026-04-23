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
import {
  Eye,
  EyeOff,
  Loader2,
  Building2,
  FileText,
  TrendingUp,
  Shield,
  Sparkles,
} from "lucide-react";

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

  const features = [
    {
      icon: Building2,
      title: "Gestao completa de imoveis",
      description: "Cadastro, contratos, fotos e historico em um unico lugar",
    },
    {
      icon: FileText,
      title: "Cobrancas automatizadas",
      description: "Boletos, PIX e regua de cobranca com poucos cliques",
    },
    {
      icon: TrendingUp,
      title: "Indicadores em tempo real",
      description: "Dashboard com rentabilidade, ocupacao e inadimplencia",
    },
    {
      icon: Shield,
      title: "Split de pagamentos seguro",
      description: "Repasse automatico aos proprietarios com rastreabilidade total",
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#0a1a0f]">
      {/* Left - Brand */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1a0f] via-[#12301c] to-[#1f4a30]" />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
          }}
        />

        {/* Radial glow decorations */}
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#d4a556] opacity-10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[#2d6b45] opacity-20 blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-between p-12 xl:p-16">
          {/* Top: logo + badge */}
          <div>
            <Image
              src="/logo-somma.webp"
              alt="Somma Imoveis"
              width={180}
              height={72}
              className="object-contain mb-10"
              priority
            />

            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-sm mb-8">
              <Sparkles className="h-3 w-3 text-[#d4a556]" />
              <span className="text-[11px] font-medium text-white/70 tracking-wide">
                Plataforma de Gestao Imobiliaria
              </span>
            </div>

            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight max-w-md">
              Administre imoveis com
              <span className="block bg-gradient-to-r from-[#d4a556] to-[#e8c989] bg-clip-text text-transparent mt-1">
                precisao e elegancia.
              </span>
            </h1>
            <p className="mt-4 text-white/60 text-sm max-w-md leading-relaxed">
              Uma experiencia pensada para quem valoriza organizacao,
              transparencia e produtividade no mercado imobiliario.
            </p>
          </div>

          {/* Middle: features */}
          <div className="space-y-5 my-10">
            {features.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d4a556]/20 bg-gradient-to-br from-[#d4a556]/15 to-[#d4a556]/5 backdrop-blur-sm">
                  <Icon className="h-4 w-4 text-[#d4a556]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-white/50 leading-relaxed mt-0.5">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom: copy */}
          <div className="flex items-center justify-between text-xs text-white/40">
            <span>&copy; {new Date().getFullYear()} Somma Imoveis</span>
            <span>Todos os direitos reservados</span>
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="relative flex flex-1 items-center justify-center bg-[#fafaf8] p-6 lg:p-10">
        {/* Subtle decoration */}
        <div className="absolute top-0 right-0 h-80 w-80 rounded-full bg-[#d4a556] opacity-[0.04] blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[#2d6b45] opacity-[0.04] blur-3xl" />

        <div className="relative w-full max-w-md">
          {/* Card */}
          <div className="flex flex-col gap-5 rounded-2xl border border-black/[0.04] bg-white p-8 lg:p-10 shadow-[0_8px_40px_-12px_rgba(10,26,15,0.2)]">
            {/* Header */}
            <div className="flex flex-col items-center text-center pb-2">
              <Image
                src="/logo-somma.webp"
                alt="Somma Imoveis"
                width={140}
                height={56}
                className="object-contain mb-5 lg:hidden"
                priority
              />
              <h2 className="text-2xl font-bold tracking-tight text-[#0a1a0f]">
                Bem-vindo de volta
              </h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Entre na sua conta para continuar
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg text-center animate-in fade-in slide-in-from-top-1 duration-200">
                {error}
              </div>
            )}

            {/* Form */}
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-[#0a1a0f] tracking-wide uppercase">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                  className="h-11 bg-[#fafaf8] border-black/[0.08] focus-visible:border-[#2d6b45] focus-visible:ring-[#2d6b45]/15"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold text-[#0a1a0f] tracking-wide uppercase">
                    Senha
                  </Label>
                  <Link
                    href="/esqueci-senha"
                    className="text-xs text-[#2d6b45] hover:text-[#1f4a30] hover:underline underline-offset-2 transition-colors"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={isVisible ? "text" : "password"}
                    placeholder="Digite sua senha"
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10 bg-[#fafaf8] border-black/[0.08] focus-visible:border-[#2d6b45] focus-visible:ring-[#2d6b45]/15"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setIsVisible(!isVisible)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-[#0a1a0f] transition-colors"
                    aria-label={isVisible ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {isVisible ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="remember" name="remember" />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal cursor-pointer text-muted-foreground"
                >
                  Manter-me conectado
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-semibold bg-gradient-to-r from-[#1f4a30] to-[#2d6b45] hover:from-[#2d6b45] hover:to-[#3d8559] text-white shadow-md shadow-[#1f4a30]/20 transition-all"
                disabled={loading}
              >
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

            {/* Divider + footer */}
            <div className="pt-2 text-center">
              <p className="text-xs text-muted-foreground/70">
                Problemas para acessar?{" "}
                <a
                  href="mailto:suporte@sommaimob.com.br"
                  className="text-[#2d6b45] hover:underline underline-offset-2 font-medium"
                >
                  Fale com o suporte
                </a>
              </p>
            </div>
          </div>

          {/* Below-card copy */}
          <p className="text-xs text-center text-muted-foreground/60 mt-6">
            Protegido com criptografia de ponta a ponta
          </p>
        </div>
      </div>
    </div>
  );
}
