import { beforeEach, describe, expect, it, vi } from "vitest";

import { estimateDriverGeoRoute } from "./driverAppApi";
import { apiRequest } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("driverAppApi map endpoints", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({
      status: 200,
      body: {},
    });
  });

  it("posts route estimate payload for driver ETA widgets", async () => {
    const body = {
      fromLat: 55.761244,
      fromLng: 37.628423,
      toLat: 55.751244,
      toLng: 37.618423,
    };

    await estimateDriverGeoRoute("driver-token", body);

    expect(mockedApiRequest).toHaveBeenCalledWith("/geo/route-estimate", {
      method: "POST",
      token: "driver-token",
      body,
      retries: 0,
    });
  });
});
