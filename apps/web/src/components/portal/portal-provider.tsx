"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";

interface PortalOwner {
  id: string;
  name: string;
  email: string | null;
}

interface PortalContextType {
  token: string | null;
  owner: PortalOwner | null;
  login: (token: string, owner: PortalOwner) => void;
  logout: () => void;
  fetchPortal: (url: string, options?: RequestInit) => Promise<Response>;
  isLoading: boolean;
}

const PortalContext = createContext<PortalContextType | null>(null);

const STORAGE_KEY_TOKEN = "somma_portal_token";
const STORAGE_KEY_OWNER = "somma_portal_owner";

export function PortalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const [owner, setOwner] = useState<PortalOwner | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      const storedOwner = localStorage.getItem(STORAGE_KEY_OWNER);

      if (storedToken && storedOwner) {
        setToken(storedToken);
        setOwner(JSON.parse(storedOwner));
      }
    } catch {
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_OWNER);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Redirect to login if not authenticated (except on login page)
  useEffect(() => {
    if (isLoading) return;

    const isLoginPage = pathname === "/portal/login";

    if (!token && !isLoginPage) {
      router.replace("/portal/login");
    }
  }, [token, isLoading, pathname, router]);

  const login = useCallback(
    (newToken: string, newOwner: PortalOwner) => {
      setToken(newToken);
      setOwner(newOwner);
      localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
      localStorage.setItem(STORAGE_KEY_OWNER, JSON.stringify(newOwner));
    },
    []
  );

  const logout = useCallback(() => {
    setToken(null);
    setOwner(null);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_OWNER);
    router.replace("/portal/login");
  }, [router]);

  const fetchPortal = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      // If unauthorized, logout
      if (response.status === 401) {
        logout();
      }

      return response;
    },
    [token, logout]
  );

  return (
    <PortalContext.Provider
      value={{ token, owner, login, logout, fetchPortal, isLoading }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) {
    throw new Error("usePortal must be used within a PortalProvider");
  }
  return context;
}
