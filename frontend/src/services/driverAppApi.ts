import { apiRequest } from "@/lib/apiClient";

export function getDriverOrders(token: string, params?: string) {
  return apiRequest<{ items?: Array<Record<string, unknown>> }>(
    `/orders/me/driver${params ? `?${params}` : ""}`,
    {
      token,
    },
  );
}

export function getDriverActiveOrderCard(token: string) {
  return apiRequest<Record<string, unknown>>("/orders/me/driver/active/card", {
    token,
  });
}

export function acceptDriverOrder(token: string, orderId: string) {
  return apiRequest<Record<string, unknown>>(
    `/orders/me/driver/${orderId}/accept`,
    {
      method: "POST",
      token,
      retries: 0,
    },
  );
}

export function startDriverOrder(token: string, orderId: string) {
  return apiRequest<Record<string, unknown>>(
    `/orders/me/driver/${orderId}/start`,
    {
      method: "POST",
      token,
      retries: 0,
    },
  );
}

export function finishDriverOrder(token: string, orderId: string) {
  return apiRequest<Record<string, unknown>>(
    `/orders/me/driver/${orderId}/finish`,
    {
      method: "POST",
      token,
      retries: 0,
    },
  );
}

export function cancelDriverOrder(token: string, orderId: string) {
  return apiRequest<Record<string, unknown>>(
    `/orders/me/driver/${orderId}/cancel`,
    {
      method: "POST",
      token,
      retries: 0,
    },
  );
}

export function getDriverEarningsSummary(token: string) {
  return apiRequest<{
    totals?: { totalRub?: number; completedTrips?: number };
    items?: Array<Record<string, unknown>>;
  }>("/drivers/me/earnings/summary", {
    token,
  });
}

export function getDriverProfile(token: string) {
  return apiRequest<Record<string, unknown>>("/drivers/me/profile", {
    token,
  });
}

export function updateDriverProfile(
  token: string,
  body: Record<string, unknown>,
) {
  return apiRequest<Record<string, unknown>>("/drivers/me/profile", {
    method: "PATCH",
    token,
    body,
    retries: 0,
  });
}

export function getDriverVehicles(token: string) {
  return apiRequest<Array<Record<string, unknown>>>("/drivers/me/vehicles", {
    token,
  });
}

export function estimateDriverGeoRoute(
  token: string,
  body: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
  },
) {
  return apiRequest<{
    provider: string;
    distanceKm?: number;
    estimatedDurationMin?: number;
    fallbackUsed?: boolean;
  }>("/geo/route-estimate", {
    method: "POST",
    token,
    body,
    retries: 0,
  });
}
