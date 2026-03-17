export const ROLES = {
  ADMIN: "ADMIN",
  CORRETOR: "CORRETOR",
  FINANCEIRO: "FINANCEIRO",
} as const;

export type Role = keyof typeof ROLES;

// Define permissions per role
const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ["*"], // full access
  CORRETOR: [
    "dashboard:view",
    "properties:view",
    "properties:create",
    "properties:edit",
    "owners:view",
    "owners:create",
    "owners:edit",
    "tenants:view",
    "tenants:create",
    "tenants:edit",
    "contracts:view",
    "contracts:create",
    "contracts:edit",
    "payments:view",
    "reports:view",
    "notifications:view",
    "profile:view",
    "profile:edit",
  ],
  FINANCEIRO: [
    "dashboard:view",
    "properties:view",
    "owners:view",
    "tenants:view",
    "contracts:view",
    "payments:view",
    "payments:create",
    "payments:edit",
    "reports:view",
    "reports:create",
    "notifications:view",
    "notifications:send",
    "profile:view",
    "profile:edit",
  ],
};

export function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

export function isAdmin(role: string): boolean {
  return role === ROLES.ADMIN;
}

// Role display names
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  CORRETOR: "Corretor",
  FINANCEIRO: "Financeiro",
};

// Sidebar items visible per role (restrict "Configuracoes" and "Usuarios" to ADMIN)
export const RESTRICTED_ROUTES: Record<string, string[]> = {
  "/configuracoes": ["ADMIN"],
  "/usuarios": ["ADMIN"],
};

export function canAccessRoute(role: string, pathname: string): boolean {
  const restriction = Object.entries(RESTRICTED_ROUTES).find(([route]) =>
    pathname.startsWith(route)
  );
  if (!restriction) return true; // unrestricted route
  return restriction[1].includes(role) || role === "ADMIN";
}
