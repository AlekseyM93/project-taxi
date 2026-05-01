import { apiRequest } from "@/lib/apiClient";

export type LoginResponse = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresInSec?: number;
  refreshTokenExpiresInSec?: number;
};

export type RegisterResponse = {
  id: string;
  /** Optional JWT pair returned after signup (same shape as login) for mobile clients. */
  role?: string;
  accessToken?: string;
  refreshToken?: string;
};

export async function loginByPhonePassword(params: {
  phone: string;
  password: string;
  mfaCode?: string;
}) {
  return apiRequest<LoginResponse | { message?: string }>("/auth/login", {
    method: "POST",
    body: params,
    retries: 0,
  });
}

export async function registerByPhonePassword(params: {
  phone: string;
  password: string;
  role: "PASSENGER" | "DRIVER";
}) {
  return apiRequest<RegisterResponse | { message?: string }>("/auth/register", {
    method: "POST",
    body: params,
    retries: 0,
  });
}

export async function refreshAccessToken(refreshToken: string) {
  return apiRequest<LoginResponse | { message?: string }>("/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    retries: 0,
  });
}

export async function logoutSession(params: {
  accessToken: string;
  refreshToken?: string | null;
}) {
  return apiRequest<{ ok: boolean } | { message?: string }>("/auth/logout", {
    method: "POST",
    token: params.accessToken,
    body: {
      refreshToken: params.refreshToken ?? undefined,
    },
    retries: 0,
  });
}
