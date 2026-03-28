import { vi } from "vitest";
import { getServerSession } from "next-auth";

const mockedGetServerSession = vi.mocked(getServerSession);

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function mockSession(user: Partial<MockUser> = {}) {
  const defaultUser: MockUser = {
    id: "user-1",
    email: "admin@somma.com",
    name: "Admin",
    role: "ADMIN",
    ...user,
  };

  mockedGetServerSession.mockResolvedValue({
    user: defaultUser,
    expires: new Date(Date.now() + 86400000).toISOString(),
  });

  return defaultUser;
}

export function mockNoSession() {
  mockedGetServerSession.mockResolvedValue(null);
}
