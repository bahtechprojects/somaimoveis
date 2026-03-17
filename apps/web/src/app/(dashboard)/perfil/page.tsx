"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  Save,
  Loader2,
  CheckCircle2,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  avatarUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function getRoleBadge(role: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    ADMIN: { label: "Administrador", variant: "default" },
    CORRETOR: { label: "Corretor", variant: "secondary" },
    FINANCEIRO: { label: "Financeiro", variant: "outline" },
  };
  const config = map[role] || { label: role, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function getPasswordStrength(password: string): { label: string; color: string; percent: number } {
  if (!password) return { label: "", color: "bg-muted", percent: 0 };

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { label: "Fraca", color: "bg-red-500", percent: 33 };
  if (score <= 3) return { label: "Media", color: "bg-yellow-500", percent: 66 };
  return { label: "Forte", color: "bg-green-500", percent: 100 };
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function PerfilPage() {
  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // ── Fetch profile ───────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me");
      if (!res.ok) throw new Error("Erro ao carregar perfil");
      const data: UserProfile = await res.json();
      setProfile(data);
      setName(data.name);
      setEmail(data.email);
      setPhone(data.phone || "");
    } catch {
      setProfileError("Erro ao carregar dados do perfil");
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Save profile ────────────────────────────────────────────────────────────

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError("");
    setProfileSuccess(false);

    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar");
      }

      const updated: UserProfile = await res.json();
      setProfile(updated);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Change password ─────────────────────────────────────────────────────────

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError("");
    setPasswordSuccess(false);

    try {
      const res = await fetch("/api/users/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao alterar senha");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  // ── Password strength ───────────────────────────────────────────────────────

  const strength = getPasswordStrength(newPassword);

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loadingProfile) {
    return (
      <>
        <Header title="Meu Perfil" subtitle="Gerencie suas informacoes pessoais" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Header title="Meu Perfil" subtitle="Gerencie suas informacoes pessoais" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Profile Card ─────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">
                    {profile ? getInitials(profile.name) : "??"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-xl">Informacoes Pessoais</CardTitle>
                  <CardDescription>
                    Atualize seus dados de perfil
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                {/* Role & member since */}
                <div className="flex items-center gap-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Cargo:</span>
                    {profile && getRoleBadge(profile.role)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Membro desde {profile ? formatDate(profile.createdAt) : "..."}
                    </span>
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Nome
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome completo"
                    required
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                  />
                </div>

                {/* Messages */}
                {profileError && (
                  <p className="text-sm text-destructive">{profileError}</p>
                )}
                {profileSuccess && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Perfil atualizado com sucesso!
                  </p>
                )}

                {/* Submit */}
                <Button type="submit" disabled={savingProfile} className="w-full">
                  {savingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Alteracoes
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* ── Password Card ────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-xl">Alterar Senha</CardTitle>
                  <CardDescription>
                    Mantenha sua conta segura
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                {/* Current password */}
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Senha Atual</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Digite sua senha atual"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowCurrent(!showCurrent)}
                    >
                      {showCurrent ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* New password */}
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimo 6 caracteres"
                      required
                      minLength={6}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowNew(!showNew)}
                    >
                      {showNew ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {/* Strength indicator */}
                  {newPassword && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Forca da senha
                        </span>
                        <span className="text-xs font-medium">{strength.label}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                          style={{ width: `${strength.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      required
                      minLength={6}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowConfirm(!showConfirm)}
                    >
                      {showConfirm ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">
                      As senhas nao coincidem
                    </p>
                  )}
                </div>

                {/* Messages */}
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Senha alterada com sucesso!
                  </p>
                )}

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                  className="w-full"
                >
                  {savingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  Alterar Senha
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
