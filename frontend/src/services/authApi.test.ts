import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loginByPhonePassword,
  logoutSession,
  refreshAccessToken,
  registerByPhonePassword,
} from "./authApi";
import { apiRequest } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("authApi", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({
      status: 200,
      body: {},
    });
  });

  it("builds login request payload without retries", async () => {
    await loginByPhonePassword({
      phone: "+79990000000",
      password: "secret",
      mfaCode: "123456",
    });

    expect(mockedApiRequest).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: {
        phone: "+79990000000",
        password: "secret",
        mfaCode: "123456",
      },
      retries: 0,
    });
  });

  it("builds register request payload without retries", async () => {
    await registerByPhonePassword({
      phone: "+79991112233",
      password: "secret",
      role: "PASSENGER",
    });

    expect(mockedApiRequest).toHaveBeenCalledWith("/auth/register", {
      method: "POST",
      body: {
        phone: "+79991112233",
        password: "secret",
        role: "PASSENGER",
      },
      retries: 0,
    });
  });

  it("builds refresh request with refresh token", async () => {
    await refreshAccessToken("refresh-1");

    expect(mockedApiRequest).toHaveBeenCalledWith("/auth/refresh", {
      method: "POST",
      body: {
        refreshToken: "refresh-1",
      },
      retries: 0,
    });
  });

  it("builds logout request with auth token and optional refresh token", async () => {
    await logoutSession({
      accessToken: "access-1",
      refreshToken: "refresh-2",
    });

    expect(mockedApiRequest).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
      token: "access-1",
      body: {
        refreshToken: "refresh-2",
      },
      retries: 0,
    });
  });
});
