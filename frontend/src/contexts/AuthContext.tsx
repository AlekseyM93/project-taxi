import { createContext, useContext, useState, useEffect, ReactNode } from "react";

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
  }) => void;
  logout: () => void;
  isAuthenticated: boolean;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

function normalizeRole(role: UserRole): UserRole {
  if (role === "passenger") return "PASSENGER";
  if (role === "driver") return "DRIVER";
  if (role === "admin") return "ADMIN";
  return role;
}

export function roleMatches(currentRole: UserRole, requiredRole: UserRole): boolean {
  return normalizeRole(currentRole) === normalizeRole(requiredRole);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem("taxi_user");
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("taxi_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("taxi_user");
    }
  }, [user]);

  const login = (u: AuthUser) => setUser(u);
  const setSession = (params: {
    userId: string;
    role: UserRole;
    phone?: string;
    name?: string;
    accessToken: string;
  }) => {
    setUser({
      id: params.userId,
      role: params.role,
      phone: params.phone,
      name: params.name,
      accessToken: params.accessToken,
    });
  };
  const logout = () => setUser(null);

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
