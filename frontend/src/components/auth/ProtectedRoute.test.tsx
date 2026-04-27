import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";

import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  roleMatches: (currentRole: string, requiredRole: string) =>
    String(currentRole).toUpperCase() === String(requiredRole).toUpperCase(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function renderProtected(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["ADMIN", "DISPATCHER"]} redirectTo="/admin/login">
              <div>admin-content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/admin/login" element={<div>admin-login</div>} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_ADMIN_AUTH_DISABLED", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to admin login", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      setSession: vi.fn(),
      accessToken: null,
    });

    renderProtected("/admin");
    expect(screen.getByText("admin-login")).toBeInTheDocument();
  });

  it("allows admin page access when admin auth bypass is enabled", () => {
    vi.stubEnv("VITE_ADMIN_AUTH_DISABLED", "true");
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      setSession: vi.fn(),
      accessToken: null,
    });

    renderProtected("/admin");
    expect(screen.getByText("admin-content")).toBeInTheDocument();
  });

  it("redirects authenticated users with wrong role to home", () => {
    mockedUseAuth.mockReturnValue({
      user: { id: "u-1", role: "PASSENGER" },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      setSession: vi.fn(),
      accessToken: "token",
    });

    renderProtected("/admin");
    expect(screen.getByText("home")).toBeInTheDocument();
  });
});
