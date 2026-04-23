"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { usePortal } from "@/components/portal/portal-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  Building2,
  FileText,
  BarChart3,
  Lock,
  Sparkles,
} from "lucide-react";

function PortalLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = usePortal();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  // Pre-preenchimento via URL (link enviado pela imobiliaria)
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");

  useEffect(() => {
    const emailParam = searchParams.get("email") || searchParams.get("user");
    const tokenParam = searchParams.get("token");
    if (emailParam) setIdentifier(emailParam);
    if (tokenParam) setSecret(tokenParam);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const id = identifier.trim();
    const pw = secret.trim();

    if (!id || !pw) {
      setError("Preencha todos os campos");
      setLoading(false);
      return;
    }

    const isEmail = id.includes("@");
    // Envia o valor digitado em AMBOS os campos (password e token) - a API
    // decide qual usar de acordo com o que o proprietario ja definiu
    const body: Record<string, string> = {
      password: pw,
      token: pw,
    };
    if (isEmail) body.email = id;
    else body.cpfCnpj = id;

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

      // Se precisa definir senha (primeiro acesso), manda pro perfil
      if (data.mustSetPassword) {
        router.replace("/portal/perfil?definir-senha=1");
      } else {
        router.replace("/portal");
      }
    } catch {
      setError("Erro de conexao. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: Building2,
      title: "Seus imoveis em tempo real",
      description: "Acompanhe o status e ocupacao de cada unidade",
    },
    {
      icon: FileText,
      title: "Contratos e documentos",
      description: "Acesse extratos, comprovantes e relatorios fiscais",
    },
    {
      icon: BarChart3,
      title: "Rentabilidade detalhada",
      description: "Veja quanto cada imovel esta gerando mes a mes",
    },
    {
      icon: Lock,
      title: "Transparencia e seguranca",
      description: "Todos os seus dados protegidos com criptografia",
    },
  ];

  return (
    <div className="flex min-h-screen bg-[#0a1a0f]">
      {/* Left - Brand */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1a0f] via-[#12301c] to-[#1f4a30]" />

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

        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#d4a556] opacity-10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[#2d6b45] opacity-20 blur-3xl" />

        <div className="relative z-10 flex flex-1 flex-col justify-between p-12 xl:p-16">
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
                Portal do Proprietario
              </span>
            </div>

            <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight max-w-md">
              Acompanhe seus imoveis com
              <span className="block bg-gradient-to-r from-[#d4a556] to-[#e8c989] bg-clip-text text-transparent mt-1">
                clareza total.
              </span>
            </h1>
            <p className="mt-4 text-white/60 text-sm max-w-md leading-relaxed">
              Acesso exclusivo para proprietarios da Somma Imoveis —
              acompanhe contratos, pagamentos e relatorios sem precisar
              ligar.
            </p>
          </div>

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

          <div className="flex items-center justify-between text-xs text-white/40">
            <span>&copy; {new Date().getFullYear()} Somma Imoveis</span>
            <span>Todos os direitos reservados</span>
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="relative flex flex-1 items-center justify-center bg-[#fafaf8] p-6 lg:p-10">
        <div className="absolute top-0 right-0 h-80 w-80 rounded-full bg-[#d4a556] opacity-[0.04] blur-3xl" />
        <div className="absolute bottom-0 left-0 h-80 w-80 rounded-full bg-[#2d6b45] opacity-[0.04] blur-3xl" />

        <div className="relative w-full max-w-md">
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
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#d4a556]/15 to-[#d4a556]/5 border border-[#d4a556]/15 mb-3">
                <Building2 className="h-5 w-5 text-[#d4a556]" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[#0a1a0f]">
                Portal do Proprietario
              </h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                Acesse com seu email e senha (ou token inicial)
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-3 rounded-lg text-center animate-in fade-in slide-in-from-top-1 duration-200">
                {error}
              </div>
            )}

            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="identifier" className="text-xs font-semibold text-[#0a1a0f] tracking-wide uppercase">
                  Email ou CPF/CNPJ
                </Label>
                <Input
                  id="identifier"
                  name="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="seu@email.com ou 000.000.000-00"
                  required
                  autoComplete="username"
                  className="h-11 bg-[#fafaf8] border-black/[0.08] focus-visible:border-[#2d6b45] focus-visible:ring-[#2d6b45]/15"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="secret" className="text-xs font-semibold text-[#0a1a0f] tracking-wide uppercase">
                  Senha ou Token
                </Label>
                <div className="relative">
                  <Input
                    id="secret"
                    name="secret"
                    type={showSecret ? "text" : "password"}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="Digite sua senha ou token de acesso"
                    required
                    autoComplete="current-password"
                    className="h-11 pr-10 bg-[#fafaf8] border-black/[0.08] focus-visible:border-[#2d6b45] focus-visible:ring-[#2d6b45]/15"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-[#0a1a0f] transition-colors"
                    aria-label={showSecret ? "Ocultar" : "Mostrar"}
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Primeiro acesso? Use o <strong>token</strong> fornecido pela Somma.
                  Depois voce podera definir sua senha.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-semibold bg-gradient-to-r from-[#1f4a30] to-[#2d6b45] hover:from-[#2d6b45] hover:to-[#3d8559] text-white shadow-md shadow-[#1f4a30]/20 transition-all mt-2"
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

            <div className="flex flex-col items-center gap-3 pt-2 border-t border-border/60">
              <p className="text-xs text-muted-foreground/70 text-center pt-3">
                Nao recebeu o token?{" "}
                <a
                  href="mailto:contato@sommaimob.com.br"
                  className="text-[#2d6b45] hover:underline underline-offset-2 font-medium"
                >
                  Fale com a Somma
                </a>
              </p>
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-[#2d6b45] transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Acessar area administrativa
              </Link>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground/60 mt-6">
            Protegido com criptografia de ponta a ponta
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p>Carregando...</p></div>}>
      <PortalLoginContent />
    </Suspense>
  );
}
