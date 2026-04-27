import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { logoutSession } from "@/services/authApi";

export type UserRole =
  | "passenger"
  | "driver"
  | "admin"
  | "PASSENGER"
  | "DRIVER"
  | "ADMIN"
  | "DISPATCHER";

export interface AuthUser {
  id: string;
  role: UserRole;
  phone?: string;
  name?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  setSession: (params: {
    userId: string;
    role: UserRole;
    phone?: string;
    name?: string;
    accessToken: string;
    refreshToken?: string;
  }) => void;
  logout: () => void;
  isAuthenticated: boolean;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);
const AUTH_STORAGE_KEY = "taxi_user";
const AUTH_UPDATED_EVENT = "taxi-auth-updated";

function readStoredUser(): AuthUser | null {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as AuthUser) : null;
  } catch {
    return null;
  }
}

function normalizeRole(role: UserRole): UserRole {
  if (role === "passenger") return "PASSENGER";
  if (role === "driver") return "DRIVER";
  if (role === "admin") return "ADMIN";
  return role;
}

export function roleMatches(
  currentRole: UserRole,
  requiredRole: UserRole,
): boolean {
  return normalizeRole(currentRole) === normalizeRole(requiredRole);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    return readStoredUser();
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  useEffect(() => {
    const syncFromStorage = () => setUser(readStoredUser());

    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_STORAGE_KEY) {
        syncFromStorage();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_UPDATED_EVENT, syncFromStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_UPDATED_EVENT, syncFromStorage);
    };
  }, []);

  const login = (u: AuthUser) => setUser(u);
  const setSession = (params: {
    userId: string;
    role: UserRole;
    phone?: string;
    name?: string;
    accessToken: string;
    refreshToken?: string;
  }) => {
    setUser({
      id: params.userId,
      role: params.role,
      phone: params.phone,
      name: params.name,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? null,
    });
  };
  const logout = () => {
    if (user?.accessToken) {
      void logoutSession({
        accessToken: user.accessToken,
        refreshToken: user.refreshToken ?? null,
      });
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        setSession,
        logout,
        isAuthenticated: !!user,
        accessToken: user?.accessToken ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
