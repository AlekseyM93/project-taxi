import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  getOpsSummary,
  getOpsPaymentsSecurity,
  getOpsPaymentsSecurityPolicyAudit,
  upsertOpsPaymentsSecurityPolicy,
} from "./adminApi";
import { apiRequest } from "@/lib/apiClient";

vi.mock("@/lib/apiClient", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("adminApi critical endpoints", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedApiRequest.mockResolvedValue({
      status: 200,
      body: {},
      headers: new Headers(),
    });
  });

  it("builds ops summary request with query params", async () => {
    await getOpsSummary("token-1", "windowMinutes=60");
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/ops/dashboard/summary?windowMinutes=60",
      { token: "token-1" },
    );
  });

  it("builds payments security request with query params", async () => {
    await getOpsPaymentsSecurity("token-2", "windowMinutes=15");
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/ops/dashboard/payments-security?windowMinutes=15",
      { token: "token-2" },
    );
  });

  it("builds policy audit request with query params", async () => {
    await getOpsPaymentsSecurityPolicyAudit("token-3", "limit=100");
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/ops/dashboard/payments-security/policies/audit?limit=100",
      { token: "token-3" },
    );
  });

  it("posts policy upsert with no retries", async () => {
    const body = {
      ruleCode: "payment-webhook-reject-rate",
      threshold: "5",
      comparator: "GTE",
    };
    await upsertOpsPaymentsSecurityPolicy("token-4", body);
    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/ops/dashboard/payments-security/policies",
      {
        method: "POST",
        token: "token-4",
        body,
        retries: 0,
      },
    );
  });
});
