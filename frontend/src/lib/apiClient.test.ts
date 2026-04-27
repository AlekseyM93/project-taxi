import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./apiClient";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries once on 5xx and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "temporary" }, 500))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest<{ ok: boolean }>("/ops/health/live", {
      retries: 1,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("refreshes access token on 401 and retries original request", async () => {
    localStorage.setItem(
      "taxi_user",
      JSON.stringify({
        id: "u-1",
        role: "PASSENGER",
        accessToken: "old-access",
        refreshToken: "refresh-token",
      }),
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "new-access", refreshToken: "refresh-2" }, 200),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const response = await apiRequest<{ ok: boolean }>("/orders/me/passenger/active", {
      token: "old-access",
      retries: 1,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/orders/me/passenger/active");
    expect(
      (fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> })?.headers
        ?.authorization,
    ).toBe("Bearer old-access");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/auth/refresh");
    expect(
      (fetchMock.mock.calls[2]?.[1] as { headers?: Record<string, string> })?.headers
        ?.authorization,
    ).toBe("Bearer new-access");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const storedUser = JSON.parse(localStorage.getItem("taxi_user") || "{}") as {
      accessToken?: string;
      refreshToken?: string;
    };
    expect(storedUser.accessToken).toBe("new-access");
    expect(storedUser.refreshToken).toBe("refresh-2");
  });
});
