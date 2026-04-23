"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  KeyRound,
  UserX,
  UserCheck,
  UsersRound,
  UserCheck2,
  UserMinus,
  Trash2,
} from "lucide-react";
import {
  ROLE_LABELS,
  getUserRoles,
  PAGES,
  DEFAULT_PAGES_BY_ROLE,
  getUserCustomPermissions,
} from "@/lib/rbac";
import { Checkbox } from "@/components/ui/checkbox";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string | null;
  phone: string | null;
  avatarUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Create/Edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "CORRETOR",
    phone: "",
  });
  const [customPermissionsEnabled, setCustomPermissionsEnabled] = useState(false);
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Reset password dialog
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Activate/Deactivate dialog
  const [toggleActiveOpen, setToggleActiveOpen] = useState(false);
  const [toggleActiveUser, setToggleActiveUser] = useState<User | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  // Hard delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all")
        params.set("active", statusFilter === "active" ? "true" : "false");

      const response = await fetch(`/api/users?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Erro ao buscar usuarios:", error);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Stats
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.active).length;
  const inactiveUsers = users.filter((u) => !u.active).length;

  // Handlers
  function handleNewUser() {
    setEditingUser(null);
    setFormData({ name: "", email: "", password: "", role: "CORRETOR", phone: "" });
    setCustomPermissionsEnabled(false);
    setCustomPermissions([]);
    setFormError("");
    setFormOpen(true);
  }

  function handleEditUser(user: User) {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      phone: user.phone || "",
    });
    const custom = getUserCustomPermissions(user.permissions);
    setCustomPermissionsEnabled(custom !== null);
    setCustomPermissions(custom || []);
    setFormError("");
    setFormOpen(true);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);

    try {
      const permissionsPayload = customPermissionsEnabled ? customPermissions : null;

      if (editingUser) {
        // Update
        const updateBody: Record<string, unknown> = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          phone: formData.phone || null,
          // null = usar default do role; array = custom
          permissions: permissionsPayload,
        };

        const response = await fetch(`/api/users/${editingUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody),
        });

        if (!response.ok) {
          const data = await response.json();
          setFormError(data.error || "Erro ao atualizar usuario");
          return;
        }
      } else {
        // Create
        if (!formData.password) {
          setFormError("Senha e obrigatoria para novos usuarios");
          return;
        }
        if (formData.password.length < 6) {
          setFormError("A senha deve ter pelo menos 6 caracteres");
          return;
        }

        const response = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            permissions: permissionsPayload,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          setFormError(data.error || "Erro ao criar usuario");
          return;
        }
      }

      setFormOpen(false);
      fetchUsers();
    } catch {
      setFormError("Erro de conexao. Tente novamente.");
    } finally {
      setFormLoading(false);
    }
  }

  function handleResetPassword(user: User) {
    setResetPasswordUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setResetError("");
    setResetPasswordOpen(true);
  }

  async function handleResetPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResetError("");

    if (!newPassword) {
      setResetError("Digite a nova senha");
      return;
    }
    if (newPassword.length < 6) {
      setResetError("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("As senhas nao conferem");
      return;
    }

    setResetLoading(true);
    try {
      const response = await fetch(`/api/users/${resetPasswordUser!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        setResetError(data.error || "Erro ao redefinir senha");
        return;
      }

      setResetPasswordOpen(false);
    } catch {
      setResetError("Erro de conexao. Tente novamente.");
    } finally {
      setResetLoading(false);
    }
  }

  function handleToggleActive(user: User) {
    setToggleActiveUser(user);
    setToggleActiveOpen(true);
  }

  function handleHardDelete(user: User) {
    setDeleteUser(user);
    setDeleteOpen(true);
  }

  async function handleHardDeleteConfirm() {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      const response = await fetch(`/api/users/${deleteUser.id}?hard=true`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || "Erro ao excluir usuario");
        return;
      }
      toast.success("Usuario excluido permanentemente");
      setDeleteOpen(false);
      fetchUsers();
    } catch {
      toast.error("Erro de conexao. Tente novamente.");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleToggleActiveConfirm() {
    if (!toggleActiveUser) return;
    setToggleLoading(true);

    try {
      if (toggleActiveUser.active) {
        // Deactivate
        const response = await fetch(`/api/users/${toggleActiveUser.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || "Erro ao desativar usuario");
          return;
        }
      } else {
        // Activate
        const response = await fetch(`/api/users/${toggleActiveUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        });
        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || "Erro ao ativar usuario");
          return;
        }
      }

      setToggleActiveOpen(false);
      fetchUsers();
    } catch {
      toast.error("Erro de conexao. Tente novamente.");
    } finally {
      setToggleLoading(false);
    }
  }

  function getRoleBadgeVariant(role: string) {
    switch (role) {
      case "ADMIN":
        return "destructive" as const;
      case "FINANCEIRO":
        return "outline" as const;
      default:
        return "default" as const;
    }
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Usuários"
        subtitle="Gerenciamento de usuários do sistema"
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Total Usuários",
              value: loading ? "..." : String(totalUsers),
              icon: UsersRound,
            },
            {
              label: "Ativos",
              value: loading ? "..." : String(activeUsers),
              icon: UserCheck2,
            },
            {
              label: "Inativos",
              value: loading ? "..." : String(inactiveUsers),
              icon: UserMinus,
            },
          ].map((stat) => (
            <Card key={stat.label} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-xl font-bold mt-1">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    className="pl-9 h-8 w-[240px] text-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os cargos</SelectItem>
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                    <SelectItem value="CORRETOR">Corretor</SelectItem>
                    <SelectItem value="FINANCEIRO">Financeiro</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={handleNewUser}
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Usuario
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">Carregando...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  {search || roleFilter !== "all" || statusFilter !== "all"
                    ? "Nenhum usuario encontrado para os filtros aplicados."
                    : "Nenhum usuario cadastrado."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Cargo</TableHead>
                    <TableHead className="text-xs">Telefone</TableHead>
                    <TableHead className="text-xs text-center">
                      Status
                    </TableHead>
                    <TableHead className="text-xs">Criado em</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">
                            {user.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {getUserRoles(user.role).map((r) => (
                            <Badge key={r} variant={getRoleBadgeVariant(r)}>
                              {ROLE_LABELS[r] || r}
                            </Badge>
                          ))}
                          {getUserRoles(user.role).length === 0 && (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.phone || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {user.active ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            Ativo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-red-50 text-red-700 border-red-200"
                          >
                            Inativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleEditUser(user)}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleResetPassword(user)}
                            >
                              <KeyRound className="h-3.5 w-3.5 mr-2" />
                              Redefinir Senha
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(user)}
                            >
                              {user.active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5 mr-2" />
                                  Desativar
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5 mr-2" />
                                  Ativar
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleHardDelete(user)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Excluir Permanentemente
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit User Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? "Editar Usuario" : "Novo Usuario"}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Atualize as informacoes do usuario."
                : "Preencha os dados para criar um novo usuario."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleFormSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Nome completo"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="email@exemplo.com"
                  required
                />
              </div>
              {!editingUser && (
                <div className="grid gap-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    placeholder="Minimo 6 caracteres"
                    required
                    minLength={6}
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label>Cargos (o usuario pode ter mais de um)</Label>
                <div className="space-y-2 rounded-md border p-3">
                  {(["ADMIN", "CORRETOR", "FINANCEIRO"] as const).map((r) => {
                    const currentRoles = getUserRoles(formData.role);
                    const checked = currentRoles.includes(r);
                    return (
                      <div key={r} className="flex items-center gap-2">
                        <Checkbox
                          id={`role-${r}`}
                          checked={checked}
                          onCheckedChange={(isChecked) => {
                            const next = new Set(currentRoles);
                            if (isChecked) next.add(r);
                            else next.delete(r);
                            const rolesArr = Array.from(next);
                            setFormData({
                              ...formData,
                              role: rolesArr.length ? rolesArr.join(",") : "",
                            });
                          }}
                        />
                        <Label htmlFor={`role-${r}`} className="text-sm font-normal cursor-pointer">
                          {ROLE_LABELS[r]}
                          {r === "FINANCEIRO" && (
                            <span className="text-xs text-muted-foreground ml-1">
                              (sem acesso a repasses/notas fiscais)
                            </span>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                </div>
                {!formData.role && (
                  <p className="text-xs text-destructive">
                    Selecione pelo menos um cargo.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="(00) 00000-0000"
                />
              </div>

              {/* Permissoes granulares por pagina */}
              {!getUserRoles(formData.role).includes("ADMIN") && (
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="custom-permissions-enabled"
                      checked={customPermissionsEnabled}
                      onCheckedChange={(checked) => {
                        const isChecked = !!checked;
                        setCustomPermissionsEnabled(isChecked);
                        if (isChecked && customPermissions.length === 0) {
                          // Pre-popular com defaults do role selecionado
                          const roles = getUserRoles(formData.role);
                          const defaults = new Set<string>();
                          roles.forEach((r) => {
                            (DEFAULT_PAGES_BY_ROLE[r] || []).forEach((p) =>
                              defaults.add(p)
                            );
                          });
                          setCustomPermissions(Array.from(defaults));
                        }
                      }}
                    />
                    <Label
                      htmlFor="custom-permissions-enabled"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Personalizar paginas que o usuario pode acessar
                    </Label>
                  </div>
                  {!customPermissionsEnabled && (
                    <p className="text-xs text-muted-foreground ml-6">
                      Usara o padrao do cargo selecionado.
                    </p>
                  )}
                  {customPermissionsEnabled && (
                    <div className="rounded-md border p-3 max-h-72 overflow-y-auto">
                      {Object.entries(
                        PAGES.reduce((acc, p) => {
                          if (!acc[p.group]) acc[p.group] = [];
                          acc[p.group].push(p);
                          return acc;
                        }, {} as Record<string, typeof PAGES>)
                      ).map(([group, pages]) => (
                        <div key={group} className="mb-3 last:mb-0">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                            {group}
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {pages.map((p) => (
                              <div key={p.key} className="flex items-center gap-2">
                                <Checkbox
                                  id={`perm-${p.key}`}
                                  checked={customPermissions.includes(p.key)}
                                  onCheckedChange={(checked) => {
                                    setCustomPermissions((prev) => {
                                      const set = new Set(prev);
                                      if (checked) set.add(p.key);
                                      else set.delete(p.key);
                                      return Array.from(set);
                                    });
                                  }}
                                />
                                <Label
                                  htmlFor={`perm-${p.key}`}
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {p.label}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div className="flex gap-2 mt-2 pt-2 border-t">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setCustomPermissions(PAGES.map((p) => p.key))}
                        >
                          Marcar todas
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setCustomPermissions([])}
                        >
                          Desmarcar todas
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading
                  ? "Salvando..."
                  : editingUser
                  ? "Salvar"
                  : "Criar Usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para{" "}
              <strong>{resetPasswordUser?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPasswordSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  required
                  minLength={6}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  required
                  minLength={6}
                />
              </div>
              {resetError && (
                <p className="text-sm text-destructive">{resetError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetPasswordOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? "Salvando..." : "Redefinir Senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Activate/Deactivate Confirmation */}
      <AlertDialog open={toggleActiveOpen} onOpenChange={setToggleActiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleActiveUser?.active
                ? "Desativar Usuario"
                : "Ativar Usuario"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleActiveUser?.active
                ? `Tem certeza que deseja desativar o usuario "${toggleActiveUser?.name}"? Ele nao podera mais acessar o sistema.`
                : `Deseja reativar o usuario "${toggleActiveUser?.name}"? Ele voltara a ter acesso ao sistema.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActiveConfirm}
              disabled={toggleLoading}
              className={
                toggleActiveUser?.active
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : ""
              }
            >
              {toggleLoading
                ? "Processando..."
                : toggleActiveUser?.active
                ? "Desativar"
                : "Ativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hard Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuario Permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja <strong>EXCLUIR</strong> o usuario{" "}
              <strong>{deleteUser?.name}</strong>? Esta acao nao pode ser
              desfeita. O usuario sera removido permanentemente do sistema.
              <br />
              <br />
              Se preferir, use <strong>Desativar</strong> para impedir o acesso
              mantendo o historico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHardDeleteConfirm}
              disabled={deleteLoading}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteLoading ? "Excluindo..." : "Excluir Permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
