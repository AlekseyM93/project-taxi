import { beforeEach, describe, expect, it, vi } from "vitest";

import { estimateGeoRoute, reverseGeocodePoint } from "./passengerApi";
import { apiRequest } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("passengerApi map endpoints", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({
      status: 200,
      body: {},
    });
  });

  it("posts reverse geocode payload to geo endpoint", async () => {
    const body = { lat: 55.751244, lng: 37.618423 };
    await reverseGeocodePoint("passenger-token", body);

    expect(mockedApiRequest).toHaveBeenCalledWith("/geo/reverse", {
      method: "POST",
      token: "passenger-token",
      body,
      retries: 0,
    });
  });

  it("posts route estimate payload for map widget preview", async () => {
    const body = {
      fromLat: 55.751244,
      fromLng: 37.618423,
      toLat: 55.761244,
      toLng: 37.628423,
    };
    await estimateGeoRoute("passenger-token", body);

    expect(mockedApiRequest).toHaveBeenCalledWith("/geo/route-estimate", {
      method: "POST",
      token: "passenger-token",
      body,
      retries: 0,
    });
  });
});
