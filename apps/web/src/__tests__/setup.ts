import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    owner: { findMany: vi.fn(), update: vi.fn() },
    tenant: { findMany: vi.fn(), update: vi.fn() },
    property: { findMany: vi.fn(), findUnique: vi.fn() },
    contract: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    payment: { findFirst: vi.fn(), update: vi.fn() },
    passwordResetToken: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));
